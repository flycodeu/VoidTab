import {defineStore} from 'pinia';
import {ConfigSchemaValidationError} from '../core/config/validate';
import {useToast} from '../shared/composables/useToast';
import {initPerformanceMonitor} from '../shared/utils/performance';
import {createIconActions} from './config/iconActions';
import {createLayoutActions} from './config/layoutActions';
import {createLifecycleActions} from './config/lifecycleActions';
import {createConfigPersistence} from './config/persistence';
import {createSearchActions} from './config/searchActions';
import {createSiteActions} from './config/siteActions';
import {createConfigState} from './config/state';
import {createSyncActions} from './config/syncActions';

export const useConfigStore = defineStore('config', () => {
    initPerformanceMonitor({maxEntries: 160, exposeGlobal: true});

    const toast = useToast();
    const {
        config,
        isLoaded,
        rssCache,
        applyingExternal,
        localRevision,
    } = createConfigState();

    const persistence = createConfigPersistence({
        config,
        isLoaded,
        applyingExternal,
        localRevision,
        onSaveError: (error) => {
            if (import.meta.env.DEV) console.error('[VoidTab] config save failed', error);
            if (error instanceof ConfigSchemaValidationError) {
                toast.error(`保存配置失败：${error.errors[0] || '配置数据格式异常'}`);
                return;
            }
            toast.error('保存配置失败，请检查浏览器存储权限');
        },
    });

    const layoutActions = createLayoutActions(config, persistence.saveConfig);
    const siteActions = createSiteActions(config, persistence.saveConfig);
    const searchActions = createSearchActions(config);
    const iconActions = createIconActions(config, isLoaded);
    const syncActions = createSyncActions({
        config,
        applyingExternal,
        localRevision,
        normalizeLayoutItems: layoutActions.normalizeLayoutItems,
        saveConfig: persistence.saveConfig,
    });
    const lifecycleActions = createLifecycleActions({
        config,
        isLoaded,
        applyingExternal,
        localRevision,
        rssCache,
        normalizeLayoutItems: layoutActions.normalizeLayoutItems,
        saveConfig: persistence.saveConfig,
        startScheduler: syncActions.startScheduler,
        onLoadWarning: (message) => toast.warning(message),
    });

    const destroy = () => {
        syncActions.destroy();
        persistence.destroy();
    };

    return {
        config,
        isLoaded,
        loadConfig: lifecycleActions.loadConfig,
        saveConfig: persistence.saveConfig,

        ...siteActions,
        ...layoutActions,
        ...searchActions,

        rssCache,
        ...iconActions,

        testSyncConnection: syncActions.testSyncConnection,
        uploadBackup: syncActions.uploadBackup,
        downloadBackup: syncActions.downloadBackup,
        destroy,

        resetToDefault: lifecycleActions.resetToDefault,
    };
});
