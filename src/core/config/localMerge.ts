import type {ConfigV6} from './types.ts';
import type {RevisionStamp, TileInstance, Workspace} from '../tiles/contracts.ts';

type JsonRecord = Record<string, any>;

const hasOwn = (value: unknown, key: string) =>
    !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is JsonRecord =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
};

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
        return left.every((item, index) => valuesEqual(item, right[index]));
    }
    if (isRecord(left) || isRecord(right)) {
        if (!isRecord(left) || !isRecord(right)) return false;
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        return [...keys].every((key) => valuesEqual(left[key], right[key]));
    }
    return false;
}

/**
 * Three-way merge for ordinary JSON values.
 *
 * If only one side changed, that side wins. For an actual scalar conflict the
 * current tab wins; object fields are merged independently so editing a title
 * in one tab does not erase a URL change made in another tab.
 */
function mergeValue(base: any, local: any, remote: any): any {
    if (valuesEqual(local, base)) return cloneJson(remote);
    if (valuesEqual(remote, base)) return cloneJson(local);
    if (valuesEqual(local, remote)) return cloneJson(local);

    if (Array.isArray(base) || Array.isArray(local) || Array.isArray(remote)) {
        const arrays = [base, local, remote].filter(Array.isArray) as any[][];
        const identified = arrays.every((items) => items.every((item) => isRecord(item) && typeof item.id === 'string'));
        if (identified) return mergeIdentifiedArray(base || [], local || [], remote || []);
        // Arrays without stable ids cannot be safely patched. Preserve the
        // current tab's explicit edit for those uncommon conflict cases.
        return cloneJson(local);
    }

    if (isRecord(base) || isRecord(local) || isRecord(remote)) {
        const result: JsonRecord = {};
        const keys = new Set([
            ...Object.keys(isRecord(base) ? base : {}),
            ...Object.keys(isRecord(local) ? local : {}),
            ...Object.keys(isRecord(remote) ? remote : {}),
        ]);
        for (const key of keys) {
            result[key] = mergeValue(base?.[key], local?.[key], remote?.[key]);
            if (result[key] === undefined && !hasOwn(local, key) && !hasOwn(remote, key)) {
                delete result[key];
            }
        }
        return result;
    }

    return cloneJson(local);
}

function mergeIdentifiedArray(base: JsonRecord[], local: JsonRecord[], remote: JsonRecord[]): JsonRecord[] {
    const baseMap = new Map(base.map((item) => [item.id, item]));
    const localMap = new Map(local.map((item) => [item.id, item]));
    const remoteMap = new Map(remote.map((item) => [item.id, item]));
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    const merged = new Map<string, JsonRecord>();

    for (const id of ids) {
        const baseItem = baseMap.get(id);
        const localItem = localMap.get(id);
        const remoteItem = remoteMap.get(id);

        if (!localItem && !remoteItem) continue;
        if (!baseItem) {
            merged.set(id, cloneJson(localItem || remoteItem!));
            continue;
        }
        if (!localItem) {
            if (!valuesEqual(remoteItem, baseItem)) merged.set(id, cloneJson(remoteItem!));
            continue;
        }
        if (!remoteItem) {
            if (!valuesEqual(localItem, baseItem)) merged.set(id, cloneJson(localItem));
            continue;
        }
        merged.set(id, mergeValue(baseItem, localItem, remoteItem));
    }

    const present = new Set(merged.keys());
    const order = mergeOrder(
        base.map((item) => item.id),
        local.map((item) => item.id),
        remote.map((item) => item.id),
        present,
    );
    const result = order
        .map((id) => merged.get(id))
        .filter((item): item is JsonRecord => !!item);
    for (const [id, item] of merged) {
        if (!order.includes(id)) result.push(item);
    }
    return result;
}

/** Merge a candidate with persisted data when no tab baseline is available. */
function mergeValueWithPersisted(persisted: any, candidate: any): any {
    if (candidate === undefined) return cloneJson(persisted);
    if (isRecord(persisted) && isRecord(candidate)) {
        const result: JsonRecord = {};
        const keys = new Set([...Object.keys(persisted), ...Object.keys(candidate)]);
        for (const key of keys) {
            result[key] = hasOwn(candidate, key)
                ? mergeValueWithPersisted(persisted[key], candidate[key])
                : cloneJson(persisted[key]);
        }
        return result;
    }
    if (Array.isArray(persisted) && Array.isArray(candidate)) {
        const identified = [...persisted, ...candidate]
            .every((item) => isRecord(item) && typeof item.id === 'string');
        if (identified) {
            const result = new Map<string, JsonRecord>();
            for (const item of persisted) result.set(item.id, cloneJson(item));
            for (const item of candidate) {
                const old = result.get(item.id);
                result.set(item.id, old ? mergeValueWithPersisted(old, item) : cloneJson(item));
            }
            return [...result.values()];
        }
    }
    return cloneJson(candidate);
}

function compareRevision(left: RevisionStamp, right: RevisionStamp): number {
    if (left.sequence !== right.sequence) return left.sequence > right.sequence ? 1 : -1;
    if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? 1 : -1;
    if (left.deviceId === right.deviceId) return 0;
    return left.deviceId > right.deviceId ? 1 : -1;
}

function newestRevision(left: RevisionStamp, right: RevisionStamp): RevisionStamp {
    return cloneJson(compareRevision(left, right) >= 0 ? left : right);
}

function mergeTile(
    base: TileInstance | undefined,
    local: TileInstance | undefined,
    remote: TileInstance | undefined,
): TileInstance | undefined {
    if (!local && !remote) return undefined;

    // A tile added in one tab is never lost by a stale tab saving later.
    if (!base) {
        if (!local) return cloneJson(remote);
        if (!remote) return cloneJson(local);
        const merged = mergeValue(undefined, local, remote) as TileInstance;
        merged.revision = newestRevision(local.revision, remote.revision);
        return merged;
    }

    // A deletion is safe only when the other side did not edit that tile.
    if (!local) return valuesEqual(remote, base) ? undefined : cloneJson(remote);
    if (!remote) return valuesEqual(local, base) ? undefined : cloneJson(local);

    if (valuesEqual(local, base)) return cloneJson(remote);
    if (valuesEqual(remote, base)) return cloneJson(local);

    const merged = mergeValue(base, local, remote) as TileInstance;
    merged.revision = newestRevision(local.revision, remote.revision);
    return merged;
}

function mergeOrder(base: string[], local: string[], remote: string[], present: Set<string>): string[] {
    const filteredBase = base.filter((id) => present.has(id));
    const filteredLocal = local.filter((id) => present.has(id));
    const filteredRemote = remote.filter((id) => present.has(id));

    if (valuesEqual(local, base)) return filteredRemote;
    if (valuesEqual(remote, base)) return filteredLocal;

    const result: string[] = [];
    for (const id of [...filteredRemote, ...filteredLocal, ...filteredBase]) {
        if (!result.includes(id)) result.push(id);
    }
    return result;
}

function mergeWorkspace(
    base: Workspace | undefined,
    local: Workspace | undefined,
    remote: Workspace | undefined,
): Workspace | undefined {
    if (!local && !remote) return undefined;
    if (!base) {
        if (!local) return cloneJson(remote);
        if (!remote) return cloneJson(local);
    }
    if (!local) return valuesEqual(remote, base) ? undefined : cloneJson(remote);
    if (!remote) return valuesEqual(local, base) ? undefined : cloneJson(local);

    const baseMeta = base ? {...base, tiles: undefined} : undefined;
    const localMeta = {...local, tiles: undefined};
    const remoteMeta = {...remote, tiles: undefined};
    const merged = mergeValue(baseMeta, localMeta, remoteMeta) as Workspace;

    const baseTiles = new Map((base?.tiles || []).map((tile) => [tile.id, tile]));
    const localTiles = new Map(local.tiles.map((tile) => [tile.id, tile]));
    const remoteTiles = new Map(remote.tiles.map((tile) => [tile.id, tile]));
    const tileIds = new Set([...baseTiles.keys(), ...localTiles.keys(), ...remoteTiles.keys()]);
    const mergedTiles = new Map<string, TileInstance>();

    for (const id of tileIds) {
        const tile = mergeTile(baseTiles.get(id), localTiles.get(id), remoteTiles.get(id));
        if (tile) mergedTiles.set(id, tile);
    }

    const order = mergeOrder(
        base?.tiles.map((tile) => tile.id) || [],
        local.tiles.map((tile) => tile.id),
        remote.tiles.map((tile) => tile.id),
        new Set(mergedTiles.keys()),
    );
    merged.tiles = [
        ...order.map((id) => mergedTiles.get(id)).filter((tile): tile is TileInstance => !!tile),
    ];
    for (const [id, tile] of mergedTiles) {
        if (!order.includes(id)) merged.tiles.push(tile);
    }
    if (base && merged.revision) {
        merged.revision = newestRevision(local.revision, remote.revision);
    }
    return merged;
}

function mergeLayout(base: Workspace[], local: Workspace[], remote: Workspace[]): Workspace[] {
    const baseMap = new Map(base.map((workspace) => [workspace.id, workspace]));
    const localMap = new Map(local.map((workspace) => [workspace.id, workspace]));
    const remoteMap = new Map(remote.map((workspace) => [workspace.id, workspace]));
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    const merged = new Map<string, Workspace>();

    for (const id of ids) {
        const workspace = mergeWorkspace(baseMap.get(id), localMap.get(id), remoteMap.get(id));
        if (workspace) merged.set(id, workspace);
    }

    const order = mergeOrder(
        base.map((workspace) => workspace.id),
        local.map((workspace) => workspace.id),
        remote.map((workspace) => workspace.id),
        new Set(merged.keys()),
    );
    const result = order
        .map((id) => merged.get(id))
        .filter((workspace): workspace is Workspace => !!workspace);
    for (const [id, workspace] of merged) {
        if (!order.includes(id)) result.push(workspace);
    }
    return result;
}

/** Merge current-tab edits with a newer persisted snapshot. */
export function mergeConfigV6ThreeWay(
    base: ConfigV6,
    local: ConfigV6,
    remote: ConfigV6,
): ConfigV6 {
    const merged = mergeValue(base, local, remote) as ConfigV6;
    merged.version = 6;
    merged.layout = mergeLayout(base.layout, local.layout, remote.layout);
    return merged;
}

/**
 * Fallback used by callers that do not have a tab baseline (boot/migration).
 * It treats missing tiles in the candidate as stale rather than as explicit
 * deletions, which is the safe choice when the edit history is unknown.
 */
export function mergeConfigV6WithPersisted(persisted: ConfigV6, candidate: ConfigV6): ConfigV6 {
    const merged = mergeValueWithPersisted(persisted, candidate) as ConfigV6;
    merged.version = 6;

    const persistedWorkspaces = new Map(persisted.layout.map((workspace) => [workspace.id, workspace]));
    const candidateWorkspaces = new Map(candidate.layout.map((workspace) => [workspace.id, workspace]));
    const layout: Workspace[] = [];
    const workspaceIds = new Set([...persistedWorkspaces.keys(), ...candidateWorkspaces.keys()]);
    for (const id of workspaceIds) {
        const oldWorkspace = persistedWorkspaces.get(id);
        const nextWorkspace = candidateWorkspaces.get(id);
        if (!oldWorkspace) {
            if (nextWorkspace) layout.push(cloneJson(nextWorkspace));
            continue;
        }
        if (!nextWorkspace) {
            layout.push(cloneJson(oldWorkspace));
            continue;
        }

        const result = mergeValue(oldWorkspace, nextWorkspace, oldWorkspace) as Workspace;
        const oldTiles = new Map(oldWorkspace.tiles.map((tile) => [tile.id, tile]));
        const nextTiles = new Map(nextWorkspace.tiles.map((tile) => [tile.id, tile]));
        const tiles = new Map(oldTiles);
        for (const [tileId, tile] of nextTiles) {
            const oldTile = oldTiles.get(tileId);
            tiles.set(tileId, oldTile ? mergeTile(oldTile, tile, oldTile)! : cloneJson(tile));
        }
        result.tiles = [...tiles.values()];
        layout.push(result);
    }
    merged.layout = layout;
    return merged;
}
