import {watch, type Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import {configRepository} from '../../core/config/repository';
import {measurePerformanceAsync} from '../../shared/utils/performance';

type ConfigPersistenceDeps = {
    config: Ref<ConfigV6>;
    isLoaded: Ref<boolean>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    onSaveError?: (error: unknown) => void;
};

export const createConfigPersistence = ({
    config,
    isLoaded,
    applyingExternal,
    localRevision,
    onSaveError,
}: ConfigPersistenceDeps) => {
    let saveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const clearPendingSave = () => {
        if (!saveTimer) return;
        globalThis.clearTimeout(saveTimer);
        saveTimer = null;
    };

    const saveConfig = async () => {
        if (!isLoaded.value) return;
        clearPendingSave();

        try {
            await measurePerformanceAsync('config.save', async () => {
                await configRepository.save(config.value);
            });
        } catch (e) {
            onSaveError?.(e);
        }
    };

    const saveConfigDebounced = () => {
        clearPendingSave();
        saveTimer = globalThis.setTimeout(() => {
            void saveConfig();
            saveTimer = null;
        }, 200);
    };

    const stopWatching = watch(
        config,
        () => {
            if (!isLoaded.value) return;
            if (applyingExternal.value) return;

            localRevision.value += 1;
            saveConfigDebounced();
        },
        {deep: true}
    );

    const destroy = () => {
        clearPendingSave();
        stopWatching();
    };

    return {
        saveConfig,
        saveConfigDebounced,
        destroy,
    };
};
