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
import {mergeConfigV6ThreeWay, mergeConfigV6WithPersisted} from './localMerge.ts';

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

export type ConfigSaveOptions = {
    /** Last snapshot known by this tab; used to distinguish edits from stale fields. */
    base?: ConfigV6;
};

const CONFIG_WRITE_LOCK = 'voidtab-config-write-v1';
const FALLBACK_LOCK_KEY = 'voidtab:config-write-lock:v1';
const FALLBACK_LOCK_TTL_MS = 8_000;
const FALLBACK_LOCK_WAIT_MS = 35;
const FALLBACK_LOCK_ATTEMPTS = 240;

const delay = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

async function withFallbackWriteLock<T>(work: () => Promise<T>): Promise<T> {
    let local: Storage | null = null;
    try {
        local = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    } catch {
        local = null;
    }
    if (!local) return await work();
    const lockOwner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    for (let attempt = 0; attempt < FALLBACK_LOCK_ATTEMPTS; attempt += 1) {
        const now = Date.now();
        try {
            const currentRaw = local.getItem(FALLBACK_LOCK_KEY);
            const current = currentRaw ? JSON.parse(currentRaw) as {owner?: string; expiresAt?: number} : null;
            if (current?.owner && current.owner !== lockOwner && Number(current.expiresAt) > now) {
                await delay(FALLBACK_LOCK_WAIT_MS);
                continue;
            }

            local.setItem(FALLBACK_LOCK_KEY, JSON.stringify({
                owner: lockOwner,
                expiresAt: now + FALLBACK_LOCK_TTL_MS,
            }));
            const acquiredRaw = local.getItem(FALLBACK_LOCK_KEY);
            const acquired = acquiredRaw ? JSON.parse(acquiredRaw) as {owner?: string} : null;
            if (acquired?.owner !== lockOwner) {
                await delay(FALLBACK_LOCK_WAIT_MS);
                continue;
            }

            try {
                return await work();
            } finally {
                const heldRaw = local.getItem(FALLBACK_LOCK_KEY);
                const held = heldRaw ? JSON.parse(heldRaw) as {owner?: string} : null;
                if (held?.owner === lockOwner) local.removeItem(FALLBACK_LOCK_KEY);
            }
        } catch {
            // A restricted localStorage should never make configuration writes
            // fail; the Web Locks path remains the primary implementation.
            return await work();
        }
    }

    // Never strand a user behind a lock if a browser throttles background tabs.
    return await work();
}

async function withConfigWriteLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = (globalThis as any).navigator?.locks;
    if (typeof locks?.request === 'function') {
        return await locks.request(CONFIG_WRITE_LOCK, {mode: 'exclusive'}, work);
    }
    return await withFallbackWriteLock(work);
}

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
    async save(cfg: Config, options: ConfigSaveOptions = {}): Promise<Config> {
        return await withConfigWriteLock(async () => {
            const candidate = normalizeConfigForRuntime(cfg);
            assertConfigValidForRuntimeSave(candidate);
            let normalized = candidate;

            // Every tab writes a complete config object. Re-read the persisted
            // value while holding the cross-context lock and merge it first, so
            // a stale tab cannot erase a site added by another tab.
            if (isConfigV6(candidate)) {
                const stored = await storage.get<any>(CONFIG_KEY, null, 'local');
                if (stored) {
                    try {
                        const persisted = normalizeConfigForRuntime(await openSensitiveConfigFromStorage(stored));
                        if (isConfigV6(persisted)) {
                            const merged = options.base && isConfigV6(options.base)
                                ? mergeConfigV6ThreeWay(normalizeConfigV6(options.base), candidate, persisted)
                                : mergeConfigV6WithPersisted(persisted, candidate);
                            normalized = normalizeConfigV6(merged);
                        }
                    } catch {
                        // A malformed old value is safely replaced by the
                        // already validated candidate below.
                    }
                }
            }

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
            return normalized;
        });
    }
};
