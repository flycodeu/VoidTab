import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';
import {defaultConfig} from '../../core/config/default';
import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';
import {configRepository} from '../../core/config/repository';
import {ensureSiteIconRuntime} from '../../shared/utils/siteIconCache';
import {markPerformance, measurePerformanceAsync} from '../../shared/utils/performance';
import {deepClone} from './helpers';

type LifecycleDeps = {
    config: Ref<Config>;
    isLoaded: Ref<boolean>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    rssCache: Ref<Record<string, unknown[]>>;
    normalizeLayoutItems: () => void;
    saveConfig: () => Promise<void>;
    startScheduler: () => void;
};

export const createLifecycleActions = ({
    config,
    isLoaded,
    applyingExternal,
    localRevision,
    rssCache,
    normalizeLayoutItems,
    saveConfig,
    startScheduler,
}: LifecycleDeps) => {
    const loadConfig = async () => {
        await measurePerformanceAsync('config.load', async () => {
            config.value = await configRepository.load();
            normalizeLayoutItems();
            ensureSiteIconRuntime(config.value.runtime);
            isLoaded.value = true;
            startScheduler();
        });

        markPerformance('config.loaded');
    };

    const resetToDefault = async () => {
        await measurePerformanceAsync('config.reset', async () => {
            const next = normalizeConfig(migrateConfig(deepClone(defaultConfig)));

            applyingExternal.value = true;
            config.value = next;
            normalizeLayoutItems();
            queueMicrotask(() => (applyingExternal.value = false));

            rssCache.value = {};
            localRevision.value += 1;

            await saveConfig();
        });
    };

    return {
        loadConfig,
        resetToDefault,
    };
};
