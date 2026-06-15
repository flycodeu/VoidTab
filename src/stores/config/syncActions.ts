import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';
import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';
import {mergeLocalSensitiveFields, stripSensitiveConfigForSync} from '../../core/config/sensitive';
import {validateImportedConfig} from '../../core/config/validate';
import {SyncScheduler, syncService} from '../../core/sync';
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

    const notifySyncWarning = (message: string) => {
        const now = Date.now();
        if (now - lastSyncErrorToastAt < 60_000) return;
        lastSyncErrorToastAt = now;
        toast.warning(message);
    };

    const startScheduler = () => {
        if (scheduler) return;

        scheduler = new SyncScheduler({
            getProfile: () => config.value.sync,
            getUploadPayload: () => buildSyncPayload(config.value),
            getLocalRevision: () => localRevision.value,

            onRemotePayload: async (remoteText) => {
                try {
                    const raw = JSON.parse(remoteText);
                    const validation = validateImportedConfig(raw);
                    if (!validation.ok) throw new Error(validation.errors[0] || 'invalid sync payload');
                    const next = mergeLocalSensitiveFields(normalizeConfig(migrateConfig(raw)), config.value);
                    next.runtime = config.value.runtime;
                    applyingExternal.value = true;
                    config.value = next;
                    normalizeLayoutItems();
                    queueMicrotask(() => (applyingExternal.value = false));

                    localRevision.value += 1;
                } catch {
                    notifySyncWarning('远端同步数据格式异常，已忽略本次更新');
                }
            },

            onSyncMeta: (meta) => {
                config.value.sync.lastSyncTime = meta.lastSyncTime;
                if (meta.etag) config.value.sync.lastRemoteEtag = meta.etag;
                if (meta.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
                void saveConfig();
            },

            onError: () => notifySyncWarning('自动同步暂时不可用，稍后会自动重试'),
        });

        scheduler.start();
    };

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
    };
};
