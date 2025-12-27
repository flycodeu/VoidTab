// src/core/config/watch.ts
import type {Config} from './types';
import {storage} from '../storage';
import {CONFIG_KEY, WALLPAPER_KEY} from './keys';
import {configRepository} from './repository';

export type ConfigChangeHandler = (next: Config) => void;

const isConfigRelated = (key: string) => {
    return key === CONFIG_KEY || key === WALLPAPER_KEY;
};

/**
 * 监听“外部配置变化”（来自其它 extension context / 其它 tab）
 * 一旦 CONFIG_KEY 或 WALLPAPER_KEY 变化，就 reload 并通知 UI
 */
export const watchConfigChanges = (handler: ConfigChangeHandler): (() => void) => {
    if (!storage.onChanged) return () => {
    };

    return storage.onChanged(async (changes) => {
        if (!changes?.length) return;
        if (!changes.some((c) => isConfigRelated(c.key))) return;

        const next = await configRepository.load();
        handler(next);
    });
};
