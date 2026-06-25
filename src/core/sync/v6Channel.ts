import type {ConfigV6} from '../config/types.ts';
import {preflightConfigForReader} from '../config/preflight.ts';
import {normalizeConfigV6, validateConfigForSaveV6} from '../config/v6.ts';
import {stripSensitiveConfigForSync} from '../config/sensitive.ts';
import {isV6SyncWriteAuthorized} from '../config/syncSchemaUpgrade.ts';
import type {TileInstallIntent, TileInstallRecord} from '../tiles/contracts.ts';
import {createRestoredTileInstallsFromIntents, createTileInstallIntents} from '../tiles/packageStore.ts';
import type {SyncFileOptions, SyncOpResult, SyncProfile} from './types.ts';
import {createSyncRecoveryRecords} from './recovery.ts';

export const V6_CONFIG_VERSION = 6 as const;
export const V6_MIN_READER_VERSION = 6 as const;

export type ConfigV6SyncExport = Omit<ConfigV6, 'runtime' | 'tileInstalls'> & {
    minReaderVersion: typeof V6_MIN_READER_VERSION;
    tileInstallIntents?: Record<string, TileInstallIntent>;
};

function omitDeviceLocalSyncMetadata(profile: SyncProfile): SyncProfile {
    const copy: any = {...profile};
    delete copy.lastSyncedHash;
    delete copy.conflictState;
    delete copy.conflictSnapshot;
    delete copy.syncSchemaUpgradePending;
    delete copy.syncSchemaChannel;
    delete copy.recoveryRecords;
    return copy as SyncProfile;
}

/** `backup.json` -> `backup.v6.json`; a v6 filename is idempotent. */
export function getV6SiblingFilename(filename: string): string {
    const input = filename.trim();
    const fallback = 'voidtab-backup.json';
    const source = input || fallback;
    if (/\.v6\.json$/i.test(source)) return source;
    if (/\.json$/i.test(source)) return source.replace(/\.json$/i, '.v6.json');
    return `${source}.v6.json`;
}

export function getV6SiblingFileOptions(profile: SyncProfile): SyncFileOptions | undefined {
    if (profile.provider !== 'webdav') return undefined;
    return {filename: getV6SiblingFilename(profile.filename)};
}

/**
 * Packages, grants and runtime caches are intentionally local. The receiving
 * device recreates its install registry and decides permissions itself.
 */
export function createConfigV6SyncExport(config: ConfigV6): ConfigV6SyncExport {
    const sanitized = stripSensitiveConfigForSync(config);
    const {runtime: _runtime, tileInstalls: _tileInstalls, ...portable} = sanitized;
    const tileInstallIntents = createTileInstallIntents(config.tileInstalls);
    return {
        ...portable,
        version: V6_CONFIG_VERSION,
        minReaderVersion: V6_MIN_READER_VERSION,
        ...(Object.keys(tileInstallIntents).length ? {tileInstallIntents} : {}),
        sync: omitDeviceLocalSyncMetadata(portable.sync),
    };
}

export function buildConfigV6SyncPayload(config: ConfigV6): string {
    return JSON.stringify(createConfigV6SyncExport(config));
}

/**
 * Rebuilds a local-only install registry while refusing malformed or future
 * exports before v6 normalization can touch them.
 */
export function restoreConfigV6FromSyncExport(
    raw: unknown,
    options: {
        existingInstalls?: Record<string, TileInstallRecord>;
        now?: number;
    } = {},
): ConfigV6 {
    const preflight = preflightConfigForReader(raw, V6_CONFIG_VERSION);
    if (preflight.version !== V6_CONFIG_VERSION) {
        throw new TypeError(`v6 同步文件版本无效：${preflight.version}`);
    }
    const restoredInstalls = createRestoredTileInstallsFromIntents(
        (raw as Record<string, unknown>).tileInstallIntents,
        options.existingInstalls || {},
        options.now,
    );

    const normalized = normalizeConfigV6({
        ...(raw as Record<string, unknown>),
        version: V6_CONFIG_VERSION,
        tileInstalls: restoredInstalls,
    });
    const validation = validateConfigForSaveV6(normalized);
    if (!validation.ok) throw new TypeError(validation.errors[0] || 'v6 同步文件结构无效');
    return normalized;
}

export function restoreConfigV6FromSyncExportWithReport(
    raw: unknown,
    options: {
        existingInstalls?: Record<string, TileInstallRecord>;
        now?: number;
    } = {},
) {
    const config = restoreConfigV6FromSyncExport(raw, options);
    const recoveryRecords = createSyncRecoveryRecords(config, {now: options.now});
    config.sync.recoveryRecords = recoveryRecords;
    return {config, recoveryRecords};
}

export interface V6SyncUploader {
    upload(profile: SyncProfile, payload: string, options?: SyncFileOptions): Promise<SyncOpResult>;
}

/** Writes only after confirmation, and only to the v6 sibling filename. */
export async function uploadConfigV6ToSibling(
    service: V6SyncUploader,
    profile: SyncProfile,
    config: ConfigV6,
): Promise<SyncOpResult> {
    if (!isV6SyncWriteAuthorized(profile)) {
        return {ok: false, message: 'v6 同步尚未确认；旧 WebDAV 文件保持只读恢复源'};
    }

    const options = getV6SiblingFileOptions(profile);
    if (!options) return {ok: false, message: '当前同步提供方不支持 v6 sibling 文件'};
    return service.upload(profile, buildConfigV6SyncPayload(config), options);
}
