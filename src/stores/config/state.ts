import {ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import {defaultConfig} from '../../core/config/default';
import {deepClone} from './helpers';
import {migrateV5ToV6} from '../../core/config/migrateV5ToV6.ts';
import {normalizeConfigV6} from '../../core/config/v6.ts';
import {getStableConfigDeviceId} from '../../core/config/deviceId.ts';

const createInitialConfig = (): ConfigV6 => normalizeConfigV6(migrateV5ToV6(deepClone(defaultConfig), {
    deviceId: getStableConfigDeviceId(),
    migratedAt: Date.now(),
}).config);

export const createConfigState = () => ({
    config: ref<ConfigV6>(createInitialConfig()),
    isLoaded: ref(false),
    rssCache: ref<Record<string, unknown[]>>({}),
    applyingExternal: ref(false),
    localRevision: ref(0),
});
