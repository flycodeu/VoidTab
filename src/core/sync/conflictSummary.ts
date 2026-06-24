// src/core/sync/conflictSummary.ts
// Builds a human-readable summary of config differences for the conflict dialog.

export interface ConflictSummary {
    localGroupCount: number;
    remoteGroupCount: number;
    localSiteCount: number;
    remoteSiteCount: number;
    localThemeLabel: string;
    remoteThemeLabel: string;
    localLastModified: number;
    remoteLastModified: number;
}

function countTiles(layout: Array<{items?: unknown[]; tiles?: unknown[]}> | unknown): number {
    if (!Array.isArray(layout)) return 0;
    return layout.reduce((sum: number, group) => {
        if (!group || typeof group !== 'object') return sum;
        const workspace = group as {items?: unknown[]; tiles?: unknown[]};
        return sum + (Array.isArray(workspace.tiles)
            ? workspace.tiles.length
            : (Array.isArray(workspace.items) ? workspace.items.length : 0));
    }, 0);
}

function themeLabel(theme: Record<string, unknown> | unknown): string {
    if (!theme || typeof theme !== 'object') return '未知';
    const t = theme as Record<string, unknown>;
    const mode = t.mode === 'dark' ? '深色' : t.mode === 'light' ? '浅色' : '跟随系统';
    const accent = typeof t.accent === 'string' ? t.accent : '#007AFF';
    const pack = typeof t.activeThemePack === 'string' ? ` · ${t.activeThemePack}` : '';
    return `${mode} / ${accent}${pack}`;
}

/**
 * Build a ConflictSummary comparing two raw (parsed but not normalized) config objects.
 * Called before normalizing the remote payload so the original data is preserved.
 */
export function buildConflictSummary(
    localConfig: { layout: unknown; theme: unknown; sync?: { lastSyncTime?: number } },
    remoteRaw: { layout?: unknown; theme?: unknown; sync?: { lastSyncTime?: number } }
): ConflictSummary {
    return {
        localGroupCount: Array.isArray(localConfig.layout) ? localConfig.layout.length : 0,
        remoteGroupCount: Array.isArray(remoteRaw.layout) ? remoteRaw.layout.length : 0,
        localSiteCount: countTiles(localConfig.layout),
        remoteSiteCount: countTiles(remoteRaw.layout),
        localThemeLabel: themeLabel(localConfig.theme),
        remoteThemeLabel: themeLabel(remoteRaw.theme),
        localLastModified: localConfig.sync?.lastSyncTime ?? 0,
        remoteLastModified: remoteRaw.sync?.lastSyncTime ?? 0,
    };
}
