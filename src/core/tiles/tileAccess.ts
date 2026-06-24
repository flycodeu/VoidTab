import type {ConfigV6} from '../config/types.ts';
import type {ComponentTile, GridPlacement, RevisionStamp, SiteTile, TileInstance, Workspace} from './contracts.ts';
import {cloneDefaultWorkspaceLayout, MAX_TILE_SPAN} from './gridMetrics.ts';
import {normalizeTileStyleOverride} from './style.ts';
import {getLegacyBuiltinWidgetType, toBuiltinTileType} from './tileType.ts';

export type RuntimeWorkspace = Workspace;
export type RuntimeTile = TileInstance;
export type RuntimeSiteTile = SiteTile;
export type RuntimeComponentTile = ComponentTile;
export type RuntimeConfigShape = ConfigV6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

const clonePlacement = (value: GridPlacement): GridPlacement => ({...value});

const cloneLayouts = (layouts: TileInstance['layouts']) => ({
    desktop: clonePlacement(layouts.desktop),
    ...(layouts.tablet ? {tablet: clonePlacement(layouts.tablet)} : {}),
    ...(layouts.mobile ? {mobile: clonePlacement(layouts.mobile)} : {}),
});

export function createRevisionStamp(now = Date.now(), deviceId = 'runtime-local'): RevisionStamp {
    return {updatedAt: Math.round(now), deviceId, sequence: 1};
}

export function getRuntimeWorkspaces(config: ConfigV6): Workspace[] {
    return config.layout;
}

export function getWorkspaceTiles(workspace: Workspace): TileInstance[] {
    return workspace.tiles;
}

export function setWorkspaceTiles(workspace: Workspace, tiles: TileInstance[]) {
    workspace.tiles = tiles;
}

export function findWorkspace(config: ConfigV6, workspaceId: string): Workspace | undefined {
    return config.layout.find((workspace) => workspace.id === workspaceId);
}

export function findTile(workspace: Workspace | undefined, tileId: string): TileInstance | undefined {
    return workspace?.tiles.find((tile) => tile.id === tileId);
}

export function findTileIndex(workspace: Workspace | undefined, tileId: string) {
    return workspace?.tiles.findIndex((tile) => tile.id === tileId) ?? -1;
}

export function getWorkspaceTileCount(workspace: Workspace) {
    return workspace.tiles.length;
}

export function isSiteTile(tile: TileInstance): tile is SiteTile {
    return tile.tileType === 'site';
}

export function isComponentTile(tile: TileInstance): tile is ComponentTile {
    return tile.tileType !== 'site';
}

export function getTileTitle(tile: TileInstance) {
    return tile.title || '';
}

/** Compatibility name for UI labels; never reads a legacy persisted discriminator. */
export function getLegacyWidgetType(tile: ComponentTile) {
    return getLegacyBuiltinWidgetType(tile.tileType) || tile.tileType;
}

export function getTileKind(tile: TileInstance): 'site' | 'widget' {
    return isComponentTile(tile) ? 'widget' : 'site';
}

export function getTileKindLabel(tile: TileInstance) {
    return isComponentTile(tile) ? '组件' : '网站';
}

export function getTileFallbackTitle(tile: TileInstance, fallback = '未命名') {
    const title = getTileTitle(tile).trim();
    if (title) return title;
    return isComponentTile(tile) ? getLegacyWidgetType(tile) || '未命名组件' : fallback;
}

export function getTileUrl(tile: TileInstance) {
    return isSiteTile(tile) ? tile.url : '';
}

export function getTileRemark(tile: TileInstance) {
    return isSiteTile(tile) ? tile.remark || '' : '';
}

export function getTileTags(tile: TileInstance) {
    return isSiteTile(tile) ? tile.tags || [] : [];
}

export function getTileIconType(tile: TileInstance) {
    return isSiteTile(tile) ? tile.iconType : undefined;
}

export function getTileLayouts(tile: TileInstance) {
    return tile.layouts;
}

export function setTileLayouts(tile: TileInstance, layouts: TileInstance['layouts']) {
    tile.layouts = cloneLayouts(layouts);
    touchRevision(tile);
}

export function getTileDesktopSize(tile: TileInstance) {
    return {w: tile.layouts.desktop.w, h: tile.layouts.desktop.h};
}

export function setTileSize(tile: TileInstance, w: number, h: number) {
    tile.layouts = {
        ...tile.layouts,
        desktop: {...tile.layouts.desktop, w, h},
    };
    touchRevision(tile);
}

export function setTileTitle(tile: TileInstance, title: string) {
    tile.title = title;
    touchRevision(tile);
}

export function touchRevision(tile: TileInstance, now = Date.now()) {
    tile.revision = {
        updatedAt: Math.round(now),
        deviceId: tile.revision.deviceId || 'runtime-local',
        sequence: Math.max(0, tile.revision.sequence || 0) + 1,
    };
}

export function createWorkspace(input: Partial<Workspace> = {}): Workspace {
    const now = Date.now();
    return {
        id: input.id || now.toString(),
        title: input.title || '新分组',
        icon: input.icon || 'SquaresFour',
        ...(input.sortKey ? {sortKey: input.sortKey} : {}),
        ...(input.iconColor ? {iconColor: input.iconColor} : {}),
        ...(input.iconBgColor ? {iconBgColor: input.iconBgColor} : {}),
        workspaceLayout: input.workspaceLayout || cloneDefaultWorkspaceLayout(),
        tiles: (input.tiles || []).map(cloneRuntimeTile),
        revision: input.revision ? {...input.revision} : createRevisionStamp(now),
    };
}

export function createSiteTile(site: Partial<SiteTile>): SiteTile {
    const now = Date.now();
    const createdAt = typeof site.createdAt === 'number' ? site.createdAt : now;
    const w = clampInt(site.layouts?.desktop.w, 1, MAX_TILE_SPAN, 1);
    const h = clampInt(site.layouts?.desktop.h, 1, MAX_TILE_SPAN, 1);
    return {
        id: site.id || now.toString(),
        tileType: 'site',
        title: site.title || '',
        url: site.url || '',
        bgColor: site.bgColor || '#3b82f6',
        iconType: site.iconType || 'auto',
        iconValue: site.iconValue || '',
        icon: site.icon || '',
        remark: site.remark || '',
        ...(site.tags ? {tags: site.tags.filter((tag): tag is string => typeof tag === 'string')} : {}),
        ...(site.styleOverride ? {styleOverride: normalizeTileStyleOverride(site.styleOverride)} : {}),
        createdAt,
        layouts: site.layouts ? cloneLayouts(site.layouts) : {desktop: {x: 0, y: 0, w, h}},
        revision: site.revision ? {...site.revision} : createRevisionStamp(createdAt),
    };
}

export function createComponentTile(widgetType: string, input: Partial<ComponentTile> = {}): ComponentTile {
    const now = Date.now();
    const createdAt = typeof input.createdAt === 'number' ? input.createdAt : now;
    const w = clampInt(input.layouts?.desktop.w, 1, MAX_TILE_SPAN, 2);
    const h = clampInt(input.layouts?.desktop.h, 1, MAX_TILE_SPAN, 2);
    return {
        id: input.id || `widget-${now}`,
        tileType: toBuiltinTileType(widgetType),
        ...(input.title ? {title: input.title} : {}),
        settings: isRecord(input.settings) ? cloneJson(input.settings) : {},
        ...(input.styleOverride ? {styleOverride: normalizeTileStyleOverride(input.styleOverride)} : {}),
        createdAt,
        layouts: input.layouts ? cloneLayouts(input.layouts) : {desktop: {x: 0, y: 0, w, h}},
        revision: input.revision ? {...input.revision} : createRevisionStamp(createdAt),
    };
}

export function updateTile(tile: TileInstance, patch: Partial<SiteTile | ComponentTile>) {
    if (typeof patch.title === 'string') tile.title = patch.title;
    if (patch.layouts) tile.layouts = cloneLayouts(patch.layouts);
    if ('styleOverride' in patch) {
        const nextStyle = normalizeTileStyleOverride(patch.styleOverride);
        if (nextStyle) tile.styleOverride = nextStyle;
        else delete tile.styleOverride;
    }

    if (isSiteTile(tile)) {
        const sitePatch = patch as Partial<SiteTile>;
        if (typeof sitePatch.url === 'string') tile.url = sitePatch.url;
        if (typeof sitePatch.icon === 'string') tile.icon = sitePatch.icon;
        if (sitePatch.iconType === 'auto' || sitePatch.iconType === 'text' || sitePatch.iconType === 'icon') tile.iconType = sitePatch.iconType;
        if (typeof sitePatch.iconValue === 'string') tile.iconValue = sitePatch.iconValue;
        if (typeof sitePatch.bgColor === 'string') tile.bgColor = sitePatch.bgColor;
        if (typeof sitePatch.remark === 'string') tile.remark = sitePatch.remark;
        if (Array.isArray(sitePatch.tags)) tile.tags = sitePatch.tags.filter((tag): tag is string => typeof tag === 'string');
    } else {
        const componentPatch = patch as Partial<ComponentTile>;
        if (isRecord(componentPatch.settings)) tile.settings = cloneJson(componentPatch.settings) as ComponentTile['settings'];
    }
    touchRevision(tile);
}

export function removeTile(workspace: Workspace, tileId: string): TileInstance | null {
    const index = workspace.tiles.findIndex((tile) => tile.id === tileId);
    if (index < 0) return null;
    return workspace.tiles.splice(index, 1)[0];
}

export function cloneRuntimeTile(tile: TileInstance): TileInstance {
    return cloneJson(tile);
}
