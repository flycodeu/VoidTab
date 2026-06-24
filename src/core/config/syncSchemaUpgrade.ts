import type {ConfigV6} from './types.ts';
import type {SyncProfile} from '../sync/types.ts';

/**
 * Migration may create v6 data locally, but it may never silently repoint an
 * existing WebDAV backup. The pending bit is persisted with the local profile.
 */
export function markSyncSchemaUpgradePending(profile: SyncProfile): SyncProfile {
    if (!profile.enabled) return {...profile};
    return {
        ...profile,
        syncSchemaUpgradePending: true,
        syncSchemaChannel: 'legacy-v5',
    };
}

export function markConfigV6SyncSchemaUpgradePending(config: ConfigV6): ConfigV6 {
    return {
        ...config,
        sync: markSyncSchemaUpgradePending(config.sync),
    };
}

/**
 * Only a user-confirmed upgrade flow may call this. It authorizes v6 writes;
 * the sync channel maps that authorization to a sibling filename.
 */
export function confirmV6SyncSchemaUpgrade(profile: SyncProfile): SyncProfile {
    return {
        ...profile,
        syncSchemaUpgradePending: false,
        syncSchemaChannel: 'v6',
    };
}

export function isV6SyncWriteAuthorized(profile: SyncProfile): boolean {
    return profile.provider === 'webdav'
        && profile.enabled
        && profile.syncSchemaUpgradePending !== true
        && profile.syncSchemaChannel === 'v6';
}
