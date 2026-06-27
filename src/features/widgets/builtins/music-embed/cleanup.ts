import type {Config, MusicEmbedWidgetState} from '../../../../core/config/types';
import {useMusicPlayer} from '../../../../stores/useMusicPlayer';
import {DEFAULT_MUSIC_EMBED} from './providers';

export type MusicEmbedCleanupSnapshot = {
    widgetId: string;
    state?: MusicEmbedWidgetState;
};

const MUSIC_EMBED_TILE_TYPES = new Set(['builtin:music_embed', 'music_embed']);

const cloneState = (state: MusicEmbedWidgetState): MusicEmbedWidgetState =>
    JSON.parse(JSON.stringify(state)) as MusicEmbedWidgetState;

const isMusicEmbedTile = (item: unknown): item is {id: string; tileType?: string; widgetType?: string} => {
    if (!item || typeof item !== 'object') return false;
    const record = item as {id?: unknown; tileType?: unknown; widgetType?: unknown};
    const type = String(record.tileType || record.widgetType || '');
    return typeof record.id === 'string' && MUSIC_EMBED_TILE_TYPES.has(type);
};

function getMusicWidgets(config: Config) {
    return config.runtime?.musicEmbed?.widgets;
}

export function cleanupMusicEmbedWidgetState(
    config: Config,
    widgetId: string,
    options: {closePlayer?: 'matching' | 'always'} = {},
): MusicEmbedCleanupSnapshot {
    const widgets = getMusicWidgets(config);
    const hadState = !!widgets && Object.prototype.hasOwnProperty.call(widgets, widgetId);
    const state = hadState ? cloneState(widgets[widgetId]) : undefined;
    if (hadState && widgets) delete widgets[widgetId];

    const player = useMusicPlayer();
    const activeSource = state || DEFAULT_MUSIC_EMBED;
    if (options.closePlayer === 'always') {
        if (player.visible) player.close();
    } else if (player.isActiveSource(activeSource)) {
        player.close();
    }

    return {
        widgetId,
        ...(state ? {state} : {}),
    };
}

export function cleanupDeletedMusicEmbedTile(config: Config, item: unknown): MusicEmbedCleanupSnapshot | null {
    if (!isMusicEmbedTile(item)) return null;
    return cleanupMusicEmbedWidgetState(config, String(item.id), {closePlayer: 'always'});
}

export function restoreMusicEmbedWidgetState(config: Config, snapshot?: MusicEmbedCleanupSnapshot | null) {
    if (!snapshot?.state) return;
    if (!config.runtime.musicEmbed) config.runtime.musicEmbed = {widgets: {}};
    if (!config.runtime.musicEmbed.widgets) config.runtime.musicEmbed.widgets = {};
    config.runtime.musicEmbed.widgets[snapshot.widgetId] = cloneState(snapshot.state);
}
