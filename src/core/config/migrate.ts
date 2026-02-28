// src/core/config/migrate.ts
import {CURRENT_CONFIG_VERSION} from './types';

/**
 * Keep migrations minimal and forward-only.
 * Shape completion happens in normalizeConfig.
 */
export function migrateConfig(raw: any): any {
    if (!raw || typeof raw !== 'object') {
        return {version: CURRENT_CONFIG_VERSION};
    }

    const cfg: any = {...raw};
    cfg.version = typeof cfg.version === 'number' ? cfg.version : 0;

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

    cfg.version = CURRENT_CONFIG_VERSION;
    return cfg;
}
