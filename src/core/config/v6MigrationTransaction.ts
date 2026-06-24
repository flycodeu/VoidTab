import type {KVStorage} from '../storage/types.ts';
import {storage as defaultStorage} from '../storage/index.ts';
import type {ConfigBase, ConfigV5, ConfigV6} from './types.ts';
import {CONFIG_KEY, CONFIG_V5_BACKUP_PREFIX} from './keys.ts';
import {migrateV5ToV6, type V5ToV6MigrationOptions, type V5ToV6MigrationWarning} from './migrateV5ToV6.ts';
import {normalizeConfigV6, validateConfigForSaveV6} from './v6.ts';
import {sealSensitiveConfigForStorage} from './sensitive.ts';
import {ConfigSchemaValidationError} from './validate.ts';
import {markConfigV6SyncSchemaUpgradePending} from './syncSchemaUpgrade.ts';

export interface ConfigV5BackupRecord {
    format: 1;
    backedUpAt: number;
    sourceVersion: 5;
    /** Sensitive fields are sealed before this record reaches local storage. */
    config: ConfigV5;
}

export interface V6MigrationTransactionOptions extends V5ToV6MigrationOptions {
    /** Optional explicit key used by tests or a future recovery UI. */
    backupKey?: string;
}

export interface V6MigrationTransactionResult {
    config: ConfigV6;
    backupKey: string;
    warnings: V5ToV6MigrationWarning[];
}

type SealConfig = <T extends ConfigBase>(config: T) => Promise<T>;

export interface V6MigrationTransactionDependencies {
    storage: Pick<KVStorage, 'get' | 'set'>;
    seal: SealConfig;
    migrate: typeof migrateV5ToV6;
    normalize: typeof normalizeConfigV6;
    validate: typeof validateConfigForSaveV6;
}

export class ConfigV6MigrationTransactionError extends Error {
    constructor(
        readonly phase: 'backup' | 'migrate' | 'commit' | 'rollback',
        readonly backupKey: string,
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'ConfigV6MigrationTransactionError';
    }
}

const defaults: V6MigrationTransactionDependencies = {
    storage: defaultStorage,
    seal: sealSensitiveConfigForStorage,
    migrate: migrateV5ToV6,
    normalize: normalizeConfigV6,
    validate: validateConfigForSaveV6,
};

const resolveDependencies = (overrides?: Partial<V6MigrationTransactionDependencies>): V6MigrationTransactionDependencies => ({
    ...defaults,
    ...overrides,
});

export function createConfigV5BackupKey(options: Pick<V6MigrationTransactionOptions, 'deviceId' | 'migratedAt'>) {
    const timestamp = Math.round(options.migratedAt);
    const device = encodeURIComponent(options.deviceId.trim() || 'unknown-device');
    return `${CONFIG_V5_BACKUP_PREFIX}${timestamp}:${device}`;
}

function assertV5Input(source: ConfigV5) {
    if (!source || source.version !== 5) {
        throw new ConfigV6MigrationTransactionError(
            'migrate',
            '',
            '迁移事务只接受已解密且已规范化的 v5 配置',
        );
    }
}

/**
 * Explicit two-phase v5 -> v6 storage transaction. It is intentionally not
 * wired into repository.load() until all v6 consumers are migrated.
 */
export async function commitConfigV5ToV6Migration(
    source: ConfigV5,
    options: V6MigrationTransactionOptions,
    overrides?: Partial<V6MigrationTransactionDependencies>,
): Promise<V6MigrationTransactionResult> {
    const deps = resolveDependencies(overrides);
    const backupKey = options.backupKey || createConfigV5BackupKey(options);
    assertV5Input(source);

    let backup: ConfigV5BackupRecord;
    try {
        backup = {
            format: 1,
            backedUpAt: Math.round(options.migratedAt),
            sourceVersion: 5,
            config: await deps.seal(source),
        };
        await deps.storage.set(backupKey, backup, 'local');
    } catch (error) {
        throw new ConfigV6MigrationTransactionError('backup', backupKey, '无法创建加密 v5 恢复快照', error);
    }

    let normalized: ConfigV6;
    let warnings: V5ToV6MigrationWarning[];
    try {
        const migrated = deps.migrate(source, options);
        normalized = markConfigV6SyncSchemaUpgradePending(deps.normalize(migrated.config));
        warnings = migrated.warnings;
        const validation = deps.validate(normalized);
        if (!validation.ok) throw new ConfigSchemaValidationError(validation);
    } catch (error) {
        throw new ConfigV6MigrationTransactionError('migrate', backupKey, 'v6 配置迁移或校验失败，已保留 v5 恢复快照', error);
    }

    try {
        const sealedV6 = await deps.seal(normalized);
        await deps.storage.set(CONFIG_KEY, sealedV6, 'local');
    } catch (error) {
        try {
            await deps.storage.set(CONFIG_KEY, backup.config, 'local');
        } catch (rollbackError) {
            throw new ConfigV6MigrationTransactionError(
                'rollback',
                backupKey,
                '写入 v6 失败且自动恢复主配置失败；请使用恢复快照手动恢复。',
                rollbackError,
            );
        }
        throw new ConfigV6MigrationTransactionError('commit', backupKey, '写入 v6 主配置失败，已恢复 v5 快照', error);
    }

    return {config: normalized, backupKey, warnings};
}

/** Explicit user-directed rollback; no v6 -> v5 transformation is attempted. */
export async function restoreConfigV5Backup(
    backupKey: string,
    overrides?: Partial<Pick<V6MigrationTransactionDependencies, 'storage'>>,
): Promise<ConfigV5BackupRecord> {
    const deps = resolveDependencies(overrides);
    const backup = await deps.storage.get<ConfigV5BackupRecord | null>(backupKey, null, 'local');
    if (!backup || backup.format !== 1 || backup.sourceVersion !== 5 || backup.config?.version !== 5) {
        throw new ConfigV6MigrationTransactionError('rollback', backupKey, '找不到有效的 v5 恢复快照');
    }
    await deps.storage.set(CONFIG_KEY, backup.config, 'local');
    return backup;
}
