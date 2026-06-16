import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';
import {defaultConfig} from '../../core/config/default';
import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';
import {configRepository} from '../../core/config/repository';
import {ensureSiteIconRuntime} from '../../shared/utils/siteIconCache';
import {markPerformance, measurePerformanceAsync} from '../../shared/utils/performance';
import {deepClone} from './helpers';

const BOOT_SOFT_TIMEOUT_MS = 1500;

type LifecycleDeps = {
    config: Ref<Config>;
    isLoaded: Ref<boolean>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    rssCache: Ref<Record<string, unknown[]>>;
    normalizeLayoutItems: () => void;
    saveConfig: () => Promise<void>;
    startScheduler: () => void;
    onLoadWarning?: (message: string) => void;
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
    onLoadWarning,
}: LifecycleDeps) => {
    let loadRunId = 0;
    let loadConfigPromise: Promise<void> | null = null;

    const setConfigForBoot = (next: Config) => {
        applyingExternal.value = true;
        config.value = next;
        normalizeLayoutItems();
        ensureSiteIconRuntime(config.value.runtime);
        isLoaded.value = true;
        queueMicrotask(() => (applyingExternal.value = false));
    };

    const createFallbackConfig = () => {
        return normalizeConfig(migrateConfig(deepClone(defaultConfig)));
    };

    const waitForBootTimeout = () =>
        new Promise<'timeout'>((resolve) => {
            globalThis.setTimeout(() => resolve('timeout'), BOOT_SOFT_TIMEOUT_MS);
        });

    const runPostBootWork = (runId: number, deferred: Awaited<ReturnType<typeof configRepository.loadForBoot>>['deferred']) => {
        const requestIdle = typeof window !== 'undefined'
            ? (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: {timeout: number}) => number)
            : undefined;

        const run = () => {
            void measurePerformanceAsync('config.postBoot', async () => {
                if (runId !== loadRunId) return;

                const shouldRestoreWallpaper = deferred.wallpaper && !config.value.theme.wallpaper;
                const guardedDeferred = {
                    wallpaper: shouldRestoreWallpaper,
                    legacySave: deferred.legacySave,
                };

                if (!guardedDeferred.wallpaper && !guardedDeferred.legacySave) return;

                applyingExternal.value = true;
                try {
                    await configRepository.completeBootLoad(config.value, guardedDeferred);
                } finally {
                    queueMicrotask(() => (applyingExternal.value = false));
                }
            }).catch(() => {
                onLoadWarning?.('部分后台配置恢复失败，当前界面仍可继续使用');
            });
        };

        if (requestIdle) {
            requestIdle(run, {timeout: 2500});
        } else {
            globalThis.setTimeout(run, 0);
        }
    };

    const applyBootResult = (
        runId: number,
        bootResult: Awaited<ReturnType<typeof configRepository.loadForBoot>>,
        detail: string
    ) => {
        if (runId !== loadRunId) return false;

        setConfigForBoot(bootResult.config);
        startScheduler();
        runPostBootWork(runId, bootResult.deferred);
        markPerformance('config.loaded', detail);
        return true;
    };

    const loadConfig = async () => {
        if (loadConfigPromise) return loadConfigPromise;
        if (isLoaded.value) return;

        loadConfigPromise = (async () => {
            const runId = ++loadRunId;
            const bootPromise = measurePerformanceAsync('config.load.boot', async () => await configRepository.loadForBoot());

            const firstResult = await Promise.race([bootPromise, waitForBootTimeout()])
                .catch((error) => ({error}));

            if (firstResult === 'timeout') {
                setConfigForBoot(createFallbackConfig());
                const fallbackRevision = localRevision.value;
                markPerformance('config.loaded', 'fallback-timeout');
                onLoadWarning?.('配置加载较慢，已先进入可用界面，后台会继续恢复数据');

                void bootPromise.then((bootResult) => {
                    if (runId !== loadRunId) return;
                    if (localRevision.value !== fallbackRevision) {
                        startScheduler();
                        onLoadWarning?.('配置已在后台恢复，但检测到你已修改当前界面，已保留当前数据');
                        return;
                    }
                    applyBootResult(runId, bootResult, 'background-after-timeout');
                }).catch(() => {
                    onLoadWarning?.('后台配置恢复失败，已保留当前可用界面');
                    startScheduler();
                });
                return;
            }

            if (firstResult && typeof firstResult === 'object' && 'error' in firstResult) {
                setConfigForBoot(createFallbackConfig());
                startScheduler();
                markPerformance('config.loaded', 'fallback-error');
                onLoadWarning?.('配置加载失败，已使用默认配置进入界面');
                return;
            }

            applyBootResult(runId, firstResult, 'boot');
        })().finally(() => {
            loadConfigPromise = null;
        });

        return loadConfigPromise;
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
