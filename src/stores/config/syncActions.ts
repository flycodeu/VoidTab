import {ref} from 'vue';
import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';
import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';
import {mergeLocalSensitiveFields, stripSensitiveConfigForSync} from '../../core/config/sensitive';
import {validateImportedConfig} from '../../core/config/validate';
import {SyncScheduler, syncService} from '../../core/sync';
import type {ConflictSnapshot, SyncConflictState} from '../../core/sync/types';
import {hashConfig} from '../../core/sync/hash';
import {buildConflictSummary} from '../../core/sync/conflictSummary';
import {useToast} from '../../shared/composables/useToast';
import {measurePerformanceAsync} from '../../shared/utils/performance';

type SyncActionDeps = {
    config: Ref<Config>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    normalizeLayoutItems: () => void;
    saveConfig: () => Promise<void>;
};

type SyncPayload = Omit<Config, 'runtime'> & {
    theme: Config['theme'] & {
        wallpaperType?: string;
    };
};

export const buildSyncPayload = (cfg: Config) => {
    const sealed = stripSensitiveConfigForSync(cfg);
    const copy: SyncPayload = {
        version: sealed.version,
        sync: sealed.sync,
        layout: sealed.layout,
        theme: {...sealed.theme},
        searchEngines: sealed.searchEngines,
        currentEngineId: sealed.currentEngineId,
        ai: sealed.ai,
        focusMode: sealed.focusMode,
    };

    // Strip conflict fields from sync payload — they are device-local bookkeeping.
    delete (copy.sync as any).lastSyncedHash;
    delete (copy.sync as any).conflictState;
    delete (copy.sync as any).conflictSnapshot;

    const wp = (copy?.theme?.wallpaper || '').trim?.() ? copy.theme.wallpaper.trim() : '';
    if (wp.startsWith('idb:')) {
        copy.theme.wallpaper = '';
        copy.theme.wallpaperType = '';
    }

    return JSON.stringify(copy);
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

    const applyRemoteRaw = (remoteText: string) => {
        const raw = JSON.parse(remoteText);
        const validation = validateImportedConfig(raw);
        if (!validation.ok) throw new Error(validation.errors[0] || 'invalid sync payload');
        const next = mergeLocalSensitiveFields(normalizeConfig(migrateConfig(raw)), config.value);
        next.runtime = config.value.runtime;
        // Preserve device-local conflict/hash fields — do not overwrite with remote values.
        next.sync.lastSyncedHash = config.value.sync.lastSyncedHash;
        next.sync.conflictState = undefined;
        next.sync.conflictSnapshot = undefined;
        applyingExternal.value = true;
        config.value = next;
        normalizeLayoutItems();
        queueMicrotask(() => (applyingExternal.value = false));
        localRevision.value += 1;
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
            getProfile: () => config.value.sync,
            getUploadPayload: () => buildSyncPayload(config.value),
            getLocalRevision: () => localRevision.value,
            getCurrentHash: () => hashConfig(config.value),
            getLastSyncedHash: () => config.value.sync.lastSyncedHash ?? '',

            onRemotePayload: async (remoteText, meta) => {
                try {
                    applyRemoteRaw(remoteText);
                    // After clean auto-apply, update the synced hash baseline.
                    recordSyncedHash();
                    if (meta?.etag) config.value.sync.lastRemoteEtag = meta.etag;
                    if (meta?.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
                } catch {
                    notifySyncWarning('远端同步数据格式异常，已忽略本次更新');
                }
            },

            onConflictDetected: (snapshot) => {
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
            applyRemoteRaw(snapshot.remoteText);
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

    const testSyncConnection = async (profile?: Config['sync']) => {
        return await measurePerformanceAsync('config.sync.test', async () =>
            await syncService.test(profile ?? config.value.sync)
        );
    };

    const uploadBackup = async () => {
        return await measurePerformanceAsync('config.sync.upload', async () => {
            const now = Date.now();
            const backupData = stripSensitiveConfigForSync(config.value);
            backupData.sync.lastSyncTime = now;

            const res = await syncService.upload(config.value.sync, backupData);

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

            const res = await syncService.download(config.value.sync);
            if (!res.ok || !res.data) return {success: false, msg: res.message};

            try {
                const parsed = JSON.parse(res.data);
                const validation = validateImportedConfig(parsed);
                if (!validation.ok) return {success: false, msg: `云端数据结构异常：${validation.errors[0]}`};
                const next = mergeLocalSensitiveFields(normalizeConfig(migrateConfig(parsed)), config.value);
                next.runtime = currentRuntime;
                config.value = next;
                normalizeLayoutItems();

                config.value.sync = {...config.value.sync, ...currentSync};
                if (res.remoteEtag) config.value.sync.lastRemoteEtag = res.remoteEtag;
                if (res.remoteMtime) config.value.sync.lastRemoteMtime = res.remoteMtime;

                // After a manual restore, update the hash baseline and clear any conflict.
                recordSyncedHash();
                clearConflict();
                void saveConfig();
                return {success: true, msg: '数据恢复成功'};
            } catch {
                return {success: false, msg: '云端数据不是有效 JSON'};
            }
        });
    };

    const destroy = () => {
        scheduler?.stop();
        scheduler = null;
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
    };
};
