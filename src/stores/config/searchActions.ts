import type {Ref} from 'vue';
import type {Config, SearchEngine} from '../../core/config/types';
import {validateSearchTemplate} from '../../core/search/searchUtils';

export const createSearchActions = (config: Ref<Config>) => {
    const createEngineId = (name: string) => {
        const base = name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'engine';
        let id = base;
        let index = 1;
        const exists = () => config.value.searchEngines.some((engine) => engine.id === id);
        while (exists()) {
            index += 1;
            id = `${base}-${index}`;
        }
        return id;
    };

    const normalizeEnginePayload = (input: Partial<SearchEngine>) => {
        const name = String(input.name || '').trim();
        const icon = String(input.icon || 'Globe').trim() || 'Globe';
        const validation = validateSearchTemplate(String(input.url || ''));

        if (!name) return {ok: false as const, message: '请输入引擎名称'};
        if (!validation.ok) return {ok: false as const, message: validation.message};

        return {
            ok: true as const,
            engine: {
                id: String(input.id || createEngineId(name)),
                name,
                url: validation.normalizedUrl,
                icon,
            },
            message: validation.message,
        };
    };

    const addEngine = (name: string, url: string, icon = 'Globe') => {
        const result = normalizeEnginePayload({name, url, icon});
        if (!result.ok) return result;

        config.value.searchEngines.push(result.engine);
        if (!config.value.currentEngineId) config.value.currentEngineId = result.engine.id;
        return result;
    };

    const updateEngine = (id: string, patch: Partial<SearchEngine>) => {
        const index = config.value.searchEngines.findIndex((engine) => engine.id === id);
        if (index < 0) return {ok: false as const, message: '未找到要编辑的搜索引擎'};

        const current = config.value.searchEngines[index];
        const result = normalizeEnginePayload({...current, ...patch, id: current.id});
        if (!result.ok) return result;

        config.value.searchEngines.splice(index, 1, result.engine);
        return result;
    };

    const removeEngine = (id: string) => {
        if (config.value.searchEngines.length <= 1) return;
        config.value.searchEngines = config.value.searchEngines.filter((engine) => engine.id !== id);
        if (!config.value.searchEngines.some((engine) => engine.id === config.value.currentEngineId)) {
            config.value.currentEngineId = config.value.searchEngines[0]?.id || 'bing';
        }
    };

    const moveEngine = (id: string, direction: -1 | 1) => {
        const index = config.value.searchEngines.findIndex((engine) => engine.id === id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= config.value.searchEngines.length) return;
        const [engine] = config.value.searchEngines.splice(index, 1);
        config.value.searchEngines.splice(nextIndex, 0, engine);
    };

    const setCurrentEngine = (id: string) => {
        if (!config.value.searchEngines.some((engine) => engine.id === id)) return false;
        config.value.currentEngineId = id;
        return true;
    };

    return {
        addEngine,
        updateEngine,
        removeEngine,
        moveEngine,
        setCurrentEngine,
    };
};
