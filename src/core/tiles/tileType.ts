import type {BuiltinTileType, ExternalTileType, TileType} from './contracts.ts';

export const SITE_TILE_TYPE = 'site' as const;

function stripNamespace(value: string, namespace: 'builtin' | 'external') {
    const prefix = `${namespace}:`;
    let normalized = value.trim();
    while (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length).trim();
    return normalized;
}

/** Convert a v5 widget name into the canonical v6 built-in namespace. */
export function toBuiltinTileType(widgetType: string | null | undefined): BuiltinTileType {
    const localId = stripNamespace(String(widgetType || ''), 'builtin') || 'missing';
    return `builtin:${localId}`;
}

/** Reserve the external namespace without enabling external package execution. */
export function toExternalTileType(packageId: string | null | undefined): ExternalTileType {
    const localId = stripNamespace(String(packageId || ''), 'external') || 'missing';
    return `external:${localId}`;
}

export function isBuiltinTileType(value: unknown): value is BuiltinTileType {
    return typeof value === 'string'
        && value.startsWith('builtin:')
        && value.slice('builtin:'.length).trim().length > 0;
}

export function isExternalTileType(value: unknown): value is ExternalTileType {
    return typeof value === 'string'
        && value.startsWith('external:')
        && value.slice('external:'.length).trim().length > 0;
}

export function isTileType(value: unknown): value is TileType {
    return value === SITE_TILE_TYPE || isBuiltinTileType(value) || isExternalTileType(value);
}

/** Compatibility helper for legacy Vue widget renderers. */
export function getLegacyBuiltinWidgetType(tileType: TileType) {
    return isBuiltinTileType(tileType) ? tileType.slice('builtin:'.length) : undefined;
}
