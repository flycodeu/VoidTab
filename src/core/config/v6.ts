import type {ConfigSchemaValidationResult} from './validate.ts';
import {validateConfigForSave} from './validate.ts';
import {normalizeConfig} from './normalize.ts';
import type {ConfigV6} from './types.ts';
import type {GridPlacement, RevisionStamp, TileInstance, TileLayouts, Workspace} from '../tiles/contracts.ts';
import {MAX_TILE_SPAN, normalizeWorkspaceLayout} from '../tiles/gridMetrics.ts';
import {cloneLegacyWidgetSettings} from '../tiles/legacyV5Adapter.ts';
import {normalizeTileStyleOverride} from '../tiles/style.ts';
import {isTileType, toBuiltinTileType} from '../tiles/tileType.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clampInt = (value: unknown, min: number, max: number, fallback: number) =>
    isFiniteNumber(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

function normalizePlacement(raw: unknown, fallback: GridPlacement): GridPlacement {
    const value = isRecord(raw) ? raw : {};
    return {
        x: clampInt(value.x, 0, 10000, fallback.x),
        y: clampInt(value.y, 0, 10000, fallback.y),
        w: clampInt(value.w, 1, MAX_TILE_SPAN, fallback.w),
        h: clampInt(value.h, 1, MAX_TILE_SPAN, fallback.h),
    };
}

function normalizeLayouts(raw: unknown): TileLayouts {
    const value = isRecord(raw) ? raw : {};
    const desktop = normalizePlacement(value.desktop, {x: 0, y: 0, w: 1, h: 1});
    const tablet = isRecord(value.tablet) ? normalizePlacement(value.tablet, desktop) : undefined;
    const mobile = isRecord(value.mobile) ? normalizePlacement(value.mobile, desktop) : undefined;
    return {desktop, ...(tablet ? {tablet} : {}), ...(mobile ? {mobile} : {})};
}

function normalizeRevision(raw: unknown): RevisionStamp {
    const value = isRecord(raw) ? raw : {};
    return {
        updatedAt: clampInt(value.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        deviceId: typeof value.deviceId === 'string' && value.deviceId.trim() ? value.deviceId : 'migration-unknown',
        sequence: clampInt(value.sequence, 0, Number.MAX_SAFE_INTEGER, 0),
    };
}

function normalizeTile(raw: unknown, index: number): TileInstance {
    const value = isRecord(raw) ? raw : {};
    const id = typeof value.id === 'string' && value.id.trim() ? value.id : `tile-${index + 1}`;
    const common = {
        id,
        ...(typeof value.title === 'string' ? {title: value.title} : {}),
        layouts: normalizeLayouts(value.layouts),
        ...(normalizeTileStyleOverride(value.styleOverride) ? {styleOverride: normalizeTileStyleOverride(value.styleOverride)} : {}),
        revision: normalizeRevision(value.revision),
        createdAt: clampInt(value.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };

    if (value.tileType === 'site') {
        const iconType = value.iconType === 'auto' || value.iconType === 'text' || value.iconType === 'icon'
            ? value.iconType
            : undefined;
        const tags = Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : undefined;
        return {
            ...common,
            tileType: 'site',
            url: typeof value.url === 'string' ? value.url : '',
            ...(typeof value.icon === 'string' ? {icon: value.icon} : {}),
            ...(iconType ? {iconType} : {}),
            ...(typeof value.iconValue === 'string' ? {iconValue: value.iconValue} : {}),
            ...(typeof value.bgColor === 'string' ? {bgColor: value.bgColor} : {}),
            ...(typeof value.remark === 'string' ? {remark: value.remark} : {}),
            ...(tags ? {tags} : {}),
        };
    }

    const settings = cloneLegacyWidgetSettings(value.settings);
    if (isTileType(value.tileType) && value.tileType !== 'site') {
        return {...common, tileType: value.tileType, settings};
    }
    return {
        ...common,
        tileType: toBuiltinTileType('missing'),
        settings: {legacy: cloneLegacyWidgetSettings({raw: value})},
    };
}

function normalizeWorkspace(raw: unknown, index: number): Workspace {
    const value = isRecord(raw) ? raw : {};
    const tiles = Array.isArray(value.tiles) ? value.tiles.map(normalizeTile) : [];
    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : `workspace-${index + 1}`,
        title: typeof value.title === 'string' ? value.title : '未命名',
        icon: typeof value.icon === 'string' ? value.icon : 'Folder',
        ...(typeof value.iconColor === 'string' ? {iconColor: value.iconColor} : {}),
        ...(typeof value.iconBgColor === 'string' ? {iconBgColor: value.iconBgColor} : {}),
        ...(value.sortKey === 'custom' || value.sortKey === 'name' || value.sortKey === 'lastVisited'
            ? {sortKey: value.sortKey}
            : {}),
        workspaceLayout: normalizeWorkspaceLayout(value.workspaceLayout),
        tiles,
        revision: normalizeRevision(value.revision),
    };
}

function normalizeTileInstalls(raw: unknown): ConfigV6['tileInstalls'] {
    const value = isRecord(raw) ? raw : {};
    const installs: ConfigV6['tileInstalls'] = {};
    for (const [id, install] of Object.entries(value)) {
        if (!isRecord(install) || !isTileType(install.tileType)) continue;
        installs[id] = {
            tileType: install.tileType,
            version: typeof install.version === 'string' ? install.version : '',
            source: install.source === 'builtin' || install.source === 'official' || install.source === 'local'
                ? install.source
                : 'local',
            runtime: install.runtime === 'sandbox' ? 'sandbox' : 'declarative',
            sha256: typeof install.sha256 === 'string' ? install.sha256 : '',
            enabled: install.enabled === true,
            installedAt: clampInt(install.installedAt, 0, Number.MAX_SAFE_INTEGER, 0),
            updatedAt: clampInt(install.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
            ...(install.pinnedVersion === true ? {pinnedVersion: true} : {}),
        };
    }
    return installs;
}

/**
 * A non-mutating version discriminator for P3.3 migration and safe imports.
 * Full field validation remains the responsibility of validateConfigForSaveV6.
 */
export function isConfigV6(value: unknown): value is ConfigV6 {
    return isRecord(value)
        && value.version === 6
        && Array.isArray(value.layout)
        && isRecord(value.tileInstalls);
}

/** Pure shape completion for the P3.3 migration output before an eventual commit. */
export function normalizeConfigV6(raw: unknown): ConfigV6 {
    const snapshot = cloneJson(raw);
    if (!isConfigV6(snapshot)) throw new TypeError('v6 配置缺少 layout 或 tileInstalls');
    // Reuse the existing base-config normalizer without ever feeding its v5
    // Group.items adapter a v6 tile. The canonical layout is merged back below.
    const normalizedBase = normalizeConfig({
        ...snapshot,
        version: 5,
        layout: snapshot.layout.map((workspace) => ({
            id: workspace?.id,
            title: workspace?.title,
            icon: workspace?.icon,
            items: [],
        })),
    });
    return {
        ...normalizedBase,
        version: 6,
        layout: snapshot.layout.map(normalizeWorkspace),
        tileInstalls: normalizeTileInstalls(snapshot.tileInstalls),
    };
}

const isValidPlacement = (value: unknown) => isRecord(value)
    && [value.x, value.y, value.w, value.h].every(Number.isInteger)
    && Number(value.x) >= 0
    && Number(value.y) >= 0
    && Number(value.w) >= 1
    && Number(value.w) <= MAX_TILE_SPAN
    && Number(value.h) >= 1
    && Number(value.h) <= MAX_TILE_SPAN;

const addError = (errors: string[], message: string) => {
    if (errors.length < 12) errors.push(message);
};

/** Validate the v6-specific layout while reusing the existing base-config checks. */
export function validateConfigForSaveV6(raw: unknown): ConfigSchemaValidationResult {
    if (!isConfigV6(raw)) {
        return {ok: false, errors: ['根节点不是有效的 v6 配置'], warnings: []};
    }

    const projection = {
        ...raw,
        layout: raw.layout.map((workspace) => ({
            id: workspace?.id,
            title: workspace?.title,
            icon: workspace?.icon,
            items: [],
        })),
    };
    const base = validateConfigForSave(projection);
    const errors = [...base.errors];
    const workspaceIds = new Set<string>();

    raw.layout.forEach((workspace, workspaceIndex) => {
        if (!workspace || typeof workspace.id !== 'string' || !workspace.id) {
            addError(errors, `layout[${workspaceIndex}].id 必须是非空字符串`);
            return;
        }
        if (workspaceIds.has(workspace.id)) addError(errors, `layout[${workspaceIndex}].id 重复`);
        workspaceIds.add(workspace.id);
        if (!Array.isArray(workspace.tiles)) {
            addError(errors, `layout[${workspaceIndex}].tiles 必须是数组`);
            return;
        }
        if (!isRecord(workspace.workspaceLayout) || !isRecord(workspace.workspaceLayout.profiles)) {
            addError(errors, `layout[${workspaceIndex}].workspaceLayout 无效`);
        }

        const tileIds = new Set<string>();
        workspace.tiles.forEach((tile, tileIndex) => {
            const label = `layout[${workspaceIndex}].tiles[${tileIndex}]`;
            if (!tile || typeof tile.id !== 'string' || !tile.id) {
                addError(errors, `${label}.id 必须是非空字符串`);
                return;
            }
            if (tileIds.has(tile.id)) addError(errors, `${label}.id 重复`);
            tileIds.add(tile.id);
            if (!isTileType(tile.tileType)) addError(errors, `${label}.tileType 无效`);
            if (!isValidPlacement(tile.layouts?.desktop)) addError(errors, `${label}.layouts.desktop 无效`);
            if (!isRecord(tile.revision) || typeof tile.revision.deviceId !== 'string') {
                addError(errors, `${label}.revision 无效`);
            }
            if (tile.tileType === 'site') {
                if (typeof tile.url !== 'string') addError(errors, `${label}.url 必须是字符串`);
            } else if (!isRecord(tile.settings)) {
                addError(errors, `${label}.settings 必须是对象`);
            }
        });
    });

    return {ok: errors.length === 0, errors, warnings: base.warnings};
}
