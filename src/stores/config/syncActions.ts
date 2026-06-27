import {ref} from 'vue';
import type {Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';
import {isConfigV6, normalizeConfigV6} from '../../core/config/v6.ts';
import {migrateV5ToV6} from '../../core/config/migrateV5ToV6.ts';
import {getStableConfigDeviceId} from '../../core/config/deviceId.ts';
import {mergeLocalSensitiveFields} from '../../core/config/sensitive';
import {isConfigVersionTooNew, preflightConfigForReader} from '../../core/config/preflight';
import {isV6SyncWriteAuthorized} from '../../core/config/syncSchemaUpgrade.ts';
import {validateImportedConfig} from '../../core/config/validate';
import {SyncScheduler, syncService} from '../../core/sync';
import {
    buildConfigV6SyncPayload,
    getV6SiblingFileOptions,
    mergeConfigV6SyncExportWithLocal,
    restoreConfigV6FromSyncExportWithReport,
    uploadConfigV6ToSibling,
} from '../../core/sync/v6Channel.ts';
import {hydrateTileInstallsFromRepository} from '../../core/tiles/packageRepository.ts';
import {
    ignoreSyncRecoveryRecord as ignoreSyncRecoveryRecordCore,
    resolveSyncRecoveryRecord as resolveSyncRecoveryRecordCore,
} from '../../core/sync/recovery.ts';
import type {TileInstallRecord} from '../../core/tiles/contracts.ts';
import type {ConflictSnapshot, SyncConflictState} from '../../core/sync/types';
import {hashConfig} from '../../core/sync/hash';
import {buildConflictSummary} from '../../core/sync/conflictSummary';
import {useToast} from '../../shared/composables/useToast';
import {measurePerformanceAsync} from '../../shared/utils/performance';

type SyncActionDeps = {
    config: Ref<ConfigV6>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    normalizeLayoutItems: () => void;
    saveConfig: () => Promise<void>;
};

const normalizeRuntimeConfig = (raw: unknown): ConfigV6 => {
    const migrated = migrateConfig(raw);
    if (isConfigV6(migrated)) return normalizeConfigV6(migrated);
    return normalizeConfigV6(migrateV5ToV6(normalizeConfig(migrated), {
        deviceId: getStableConfigDeviceId(),
        migratedAt: Date.now(),
    }).config);
};

const isV6WirePayload = (raw: unknown): raw is {version: 6} =>
    !!raw && typeof raw === 'object' && (raw as {version?: unknown}).version === 6;

/**
 * v6 exports deliberately omit tileInstalls, so their wire payload is not a
 * full ConfigV6 until the local-only registry has been rebuilt. Keep that
 * distinction at the import boundary instead of feeding it to v5 normalize.
 */
const normalizeRemoteConfig = (
    raw: unknown,
    existingInstalls: Record<string, TileInstallRecord> = {},
): ConfigV6 => {
    preflightConfigForReader(raw);
    if (isV6WirePayload(raw)) return restoreConfigV6FromSyncExportWithReport(raw, {
        existingInstalls,
        now: Date.now(),
    }).config;

    const validation = validateImportedConfig(raw);
    if (!validation.ok) throw new Error(validation.errors[0] || 'invalid sync payload');
    const next = normalizeRuntimeConfig(raw);
    next.tileInstalls = existingInstalls;
    return next;
};

const normalizeRemoteConfigWithRepository = async (
    raw: unknown,
    existingInstalls: Record<string, TileInstallRecord> = {},
): Promise<ConfigV6> => {
    const hydratedInstalls = await hydrateTileInstallsFromRepository(existingInstalls);
    return normalizeRemoteConfig(raw, hydratedInstalls);
};

export const buildSyncPayload = (cfg: ConfigV6) => {
    return buildConfigV6SyncPayload(cfg);
};

export const createSyncActions = ({
    config,
    applyingExternal,
    localRevision,
    normalizeLayoutItems,
    saveConfig,
}: SyncActionDeps) => {
    let scheduler: SyncScheduler | null = null;
    const toast = useToast();
    let lastSyncErrorToastAt = 0;

    // ── Conflict state (reactive, so UI can observe) ──────────────────────────
    const conflictState = ref<SyncConflictState>('none');
    const conflictSnapshot = ref<ConflictSnapshot | null>(null);

    const notifySyncWarning = (message: string) => {
        const now = Date.now();
        if (now - lastSyncErrorToastAt < 60_000) return;
        lastSyncErrorToastAt = now;
        toast.warning(message);
    };

    // ── Internal helpers ──────────────────────────────────────────────────────

    const applyRemoteConfig = (remoteConfig: ConfigV6) => {
        const next = mergeLocalSensitiveFields(remoteConfig, config.value);
        next.runtime = config.value.runtime;
        // Preserve device-local conflict/hash fields — do not overwrite with remote values.
        next.sync.lastSyncedHash = config.value.sync.lastSyncedHash;
        next.sync.syncSchemaUpgradePending = config.value.sync.syncSchemaUpgradePending;
        next.sync.syncSchemaChannel = config.value.sync.syncSchemaChannel;
        next.sync.syncCustomTiles = config.value.sync.syncCustomTiles;
        next.sync.recoveryRecords = next.sync.recoveryRecords || [];
        next.sync.conflictState = undefined;
        next.sync.conflictSnapshot = undefined;
        applyingExternal.value = true;
        config.value = next;
        normalizeLayoutItems();
        queueMicrotask(() => (applyingExternal.value = false));
        localRevision.value += 1;
    };

    const applyRemoteRaw = async (remoteText: string) => {
        const raw = JSON.parse(remoteText);
        applyRemoteConfig(await normalizeRemoteConfigWithRepository(raw, config.value.tileInstalls));
    };

    const tryApplyRevisionMerge = async (
        remoteText: string,
        meta: {etag?: string; mtime?: string},
    ) => {
        const raw = JSON.parse(remoteText);
        if (!isV6WirePayload(raw)) return false;
        const existingInstalls = await hydrateTileInstallsFromRepository(config.value.tileInstalls);
        const merged = mergeConfigV6SyncExportWithLocal(config.value, raw, {
            existingInstalls,
            now: Date.now(),
        });
        applyRemoteConfig(merged.config);
        if (meta.etag) config.value.sync.lastRemoteEtag = meta.etag;
        if (meta.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
        config.value.sync.lastSyncTime = Date.now();
        config.value.sync.recoveryRecords = merged.recoveryRecords;
        clearConflict();
        void saveConfig();
        toast.info(merged.recoveryRecords.length
            ? `已按 RevisionStamp 合并云端数据，并生成 ${merged.recoveryRecords.length} 条恢复记录`
            : '已按 RevisionStamp 自动合并云端数据');
        return true;
    };

    const recordSyncedHash = () => {
        config.value.sync.lastSyncedHash = hashConfig(config.value);
    };

    const clearConflict = () => {
        conflictState.value = 'none';
        conflictSnapshot.value = null;
        config.value.sync.conflictState = undefined;
        config.value.sync.conflictSnapshot = undefined;
    };

    // ── Scheduler setup ───────────────────────────────────────────────────────

    const startScheduler = () => {
        if (scheduler) return;

        scheduler = new SyncScheduler({
            // A just-migrated v6 profile must not auto-read or write the v5
            // file. Manual restore remains available until confirmation.
            getProfile: () => {
                const profile = config.value.sync;
                if (!isV6SyncWriteAuthorized(profile)) {
                    return {...profile, enabled: false};
                }
                return profile;
            },
            getFileOptions: () => getV6SiblingFileOptions(config.value.sync),
            getUploadPayload: () => buildSyncPayload(config.value),
            getLocalRevision: () => localRevision.value,
            getCurrentHash: () => hashConfig(config.value),
            getLastSyncedHash: () => config.value.sync.lastSyncedHash ?? '',

            onRemotePayload: async (remoteText, meta) => {
                try {
                    await applyRemoteRaw(remoteText);
                    // After clean auto-apply, update the synced hash baseline.
                    recordSyncedHash();
                    if (meta?.etag) config.value.sync.lastRemoteEtag = meta.etag;
                    if (meta?.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
                } catch (error) {
                    notifySyncWarning(isConfigVersionTooNew(error)
                        ? `云端备份需要 v${error.foundVersion} 客户端；本地数据未改动`
                        : '远端同步数据格式异常，已忽略本次更新');
                }
            },

            onConflictDetected: async (snapshot) => {
                try {
                    const merged = await tryApplyRevisionMerge(snapshot.remoteText, snapshot.remoteMeta);
                    if (merged) return true;
                } catch {
                    // Fall through to the explicit conflict UI below.
                }
                // Enrich scheduler's minimal snapshot with real summary data.
                try {
                    const remoteRaw = JSON.parse(snapshot.remoteText);
                    snapshot.summary = buildConflictSummary(config.value, remoteRaw);
                } catch {
                    // summary stays zeroed — conflict dialog still shows, just without counts
                }
                conflictSnapshot.value = snapshot;
                conflictState.value = 'detected';
                config.value.sync.conflictState = 'detected';
                config.value.sync.conflictSnapshot = snapshot;
                void saveConfig();
                return false;
            },

            onSyncMeta: (meta) => {
                config.value.sync.lastSyncTime = meta.lastSyncTime;
                if (meta.etag) config.value.sync.lastRemoteEtag = meta.etag;
                if (meta.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
                // Record hash after a successful upload so next tick can detect local-dirty correctly.
                recordSyncedHash();
                void saveConfig();
            },

            onError: () => notifySyncWarning('自动同步暂时不可用，稍后会自动重试'),
        });

        // Restore any conflict that persisted from a previous session.
        const savedState = config.value.sync.conflictState;
        const savedSnapshot = config.value.sync.conflictSnapshot;
        if ((savedState === 'detected' || savedState === 'pending') && savedSnapshot) {
            conflictState.value = savedState;
            conflictSnapshot.value = savedSnapshot;
        }

        scheduler.start();
    };

    // ── Conflict resolution actions (called by UI) ────────────────────────────

    /** User chose to keep local data and overwrite remote. */
    const resolveKeepLocal = async (): Promise<{ success: boolean; msg: string }> => {
        conflictState.value = 'resolving';
        const res = await uploadBackup();
        if (res.success) {
            recordSyncedHash();
            clearConflict();
            void saveConfig();
            // Resume scheduler after conflict is resolved.
            scheduler?.tick();
        } else {
            conflictState.value = 'detected';
        }
        return res;
    };

    /** User chose to discard local changes and apply remote data. */
    const resolveUseRemote = async (): Promise<{ success: boolean; msg: string }> => {
        const snapshot = conflictSnapshot.value;
        if (!snapshot) return {success: false, msg: '冲突快照丢失，请重新同步'};
        conflictState.value = 'resolving';
        try {
            await applyRemoteRaw(snapshot.remoteText);
            recordSyncedHash();
            if (snapshot.remoteMeta.etag) config.value.sync.lastRemoteEtag = snapshot.remoteMeta.etag;
            if (snapshot.remoteMeta.mtime) config.value.sync.lastRemoteMtime = snapshot.remoteMeta.mtime;
            config.value.sync.lastSyncTime = Date.now();
            clearConflict();
            void saveConfig();
            scheduler?.tick();
            return {success: true, msg: '已使用云端数据'};
        } catch {
            conflictState.value = 'detected';
            return {success: false, msg: '云端数据解析失败，请检查配置'};
        }
    };

    /** User chose to decide later — pause auto-sync, keep conflict badge visible. */
    const resolvePostpone = () => {
        conflictState.value = 'pending';
        config.value.sync.conflictState = 'pending';
        void saveConfig();
        toast.info('已暂停自动同步，请在同步设置中处理冲突');
    };

    // ── Standard backup actions ───────────────────────────────────────────────

    const testSyncConnection = async (profile?: ConfigV6['sync']) => {
        return await measurePerformanceAsync('config.sync.test', async () =>
            await syncService.test(profile ?? config.value.sync)
        );
    };

    const uploadBackup = async () => {
        return await measurePerformanceAsync('config.sync.upload', async () => {
            if (!isV6SyncWriteAuthorized(config.value.sync)) {
                const isPendingWebDav = config.value.sync.provider === 'webdav' && config.value.sync.enabled;
                return {
                    success: false,
                    msg: isPendingWebDav
                        ? 'v6 同步尚未确认；请先确认所有设备支持 v6。旧 WebDAV 文件仍可通过“恢复数据”只读恢复。'
                        : '请先启用 WebDAV 同步',
                };
            }
            const now = Date.now();
            const res = await uploadConfigV6ToSibling(syncService, config.value.sync, config.value);
            if (res.ok) {
                config.value.sync.lastSyncTime = now;
                if (res.remoteEtag) config.value.sync.lastRemoteEtag = res.remoteEtag;
                if (res.remoteMtime) config.value.sync.lastRemoteMtime = res.remoteMtime;
                void saveConfig();
                return {success: true, msg: res.message};
            }
            return {success: false, msg: res.message};
        });
    };

    const downloadBackup = async () => {
        return await measurePerformanceAsync('config.sync.download', async () => {
            const currentSync = {...config.value.sync};
            const currentRuntime = config.value.runtime;
            const v6WriteAuthorized = isV6SyncWriteAuthorized(config.value.sync);

            const fileOptions = v6WriteAuthorized ? getV6SiblingFileOptions(config.value.sync) : undefined;
            if (v6WriteAuthorized && !fileOptions) {
                return {success: false, msg: '当前同步提供方不支持 v6 sibling 文件'};
            }

            const res = await syncService.download(config.value.sync, fileOptions);
            if (!res.ok || !res.data) return {success: false, msg: res.message};

            try {
                const parsed = JSON.parse(res.data);
                const next = mergeLocalSensitiveFields(await normalizeRemoteConfigWithRepository(parsed, config.value.tileInstalls), config.value);
                next.runtime = currentRuntime;
                config.value = next;
                normalizeLayoutItems();

                config.value.sync = {...config.value.sync, ...currentSync};
                config.value.sync.recoveryRecords = next.sync.recoveryRecords || [];
                if (res.remoteEtag) config.value.sync.lastRemoteEtag = res.remoteEtag;
                if (res.remoteMtime) config.value.sync.lastRemoteMtime = res.remoteMtime;

                // After a manual restore, update the hash baseline and clear any conflict.
                recordSyncedHash();
                clearConflict();
                void saveConfig();
                return {
                    success: true,
                    msg: v6WriteAuthorized
                        ? '数据恢复成功'
                        : '已从旧 WebDAV 文件恢复到本地；确认 v6 通道前不会写回旧文件',
                };
            } catch (error) {
                if (isConfigVersionTooNew(error)) {
                    return {
                        success: false,
                        msg: `云端备份需要 v${error.foundVersion} 客户端；本地数据未改动`,
                    };
                }
                return {success: false, msg: '云端数据不是有效 JSON'};
            }
        });
    };

    const destroy = () => {
        scheduler?.stop();
        scheduler = null;
    };

    const ignoreSyncRecoveryRecord = async (recordId: string) => {
        config.value.sync.recoveryRecords = ignoreSyncRecoveryRecordCore(config.value.sync.recoveryRecords || [], recordId);
        await saveConfig();
        return {success: true, msg: '已忽略该恢复记录'};
    };

    const resolveSyncRecoveryRecord = async (recordId: string) => {
        const result = resolveSyncRecoveryRecordCore(config.value, recordId, {now: Date.now()});
        if (!result.resolved) return {success: false, msg: result.message};
        applyingExternal.value = true;
        config.value = result.config;
        normalizeLayoutItems();
        queueMicrotask(() => (applyingExternal.value = false));
        localRevision.value += 1;
        await saveConfig();
        return {success: true, msg: result.message};
    };

    return {
        startScheduler,
        testSyncConnection,
        uploadBackup,
        downloadBackup,
        destroy,
        // Conflict
        conflictState,
        conflictSnapshot,
        resolveKeepLocal,
        resolveUseRemote,
        resolvePostpone,
        ignoreSyncRecoveryRecord,
        resolveSyncRecoveryRecord,
    };
};
