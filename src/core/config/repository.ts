// src/core/config/repository.ts
import type {Config, ConfigV5, ConfigV6} from './types';
import {defaultConfig} from './default';
import {migrateConfig} from './migrate';
import {normalizeConfig} from './normalize';
import {assertConfigValidForSave, ConfigSchemaValidationError} from './validate';
import {isConfigV6, normalizeConfigV6, validateConfigForSaveV6} from './v6.ts';
import {storage} from '../storage';
import {CONFIG_KEY, WALLPAPER_KEY, LOCAL_WALLPAPER_MARKER} from './keys';
import {applyLegacyLocalStorageIntoConfig} from "./legacyLocalStorage.ts";
import {openSensitiveConfigFromStorage, sealSensitiveConfigForStorage} from './sensitive';
import {commitConfigV5ToV6Migration} from './v6MigrationTransaction.ts';
import {getStableConfigDeviceId} from './deviceId.ts';

const isBase64Image = (s: string) => typeof s === 'string' && s.startsWith('data:image');

function normalizeConfigForRuntime(raw: unknown): Config {
    const migrated = migrateConfig(raw);
    return isConfigV6(migrated) ? normalizeConfigV6(migrated) : normalizeConfig(migrated);
}

function assertConfigValidForRuntimeSave(raw: Config): void {
    if (isConfigV6(raw)) {
        const result = validateConfigForSaveV6(raw);
        if (!result.ok) throw new ConfigSchemaValidationError(result);
        return;
    }
    assertConfigValidForSave(raw);
}

export type ConfigBootDeferredWork = {
    wallpaper: boolean;
    legacySave: boolean;
};

export type ConfigBootLoadResult = {
    config: ConfigV6;
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
    let next = normalizeConfigForRuntime(raw);
    if (!isConfigV6(next)) {
        // P3 runtime is v6-only. The transaction seals a local v5 recovery
        // snapshot before committing and marks WebDAV migration as pending.
        const migration = await commitConfigV5ToV6Migration(next as ConfigV5, {
            deviceId: getStableConfigDeviceId(),
            migratedAt: Date.now(),
        });
        next = migration.config;
    }
    const v6 = next as ConfigV6;
    const deferred: ConfigBootDeferredWork = {
        wallpaper: false,
        legacySave: false,
    };

    // wallpaper marker 还原可能读取大体积数据；首屏加载时允许延后。
    if (v6.theme.wallpaper === LOCAL_WALLPAPER_MARKER) {
        if (options.restoreWallpaper) {
            const w = await storage.get<string>(WALLPAPER_KEY, '', 'local');
            if (w) v6.theme.wallpaper = w;
        } else {
            v6.theme.wallpaper = '';
            deferred.wallpaper = true;
        }
    }

    const res = applyLegacyLocalStorageIntoConfig(v6);
    if (res.changed) {
        if (options.saveLegacyMigration) {
            await configRepository.save(v6);
        } else {
            deferred.legacySave = true;
        }
    }

    return {config: v6, deferred};
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
    async load(): Promise<ConfigV6> {
        return (await loadConfigInternal(defaultLoadOptions)).config;
    },

    async loadForBoot(): Promise<ConfigBootLoadResult> {
        return await loadConfigInternal({
            restoreWallpaper: false,
            saveLegacyMigration: false,
        });
    },

    async completeBootLoad(cfg: ConfigV6, deferred: ConfigBootDeferredWork) {
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
        const normalized = normalizeConfigForRuntime(cfg);
        assertConfigValidForRuntimeSave(normalized);

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
