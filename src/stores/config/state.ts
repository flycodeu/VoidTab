import {ref} from 'vue';
import type {Config} from '../../core/config/types';
import {defaultConfig} from '../../core/config/default';
import {deepClone} from './helpers';

export const createConfigState = () => ({
    config: ref<Config>(deepClone(defaultConfig)),
    isLoaded: ref(false),
    rssCache: ref<Record<string, unknown[]>>({}),
    applyingExternal: ref(false),
    localRevision: ref(0),
});
