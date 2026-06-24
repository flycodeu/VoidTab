// src/core/config/migrate.ts
import {LEGACY_CONFIG_VERSION, MAX_SUPPORTED_CONFIG_VERSION} from './types';
import {ConfigVersionTooNew} from './versioning.ts';

export {ConfigVersionTooNew} from './versioning.ts';

/**
 * Keep migrations minimal and forward-only.
 * Shape completion happens in normalizeConfig.
 */
export function migrateConfig(raw: any): any {
    if (!raw || typeof raw !== 'object') {
        return {version: LEGACY_CONFIG_VERSION};
    }

    const cfg: any = {...raw};
    const rawVersion = (typeof cfg.version === 'number' && Number.isFinite(cfg.version)) ? cfg.version : 0;
    if (rawVersion > MAX_SUPPORTED_CONFIG_VERSION) {
        throw new ConfigVersionTooNew(rawVersion, MAX_SUPPORTED_CONFIG_VERSION);
    }
    if (rawVersion === 6) {
        return cfg;
    }
    cfg.version = rawVersion;

    if (cfg.version < 1) {
        cfg.version = 1;
    }

    // v2: introduce runtime.siteIcons cache metadata.
    if (cfg.version < 2) {
        if (!cfg.runtime || typeof cfg.runtime !== 'object') cfg.runtime = {};
        if (!cfg.runtime.siteIcons || typeof cfg.runtime.siteIcons !== 'object') {
            cfg.runtime.siteIcons = {
                version: 1,
                records: {},
                lastBatchRefreshAt: 0,
            };
        }
        cfg.version = 2;
    }

    // v3: ensure site icon records can carry provider/quality metadata.
    if (cfg.version < 3) {
        if (!cfg.runtime || typeof cfg.runtime !== 'object') cfg.runtime = {};
        if (!cfg.runtime.siteIcons || typeof cfg.runtime.siteIcons !== 'object') {
            cfg.runtime.siteIcons = {version: 1, records: {}, lastBatchRefreshAt: 0};
        }
        if (!cfg.runtime.siteIcons.records || typeof cfg.runtime.siteIcons.records !== 'object') {
            cfg.runtime.siteIcons.records = {};
        }
        cfg.version = 3;
    }

    // v4: support url/miss icon cache modes for retry throttling.
    if (cfg.version < 4) {
        if (!cfg.runtime || typeof cfg.runtime !== 'object') cfg.runtime = {};
        if (!cfg.runtime.siteIcons || typeof cfg.runtime.siteIcons !== 'object') {
            cfg.runtime.siteIcons = {version: 1, records: {}, lastBatchRefreshAt: 0};
        }
        if (!cfg.runtime.siteIcons.records || typeof cfg.runtime.siteIcons.records !== 'object') {
            cfg.runtime.siteIcons.records = {};
        }

        for (const [domain, value] of Object.entries(cfg.runtime.siteIcons.records as Record<string, any>)) {
            const rec = (value && typeof value === 'object') ? value : {};
            if (!rec.cacheMode) {
                rec.cacheMode = (typeof rec.blobKey === 'string' && rec.blobKey) ? 'blob' : 'miss';
            }
            if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) {
                rec.updatedAt = 0;
            }
            if (!rec.source || typeof rec.source !== 'string') {
                rec.source = 'unknown';
            }
            cfg.runtime.siteIcons.records[domain] = rec;
        }
        cfg.version = 4;
    }

    // v5: encrypted privacy vault metadata.
    if (cfg.version < 5) {
        if (!cfg.privacy || typeof cfg.privacy !== 'object') {
            cfg.privacy = {
                enabled: false,
                vault: null,
                entry: {
                    trigger: 'keyboard',
                    phrase: ':void',
                    autoLockMinutes: 10,
                    hideWhenLocked: true,
                    syncEnabled: true,
                },
            };
        }
        cfg.version = 5;
    }

    // This normalizer only completes the legacy shape. It must never label a
    // Group.items payload as v6; structural conversion belongs exclusively to
    // migrateV5ToV6() inside the transactional upgrade path.
    cfg.version = LEGACY_CONFIG_VERSION;
    return cfg;
}
