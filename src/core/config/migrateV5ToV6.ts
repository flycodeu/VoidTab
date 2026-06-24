import type {ConfigBase, ConfigV5, ConfigV6, SiteItem} from './types.ts';
import {ConfigVersionTooNew} from './versioning.ts';
import {cloneLegacyWidgetSettings, adaptLegacySiteItem} from '../tiles/legacyV5Adapter.ts';
import {MAX_TILE_SPAN, normalizeWorkspaceLayout} from '../tiles/gridMetrics.ts';
import {findFirstAvailablePlacement, solveCanvasLayout} from '../tiles/layoutSolver.ts';
import type {
    ComponentTile,
    GridPlacement,
    JsonValue,
    RevisionStamp,
    TileInstance,
    TileLayouts,
    Workspace,
    WorkspaceLayout,
} from '../tiles/contracts.ts';
import {toBuiltinTileType} from '../tiles/tileType.ts';
import {isConfigV6} from './v6.ts';

const FLOW_MIGRATION_COLUMNS = 14;

export type V5ToV6MigrationWarningCode =
    | 'invalid-workspace'
    | 'invalid-item'
    | 'duplicate-workspace-id'
    | 'duplicate-tile-id'
    | 'canvas-placement-repaired'
    | 'flow-placement-overflow';

export interface V5ToV6MigrationWarning {
    code: V5ToV6MigrationWarningCode;
    message: string;
    workspaceId?: string;
    tileId?: string;
}

export interface V5ToV6MigrationOptions {
    /** Stable local device ID allocated by the P3.4 transaction layer. */
    deviceId: string;
    /** Stable transaction timestamp allocated by the P3.4 transaction layer. */
    migratedAt: number;
}

export interface V5ToV6MigrationResult {
    config: ConfigV6;
    warnings: V5ToV6MigrationWarning[];
    /** False only when an already-v6 payload is cloned and returned unchanged. */
    migrated: boolean;
}

/** Structural input failure. P3.4 must keep the original v5 snapshot in this case. */
export class ConfigV5MigrationPreflightError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigV5MigrationPreflightError';
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const cloneJson = <T>(value: T): T => {
    try {
        const serialized = JSON.stringify(value);
        if (typeof serialized !== 'string') throw new Error('not serializable');
        return JSON.parse(serialized) as T;
    } catch {
        throw new ConfigV5MigrationPreflightError('配置不是可安全迁移的 JSON 数据');
    }
};

const clonePlacement = (placement: GridPlacement): GridPlacement => ({...placement});

const cloneLayouts = (layouts: TileLayouts): TileLayouts => ({
    desktop: clonePlacement(layouts.desktop),
    ...(layouts.tablet ? {tablet: clonePlacement(layouts.tablet)} : {}),
    ...(layouts.mobile ? {mobile: clonePlacement(layouts.mobile)} : {}),
});

const maxKnownRow = (placements: Record<string, GridPlacement>) =>
    Math.max(0, ...Object.values(placements).map((placement) => placement.y + placement.h));

const readSpan = (value: unknown, fallback: number) => {
    if (!isFiniteNumber(value)) return fallback;
    return Math.max(1, Math.min(MAX_TILE_SPAN, Math.round(value)));
};

function readLegacySize(item: Record<string, unknown>) {
    const desktop = isRecord(item.layouts) && isRecord(item.layouts.desktop) ? item.layouts.desktop : undefined;
    const isWidget = item.kind === 'widget';
    return {
        w: readSpan(desktop?.w ?? item.w, isWidget ? 2 : 1),
        h: readSpan(desktop?.h ?? item.h, isWidget ? 2 : 1),
    };
}

function hasDesktopPlacement(item: Record<string, unknown>) {
    const desktop = isRecord(item.layouts) && isRecord(item.layouts.desktop) ? item.layouts.desktop : undefined;
    return !!desktop
        && isFiniteNumber(desktop.x)
        && isFiniteNumber(desktop.y)
        && isFiniteNumber(desktop.w)
        && isFiniteNumber(desktop.h);
}

function firstFlowPlacement(
    placements: Record<string, GridPlacement>,
    size: {w: number; h: number},
    warnings: V5ToV6MigrationWarning[],
    workspaceId: string,
    tileId: string,
) {
    const found = findFirstAvailablePlacement(placements, FLOW_MIGRATION_COLUMNS, size);
    if (found) return found;

    warnings.push({
        code: 'flow-placement-overflow',
        workspaceId,
        tileId,
        message: `项目 ${tileId} 宽度超过 ${FLOW_MIGRATION_COLUMNS} 列迁移网格，保留原始尺寸并置于后续行。`,
    });
    return {x: 0, y: maxKnownRow(placements), w: size.w, h: size.h};
}

function nextUniqueId(
    rawId: unknown,
    fallback: string,
    used: Set<string>,
    duplicateCode: Extract<V5ToV6MigrationWarningCode, 'duplicate-workspace-id' | 'duplicate-tile-id'>,
    warnings: V5ToV6MigrationWarning[],
    workspaceId?: string,
) {
    const base = typeof rawId === 'string' && rawId.trim() ? rawId : fallback;
    if (!used.has(base)) {
        used.add(base);
        return base;
    }

    let suffix = 2;
    let next = `${base}~${suffix}`;
    while (used.has(next)) next = `${base}~${++suffix}`;
    used.add(next);
    warnings.push({
        code: duplicateCode,
        workspaceId,
        tileId: duplicateCode === 'duplicate-tile-id' ? next : undefined,
        message: `检测到重复 ID ${base}，已将迁移副本命名为 ${next}。`,
    });
    return next;
}

function createMissingTile(
    raw: unknown,
    id: string,
    placement: GridPlacement,
    revision: RevisionStamp,
    createdAt: number,
): ComponentTile {
    const legacy = cloneLegacyWidgetSettings({raw});
    return {
        id,
        tileType: toBuiltinTileType('missing'),
        title: '需要恢复的项目',
        settings: {legacy: legacy as JsonValue},
        layouts: {desktop: clonePlacement(placement)},
        createdAt,
        revision,
    };
}

function repairCanvasPlacements(
    workspace: Workspace,
    warnings: V5ToV6MigrationWarning[],
) {
    const desktopProfile = workspace.workspaceLayout.profiles.desktop!;
    const widestTile = Math.max(1, ...workspace.tiles.map((tile) => tile.layouts.desktop.w));
    const cols = Math.max(desktopProfile.maxCols || FLOW_MIGRATION_COLUMNS, widestTile);
    if ((desktopProfile.maxCols || 0) < cols) desktopProfile.maxCols = cols;
    if (desktopProfile.minCols > cols) desktopProfile.minCols = cols;

    let placements: Record<string, GridPlacement> = {};
    for (const tile of workspace.tiles) {
        const original = clonePlacement(tile.layouts.desktop);
        const inBounds = original.x >= 0
            && original.y >= 0
            && Number.isInteger(original.x)
            && Number.isInteger(original.y)
            && Number.isInteger(original.w)
            && Number.isInteger(original.h)
            && original.w <= cols
            && original.x + original.w <= cols;
        const target = inBounds
            ? original
            : findFirstAvailablePlacement(placements, cols, {w: original.w, h: original.h})
                || {x: 0, y: maxKnownRow(placements), w: original.w, h: original.h};

        const result = solveCanvasLayout(
            {cols, placements},
            {type: 'add', profile: 'desktop', tileId: tile.id, placement: target},
        );
        if (result.rejected) {
            throw new ConfigV5MigrationPreflightError(`无法修复画布项目 ${tile.id}：${result.rejected.message}`);
        }
        if (!inBounds || result.changedTileIds.length > 1) {
            warnings.push({
                code: 'canvas-placement-repaired',
                workspaceId: workspace.id,
                tileId: tile.id,
                message: `画布项目 ${tile.id} 的位置已按确定性规则修复。`,
            });
        }
        placements = result.placements;
    }

    workspace.tiles.forEach((tile) => {
        tile.layouts = {...cloneLayouts(tile.layouts), desktop: clonePlacement(placements[tile.id])};
    });
}

function validateOptions(options: V5ToV6MigrationOptions) {
    if (!options || typeof options.deviceId !== 'string' || !options.deviceId.trim()) {
        throw new ConfigV5MigrationPreflightError('迁移需要稳定的 deviceId');
    }
    if (!isFiniteNumber(options.migratedAt) || options.migratedAt < 0) {
        throw new ConfigV5MigrationPreflightError('迁移需要有效的 migratedAt 时间戳');
    }
}

/**
 * Pure, deterministic v5 -> v6 conversion. This module has no store, Vue,
 * DOM, network, encryption, storage, or clock dependency.
 */
export function migrateV5ToV6(raw: unknown, options: V5ToV6MigrationOptions): V5ToV6MigrationResult {
    validateOptions(options);
    const snapshot = cloneJson(raw);
    if (!isRecord(snapshot)) throw new ConfigV5MigrationPreflightError('配置根节点必须是对象');

    if (snapshot.version === 6) {
        if (!isConfigV6(snapshot)) throw new ConfigV5MigrationPreflightError('v6 配置缺少 layout 或 tileInstalls');
        return {config: snapshot, warnings: [], migrated: false};
    }
    if (isFiniteNumber(snapshot.version) && snapshot.version > 6) {
        throw new ConfigVersionTooNew(snapshot.version, 6);
    }
    if (snapshot.version !== 5) {
        throw new ConfigV5MigrationPreflightError('P3.3 仅接受已规范化的 v5 配置');
    }
    if (!Array.isArray(snapshot.layout)) {
        throw new ConfigV5MigrationPreflightError('v5 layout 必须是数组，迁移已取消');
    }

    const source = snapshot as unknown as ConfigV5;
    const warnings: V5ToV6MigrationWarning[] = [];
    const workspaceIds = new Set<string>();
    let sequence = 1;
    const stamp = (): RevisionStamp => ({
        updatedAt: Math.round(options.migratedAt),
        deviceId: options.deviceId.trim(),
        sequence: sequence++,
    });

    const layout = source.layout.map((rawGroup, groupIndex): Workspace => {
        const group: Record<string, unknown> = isRecord(rawGroup)
            ? rawGroup as Record<string, unknown>
            : {};
        const workspaceId = nextUniqueId(
            group.id,
            `workspace-${groupIndex + 1}`,
            workspaceIds,
            'duplicate-workspace-id',
            warnings,
        );
        if (!isRecord(rawGroup)) {
            warnings.push({
                code: 'invalid-workspace',
                workspaceId,
                message: `第 ${groupIndex + 1} 个工作区不是对象，已创建空工作区。`,
            });
        }

        const workspaceLayout: WorkspaceLayout = normalizeWorkspaceLayout(group.workspaceLayout);
        const workspace: Workspace = {
            id: workspaceId,
            title: typeof group.title === 'string' ? group.title : '未命名',
            icon: typeof group.icon === 'string' ? group.icon : 'Folder',
            ...(typeof group.iconColor === 'string' ? {iconColor: group.iconColor} : {}),
            ...(typeof group.iconBgColor === 'string' ? {iconBgColor: group.iconBgColor} : {}),
            ...(group.sortKey === 'custom' || group.sortKey === 'name' || group.sortKey === 'lastVisited'
                ? {sortKey: group.sortKey}
                : {}),
            workspaceLayout,
            tiles: [],
            revision: stamp(),
        };

        const itemIds = new Set<string>();
        const placements: Record<string, GridPlacement> = {};
        const items = Array.isArray(group.items) ? group.items : [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            const rawItem = items[itemIndex];
            const item = isRecord(rawItem) ? rawItem : undefined;
            const tileId = nextUniqueId(
                item?.id,
                `${workspaceId}-tile-${itemIndex + 1}`,
                itemIds,
                'duplicate-tile-id',
                warnings,
                workspaceId,
            );
            const size = item ? readLegacySize(item) : {w: 2, h: 2};
            const fallback = firstFlowPlacement(placements, size, warnings, workspaceId, tileId);
            const revision = stamp();

            let tile: TileInstance;
            const validKind = item && (item.kind === undefined || item.kind === 'site' || item.kind === 'widget');
            const hasMalformedWidgetSettings = item?.kind === 'widget'
                && Object.prototype.hasOwnProperty.call(item, 'widgetConfig')
                && !isRecord(item.widgetConfig);
            if (!item || !validKind || hasMalformedWidgetSettings) {
                warnings.push({
                    code: 'invalid-item',
                    workspaceId,
                    tileId,
                    message: hasMalformedWidgetSettings
                        ? `工作区 ${workspaceId} 中第 ${itemIndex + 1} 个组件设置无效，已保留为可恢复占位。`
                        : `工作区 ${workspaceId} 中第 ${itemIndex + 1} 个项目结构无效，已保留为可恢复占位。`,
                });
                tile = createMissingTile(rawItem, tileId, fallback, revision, Math.round(options.migratedAt));
            } else {
                const legacyItem = {...item, id: tileId} as SiteItem;
                tile = adaptLegacySiteItem(legacyItem, {
                    placement: fallback,
                    revision,
                    fallbackCreatedAt: Math.round(options.migratedAt),
                });
            }

            workspace.tiles.push(tile);
            placements[tile.id] = hasDesktopPlacement(item || {})
                ? clonePlacement(tile.layouts.desktop)
                : fallback;
        }

        if (workspace.workspaceLayout.mode === 'canvas') repairCanvasPlacements(workspace, warnings);
        return workspace;
    });

    const {layout: _legacyLayout, version: _legacyVersion, tileInstalls: _legacyTileInstalls, ...base} = source as ConfigV5 & {
        tileInstalls?: unknown;
    };
    const config: ConfigV6 = {
        ...(base as ConfigBase),
        version: 6,
        layout,
        tileInstalls: {},
    };
    return {config, warnings, migrated: true};
}
