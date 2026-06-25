import type {GridPlacement, RevisionStamp, TileInstance} from '../tiles/contracts.ts';
import type {SyncRecoveryRecord} from './types.ts';

export type RevisionComparison = -1 | 0 | 1;
export type RevisionConflictState = 'same' | 'local-newer' | 'remote-newer' | 'diverged';

export interface RevisionMergeResult {
    tiles: TileInstance[];
    records: SyncRecoveryRecord[];
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const overlaps = (left: GridPlacement, right: GridPlacement) =>
    left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;

export function compareRevisionStamp(left: RevisionStamp, right: RevisionStamp): RevisionComparison {
    if (left.sequence !== right.sequence) return left.sequence > right.sequence ? 1 : -1;
    if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? 1 : -1;
    if (left.deviceId === right.deviceId) return 0;
    return left.deviceId > right.deviceId ? 1 : -1;
}

export function classifyRevisionConflict(local: RevisionStamp, remote: RevisionStamp): RevisionConflictState {
    if (
        local.deviceId === remote.deviceId
        && local.sequence === remote.sequence
        && local.updatedAt === remote.updatedAt
    ) return 'same';
    if (local.deviceId === remote.deviceId) {
        return compareRevisionStamp(local, remote) > 0 ? 'local-newer' : 'remote-newer';
    }
    if (local.sequence === remote.sequence && local.updatedAt !== remote.updatedAt) return 'diverged';
    return compareRevisionStamp(local, remote) > 0 ? 'local-newer' : 'remote-newer';
}

function createRevisionRecord(
    message: string,
    now: number,
    workspaceId: string,
    tile: TileInstance,
): SyncRecoveryRecord {
    return {
        id: `revision-conflict:${workspaceId}:${tile.id}`,
        kind: 'revision-conflict',
        message,
        createdAt: Math.round(now),
        workspaceId,
        tileId: tile.id,
        tileType: tile.tileType,
    };
}

function createLayoutOverlapRecord(
    message: string,
    now: number,
    workspaceId: string,
    tile: TileInstance,
): SyncRecoveryRecord {
    return {
        id: `layout-overlap:${workspaceId}:${tile.id}`,
        kind: 'layout-overlap',
        message,
        createdAt: Math.round(now),
        workspaceId,
        tileId: tile.id,
        tileType: tile.tileType,
    };
}

function validateMergedLayouts(
    tiles: TileInstance[],
    workspaceId: string,
    now: number,
): SyncRecoveryRecord[] {
    const records: SyncRecoveryRecord[] = [];
    const profiles = ['desktop', 'tablet', 'mobile'] as const;
    for (const profile of profiles) {
        const placed = tiles
            .map((tile) => {
                const placement = tile.layouts[profile];
                return placement ? {tile, placement} : null;
            })
            .filter((entry): entry is {tile: TileInstance; placement: GridPlacement} => !!entry);
        for (let left = 0; left < placed.length; left += 1) {
            for (let right = left + 1; right < placed.length; right += 1) {
                if (!overlaps(placed[left].placement, placed[right].placement)) continue;
                records.push(createLayoutOverlapRecord(
                    `合并后的 ${profile} 布局存在重叠：${placed[left].tile.id} 与 ${placed[right].tile.id}`,
                    now,
                    workspaceId,
                    placed[left].tile,
                ));
            }
        }
    }
    return records;
}

export function mergeTilesByRevision(
    localTiles: TileInstance[],
    remoteTiles: TileInstance[],
    options: {workspaceId: string; now?: number},
): RevisionMergeResult {
    const now = options.now ?? Date.now();
    const merged = new Map<string, TileInstance>();
    const records: SyncRecoveryRecord[] = [];

    for (const tile of localTiles) merged.set(tile.id, cloneJson(tile));

    for (const remote of remoteTiles) {
        const local = merged.get(remote.id);
        if (!local) {
            merged.set(remote.id, cloneJson(remote));
            continue;
        }
        const state = classifyRevisionConflict(local.revision, remote.revision);
        if (state === 'remote-newer') {
            merged.set(remote.id, cloneJson(remote));
            continue;
        }
        if (state === 'diverged') {
            const chosen = compareRevisionStamp(local.revision, remote.revision) >= 0 ? local : remote;
            merged.set(remote.id, cloneJson(chosen));
            records.push(createRevisionRecord(
                `卡片 ${remote.title || remote.id} 在两台设备上同时修改，已按 RevisionStamp 选择较新的版本并保留恢复记录`,
                now,
                options.workspaceId,
                chosen,
            ));
        }
    }

    const tiles = [...merged.values()];
    records.push(...validateMergedLayouts(tiles, options.workspaceId, now));
    return {tiles, records};
}
