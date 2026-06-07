import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';

export const createSearchActions = (config: Ref<Config>) => {
    const addEngine = (name: string, url: string) => {
        config.value.searchEngines.push({id: Date.now().toString(), name, url, icon: 'Globe'});
    };

    const removeEngine = (id: string) => {
        config.value.searchEngines = config.value.searchEngines.filter((engine) => engine.id !== id);
        if (!config.value.searchEngines.some((engine) => engine.id === config.value.currentEngineId)) {
            config.value.currentEngineId = config.value.searchEngines[0]?.id || 'bing';
        }
    };

    return {
        addEngine,
        removeEngine,
    };
};
