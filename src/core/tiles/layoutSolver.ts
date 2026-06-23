import type {GridPlacement, LayoutProfileId, TileSize, TileSizeRules} from './contracts.ts';

export type LayoutCommand =
    | {type: 'add'; profile: LayoutProfileId; tileId: string; placement: GridPlacement}
    | {type: 'move'; profile: LayoutProfileId; tileId: string; x: number; y: number}
    | {type: 'resize'; profile: LayoutProfileId; tileId: string; w: number; h: number; anchor: 'nw' | 'ne' | 'sw' | 'se'}
    | {type: 'remove'; profile: LayoutProfileId; tileId: string}
    | {type: 'compact'; profile: LayoutProfileId};

export type LayoutRejectionCode = 'out-of-bounds' | 'invalid-size' | 'locked' | 'no-space' | 'missing-tile';

export interface LayoutRejection {
    code: LayoutRejectionCode;
    message: string;
}

export interface CanvasLayoutInput {
    cols: number;
    placements: Record<string, GridPlacement>;
    sizeRules?: Record<string, TileSizeRules | undefined>;
    lockedTileIds?: readonly string[];
}

export interface LayoutResult {
    placements: Record<string, GridPlacement>;
    changedTileIds: string[];
    rejected?: LayoutRejection;
}

const clonePlacement = (placement: GridPlacement): GridPlacement => ({...placement});

const clonePlacements = (placements: Record<string, GridPlacement>) =>
    Object.fromEntries(Object.entries(placements).map(([id, placement]) => [id, clonePlacement(placement)])) as Record<string, GridPlacement>;

const isIntegerAtLeast = (value: number, min: number) => Number.isInteger(value) && value >= min;

const isPlacementShapeValid = (placement: GridPlacement) =>
    isIntegerAtLeast(placement.x, 0)
    && isIntegerAtLeast(placement.y, 0)
    && isIntegerAtLeast(placement.w, 1)
    && isIntegerAtLeast(placement.h, 1);

const overlaps = (a: GridPlacement, b: GridPlacement) =>
    a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;

const samePlacement = (a: GridPlacement | undefined, b: GridPlacement | undefined) =>
    !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const compareTileIdsByPlacement = (placements: Record<string, GridPlacement>, left: string, right: string) => {
    const a = placements[left];
    const b = placements[right];
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return left.localeCompare(right);
};

const placementFitsGrid = (placement: GridPlacement, cols: number) =>
    isPlacementShapeValid(placement) && placement.x + placement.w <= cols;

const isSizeAllowed = (placement: TileSize, rules?: TileSizeRules) => {
    if (!rules) return true;
    if (placement.w < rules.min.w || placement.h < rules.min.h) return false;
    if (placement.w > rules.max.w || placement.h > rules.max.h) return false;
    if (!rules.allowed?.length) return true;
    return rules.allowed.some((allowed) => allowed.w === placement.w && allowed.h === placement.h);
};

const collisionIds = (placements: Record<string, GridPlacement>, target: GridPlacement, excluded: string) =>
    Object.keys(placements)
        .filter((id) => id !== excluded && overlaps(placements[id], target))
        .sort((left, right) => compareTileIdsByPlacement(placements, left, right));

const findNearestY = (
    placements: Record<string, GridPlacement>,
    tileId: string,
    placement: GridPlacement,
    minimumY: number,
) => {
    const candidate = {...placement, y: minimumY};
    while (true) {
        const blockers = collisionIds(placements, candidate, tileId);
        if (!blockers.length) return candidate.y;
        candidate.y = Math.max(candidate.y + 1, ...blockers.map((id) => placements[id].y + placements[id].h));
    }
};

/** Finds the first top-to-bottom, left-to-right open placement for a tile size. */
export function findFirstAvailablePlacement(
    placements: Record<string, GridPlacement>,
    cols: number,
    size: TileSize,
): GridPlacement | undefined {
    if (!Number.isInteger(cols) || cols < 1 || size.w < 1 || size.h < 1 || size.w > cols) return undefined;
    const maxKnownRow = Math.max(0, ...Object.values(placements).map((placement) => placement.y + placement.h));
    for (let y = 0; y <= maxKnownRow + 1; y += 1) {
        for (let x = 0; x <= cols - size.w; x += 1) {
            const candidate = {x, y, w: size.w, h: size.h};
            if (!collisionIds(placements, candidate, '')) return candidate;
        }
    }
    return undefined;
}

const rejection = (placements: Record<string, GridPlacement>, code: LayoutRejectionCode, message: string): LayoutResult => ({
    placements: clonePlacements(placements),
    changedTileIds: [],
    rejected: {code, message},
});

const changedIds = (before: Record<string, GridPlacement>, after: Record<string, GridPlacement>) => {
    const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...ids].filter((id) => !samePlacement(before[id], after[id])).sort();
};

const resolveDisplacement = (
    working: Record<string, GridPlacement>,
    activeId: string,
    activePlacement: GridPlacement,
) => {
    const collided = collisionIds(working, activePlacement, activeId);
    const displaced = collided.map((id) => ({id, placement: clonePlacement(working[id])}));
    for (const {id} of displaced) delete working[id];
    working[activeId] = clonePlacement(activePlacement);

    for (const {id, placement} of displaced) {
        const minimumY = Math.max(placement.y, activePlacement.y + activePlacement.h);
        working[id] = {...placement, y: findNearestY(working, id, placement, minimumY)};
    }
};

const compactPlacements = (placements: Record<string, GridPlacement>, cols: number) => {
    const compacted: Record<string, GridPlacement> = {};
    const orderedIds = Object.keys(placements).sort((left, right) => compareTileIdsByPlacement(placements, left, right));

    for (const id of orderedIds) {
        const original = placements[id];
        let placed: GridPlacement | undefined;
        for (let y = 0; y <= original.y && !placed; y += 1) {
            for (let x = 0; x <= cols - original.w; x += 1) {
                const candidate = {...original, x, y};
                if (!collisionIds(compacted, candidate, id).length) {
                    placed = candidate;
                    break;
                }
            }
        }
        compacted[id] = placed || clonePlacement(original);
    }
    return compacted;
};

const resizePlacement = (current: GridPlacement, command: Extract<LayoutCommand, {type: 'resize'}>): GridPlacement => {
    const resized = {...current, w: command.w, h: command.h};
    if (command.anchor === 'ne' || command.anchor === 'se') resized.x = current.x + current.w - command.w;
    if (command.anchor === 'sw' || command.anchor === 'se') resized.y = current.y + current.h - command.h;
    return resized;
};

/**
 * Deterministic, DOM-free canvas layout prototype for P0.
 * It does not mutate the supplied placements and is intentionally not connected to MainGrid yet.
 */
export function solveCanvasLayout(input: CanvasLayoutInput, command: LayoutCommand): LayoutResult {
    const before = clonePlacements(input.placements);
    if (!Number.isInteger(input.cols) || input.cols < 1) {
        return rejection(before, 'out-of-bounds', '网格列数必须是大于 0 的整数');
    }

    if (command.type === 'compact') {
        const compacted = compactPlacements(before, input.cols);
        return {placements: compacted, changedTileIds: changedIds(before, compacted)};
    }

    const isLocked = new Set(input.lockedTileIds || []);
    if (command.type !== 'add' && !before[command.tileId]) {
        return rejection(before, 'missing-tile', '找不到要操作的卡片');
    }
    if (isLocked.has(command.tileId)) {
        return rejection(before, 'locked', '该卡片已锁定，不能修改布局');
    }

    if (command.type === 'remove') {
        delete before[command.tileId];
        return {placements: before, changedTileIds: [command.tileId]};
    }

    let target: GridPlacement;
    if (command.type === 'add') {
        if (before[command.tileId]) return rejection(before, 'missing-tile', '同 ID 卡片已存在');
        target = clonePlacement(command.placement);
    } else if (command.type === 'move') {
        target = {...before[command.tileId], x: command.x, y: command.y};
    } else {
        target = resizePlacement(before[command.tileId], command);
    }

    if (!placementFitsGrid(target, input.cols)) {
        return rejection(before, 'out-of-bounds', '目标位置或尺寸超出当前网格');
    }
    if (!isSizeAllowed(target, input.sizeRules?.[command.tileId])) {
        return rejection(before, 'invalid-size', '目标尺寸不在该卡片允许范围内');
    }

    const working = clonePlacements(before);
    delete working[command.tileId];
    const lockedCollision = collisionIds(working, target, command.tileId).find((id) => isLocked.has(id));
    if (lockedCollision) return rejection(before, 'locked', '目标位置与已锁定卡片冲突');

    resolveDisplacement(working, command.tileId, target);
    return {placements: working, changedTileIds: changedIds(before, working)};
}
