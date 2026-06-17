// src/core/config/repository.ts
import type {Config} from './types';
import {defaultConfig} from './default';
import {migrateConfig} from './migrate';
import {normalizeConfig} from './normalize';
import {assertConfigValidForSave} from './validate';
import {storage} from '../storage';
import {CONFIG_KEY, WALLPAPER_KEY, LOCAL_WALLPAPER_MARKER} from './keys';
import {applyLegacyLocalStorageIntoConfig} from "./legacyLocalStorage.ts";
import {openSensitiveConfigFromStorage, sealSensitiveConfigForStorage} from './sensitive';

const isBase64Image = (s: string) => typeof s === 'string' && s.startsWith('data:image');

export type ConfigBootDeferredWork = {
    wallpaper: boolean;
    legacySave: boolean;
};

export type ConfigBootLoadResult = {
    config: Config;
    deferred: ConfigBootDeferredWork;
};

type ConfigLoadOptions = {
    restoreWallpaper: boolean;
    saveLegacyMigration: boolean;
};

const defaultLoadOptions: ConfigLoadOptions = {
    restoreWallpaper: true,
    saveLegacyMigration: true,
};

async function loadConfigInternal(options: ConfigLoadOptions): Promise<ConfigBootLoadResult> {
    const local = await storage.get<any>(CONFIG_KEY, null, 'local');
    const sync = local ? null : await storage.get<any>(CONFIG_KEY, null, 'sync');

    const raw = await openSensitiveConfigFromStorage(local ?? sync ?? defaultConfig);
    const next = normalizeConfig(migrateConfig(raw));
    const deferred: ConfigBootDeferredWork = {
        wallpaper: false,
        legacySave: false,
    };

    // wallpaper marker 还原可能读取大体积数据；首屏加载时允许延后。
    if (next.theme.wallpaper === LOCAL_WALLPAPER_MARKER) {
        if (options.restoreWallpaper) {
            const w = await storage.get<string>(WALLPAPER_KEY, '', 'local');
            if (w) next.theme.wallpaper = w;
        } else {
            next.theme.wallpaper = '';
            deferred.wallpaper = true;
        }
    }

    const res = applyLegacyLocalStorageIntoConfig(next);
    if (res.changed) {
        if (options.saveLegacyMigration) {
            await configRepository.save(next);
        } else {
            deferred.legacySave = true;
        }
    }

    return {config: next, deferred};
}

export const configRepository = {
    /**
     * 统一加载：
     * 1) local
     * 2) sync（如果 local 没有）
     * 3) fallback = defaultConfig
     * 4) migrate + normalize
     * 5) wallpaper marker 还原
     */
    async load(): Promise<Config> {
        return (await loadConfigInternal(defaultLoadOptions)).config;
    },

    async loadForBoot(): Promise<ConfigBootLoadResult> {
        return await loadConfigInternal({
            restoreWallpaper: false,
            saveLegacyMigration: false,
        });
    },

    async completeBootLoad(cfg: Config, deferred: ConfigBootDeferredWork) {
        const result = {
            wallpaperRestored: false,
            legacySaved: false,
        };

        if (deferred.wallpaper && !cfg.theme.wallpaper) {
            const w = await storage.get<string>(WALLPAPER_KEY, '', 'local');
            if (w && !cfg.theme.wallpaper) {
                cfg.theme.wallpaper = w;
                result.wallpaperRestored = true;
            }
        }

        if (deferred.legacySave) {
            await this.save(cfg);
            result.legacySaved = true;
        }

        return result;
    },

    /**
     * 统一保存：
     * - base64 wallpaper => 写 local 的 WALLPAPER_KEY，并把 theme.wallpaper 改 marker
     * - config 本体写 local（你也可以未来改成：enabled 时写 sync）
     */
    async save(cfg: Config): Promise<void> {
        const normalized = normalizeConfig(migrateConfig(cfg));
        assertConfigValidForSave(normalized);

        const copy: any = await sealSensitiveConfigForStorage(normalized);
        const wp = copy?.theme?.wallpaper ?? '';

        if (isBase64Image(wp)) {
            await storage.set(WALLPAPER_KEY, wp, 'local');
            copy.theme.wallpaper = LOCAL_WALLPAPER_MARKER;
        } else {
            // 不是 marker 才删，避免误删已存的大图
            if (wp !== LOCAL_WALLPAPER_MARKER) {
                await storage.remove(WALLPAPER_KEY, 'local');
            }
        }

        await storage.set(CONFIG_KEY, copy, 'local');
    }
};
