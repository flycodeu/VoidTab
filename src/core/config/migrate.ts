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

    cfg.version = CURRENT_CONFIG_VERSION;
    return cfg;
}

