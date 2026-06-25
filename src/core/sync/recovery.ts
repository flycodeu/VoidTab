import type {ConfigV6} from '../config/types.ts';
import type {GridPlacement, TileInstance, Workspace} from '../tiles/contracts.ts';
import {solveCanvasLayout} from '../tiles/layoutSolver.ts';
import {isExternalTileType} from '../tiles/tileType.ts';
import type {SyncRecoveryRecord} from './types.ts';

const clonePlacement = (placement: GridPlacement): GridPlacement => ({...placement});

const overlaps = (left: GridPlacement, right: GridPlacement) =>
    left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const recordId = (kind: SyncRecoveryRecord['kind'], parts: Array<string | undefined>) =>
    [kind, ...parts.filter(Boolean)].join(':');

function createRecord(
    kind: SyncRecoveryRecord['kind'],
    message: string,
    now: number,
    extra: Partial<Pick<SyncRecoveryRecord, 'workspaceId' | 'tileId' | 'tileType'>> = {},
): SyncRecoveryRecord {
    return {
        id: recordId(kind, [extra.workspaceId, extra.tileId, extra.tileType]),
        kind,
        message,
        createdAt: Math.round(now),
        ...extra,
    };
}

function collectLayoutOverlapRecords(workspace: Workspace, now: number): SyncRecoveryRecord[] {
    const records: SyncRecoveryRecord[] = [];
    const profiles = ['desktop', 'tablet', 'mobile'] as const;

    for (const profile of profiles) {
        const placements: Array<{tile: TileInstance; placement: GridPlacement}> = workspace.tiles
            .map((tile) => {
                const placement = tile.layouts[profile];
                return placement ? {tile, placement: clonePlacement(placement)} : null;
            })
            .filter((entry): entry is {tile: TileInstance; placement: GridPlacement} => !!entry);

        for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
                const left = placements[leftIndex];
                const right = placements[rightIndex];
                if (!overlaps(left.placement, right.placement)) continue;
                records.push(createRecord(
                    'layout-overlap',
                    `恢复后的 ${profile} 布局存在重叠：${left.tile.id} 与 ${right.tile.id}`,
                    now,
                    {workspaceId: workspace.id, tileId: left.tile.id},
                ));
            }
        }
    }

    return records;
}

export function createSyncRecoveryRecords(
    config: ConfigV6,
    options: {now?: number} = {},
): SyncRecoveryRecord[] {
    const now = options.now ?? Date.now();
    const records: SyncRecoveryRecord[] = [];
    const seen = new Set<string>();
    const push = (record: SyncRecoveryRecord) => {
        if (seen.has(record.id)) return;
        seen.add(record.id);
        records.push(record);
    };

    for (const install of Object.values(config.tileInstalls)) {
        if (!isExternalTileType(install.tileType)) continue;
        if (install.audit?.status === 'missing-package') {
            push(createRecord(
                'install-intent-restored',
                `已恢复 ${install.installIntent?.packageId || install.tileType} 的安装意图，等待本机导入组件包`,
                now,
                {tileType: install.tileType},
            ));
        }
        if (install.audit?.status === 'revoked') {
            push(createRecord(
                'package-revoked',
                install.audit.reason || '组件包已被撤销',
                now,
                {tileType: install.tileType},
            ));
        }
    }

    for (const workspace of config.layout) {
        for (const tile of workspace.tiles) {
            if (!isExternalTileType(tile.tileType)) continue;
            const install = config.tileInstalls[tile.tileType];
            if (!install || !install.manifest || !install.views || install.enabled === false) {
                push(createRecord(
                    'missing-package',
                    `卡片 ${tile.title || tile.id} 的组件包未安装；布局和实例设置已保留`,
                    now,
                    {workspaceId: workspace.id, tileId: tile.id, tileType: tile.tileType},
                ));
            }
        }

        for (const record of collectLayoutOverlapRecords(workspace, now)) push(record);
    }

    return records;
}

export function ignoreSyncRecoveryRecord(
    records: SyncRecoveryRecord[] = [],
    recordId: string,
): SyncRecoveryRecord[] {
    return records.filter((record) => record.id !== recordId);
}

function compactWorkspaceLayouts(workspace: Workspace) {
    const profiles = ['desktop', 'tablet', 'mobile'] as const;
    for (const profile of profiles) {
        const placements: Record<string, GridPlacement> = {};
        for (const tile of workspace.tiles) {
            const placement = tile.layouts[profile];
            if (placement) placements[tile.id] = clonePlacement(placement);
        }
        const entries = Object.entries(placements);
        if (!entries.length) continue;
        const configured = workspace.workspaceLayout.profiles?.[profile];
        const cols = Math.max(
            1,
            configured?.minCols || 1,
            ...entries.map(([, placement]) => placement.x + placement.w),
        );
        const result = solveCanvasLayout({cols, placements}, {type: 'compact', profile});
        if (result.rejected) continue;
        for (const tile of workspace.tiles) {
            const placement = result.placements[tile.id];
            if (!placement) continue;
            tile.layouts = {
                ...tile.layouts,
                [profile]: clonePlacement(placement),
            };
        }
    }
}

export function resolveSyncRecoveryRecord(
    config: ConfigV6,
    recordId: string,
    options: {now?: number} = {},
): {config: ConfigV6; resolved: boolean; message: string} {
    const record = (config.sync.recoveryRecords || []).find((item) => item.id === recordId);
    if (!record) return {config, resolved: false, message: '恢复记录不存在'};
    if (record.kind !== 'layout-overlap' || !record.workspaceId) {
        return {
            config,
            resolved: false,
            message: '该记录需要手动导入组件包、更新组件或确认后忽略',
        };
    }

    const next = cloneJson(config);
    const workspace = next.layout.find((item) => item.id === record.workspaceId);
    if (!workspace) return {config, resolved: false, message: '对应工作区不存在'};
    compactWorkspaceLayouts(workspace);
    next.sync.recoveryRecords = createSyncRecoveryRecords(next, {now: options.now});
    return {
        config: next,
        resolved: true,
        message: '已紧凑修复该工作区的重叠布局',
    };
}
