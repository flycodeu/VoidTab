// src/core/sync/hash.ts
// FNV-1a 32-bit hash for config conflict detection.
// Non-cryptographic — for content equality checks only.

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

function fnv1a32(str: string): number {
    let hash = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

function toHex(hash: number): string {
    return hash.toString(16).padStart(8, '0');
}

// Stable JSON stringify with sorted keys — prevents hash variance from
// object key ordering differences across V8 versions or creation paths.
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value as object).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as any)[k])).join(',') + '}';
    }
    return JSON.stringify(value);
}

/**
 * Compute a conflict-detection hash for a config object.
 *
 * Only user-meaningful fields are included. Excluded:
 *   - runtime  (volatile, device-specific)
 *   - sync.lastSyncTime / lastSyncedHash / lastRemoteEtag/Mtime  (meta)
 *   - sync.conflictState / conflictSnapshot  (conflict bookkeeping)
 *   - theme.wallpaper  (idb: key is device-local and meaningless across devices)
 *   - theme.wallpaperType  (same reason)
 *   - theme.customLogoUrl  (base64 blob, device-local)
 */
export function hashConfig(config: {
    layout: unknown;
    searchEngines: unknown;
    currentEngineId: unknown;
    focusMode: unknown;
    ai?: { baseUrl?: unknown; model?: unknown; temperature?: unknown; maxHistory?: unknown };
    theme: unknown;
}): string {
    const theme = config.theme as Record<string, unknown>;
    const snapshot = {
        layout: config.layout,
        searchEngines: config.searchEngines,
        currentEngineId: config.currentEngineId,
        focusMode: config.focusMode,
        ai: {
            baseUrl: config.ai?.baseUrl ?? '',
            model: config.ai?.model ?? '',
            temperature: config.ai?.temperature ?? 0,
            maxHistory: config.ai?.maxHistory ?? 0,
        },
        theme: {
            mode: theme.mode,
            accent: theme.accent,
            blur: theme.blur,
            opacity: theme.opacity,
            neonGlow: theme.neonGlow,
            breathingLight: theme.breathingLight,
            techFont: theme.techFont,
            techFontFamily: theme.techFontFamily,
            density: theme.density,
            siteLayoutMode: theme.siteLayoutMode,
            showSidebar: theme.showSidebar,
            sidebarPos: theme.sidebarPos,
            iconSize: theme.iconSize,
            radius: theme.radius,
            gap: theme.gap,
            activeThemePack: theme.activeThemePack ?? null,
            readability: theme.readability,
        },
    };
    return toHex(fnv1a32(stableStringify(snapshot)));
}
