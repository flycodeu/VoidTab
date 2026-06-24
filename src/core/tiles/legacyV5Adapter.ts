import type {SiteItem} from '../config/types.ts';
import type {
    BuiltinTileId,
    BuiltinTileType,
    ComponentTile,
    GridPlacement,
    JsonValue,
    RevisionStamp,
    SiteTile,
    TileInstance,
    TileLayouts,
} from './contracts.ts';
import {SITE_TILE_TYPE, toBuiltinTileType} from './tileType.ts';

/**
 * The P3.1 boundary from the v5 SiteItem shape to the canonical tile shape.
 * It is deliberately pure: it neither reads stores nor mutates legacy input.
 */
export interface LegacyTileAdapterContext {
    placement: GridPlacement;
    revision: RevisionStamp;
    fallbackCreatedAt: number;
}

/** The only P3.1 helper that interprets v5 kind/widgetType discriminators. */
export function getLegacySiteItemTileType(
    item: Pick<SiteItem, 'kind' | 'widgetType'> & {kind: 'widget'},
): BuiltinTileType;
export function getLegacySiteItemTileType(item: Pick<SiteItem, 'kind' | 'widgetType'>): BuiltinTileId;
export function getLegacySiteItemTileType(item: Pick<SiteItem, 'kind' | 'widgetType'>): BuiltinTileId {
    return item.kind === 'widget' ? toBuiltinTileType(item.widgetType) : SITE_TILE_TYPE;
}

const DEFAULT_PLACEMENT: GridPlacement = {x: 0, y: 0, w: 1, h: 1};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function clonePlacement(value: unknown): GridPlacement | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<GridPlacement>;
    if (![candidate.x, candidate.y, candidate.w, candidate.h].every(isFiniteNumber)) return undefined;
    return {x: candidate.x!, y: candidate.y!, w: candidate.w!, h: candidate.h!};
}

function cloneLayouts(layouts: SiteItem['layouts'], fallback: GridPlacement): TileLayouts {
    const desktop = clonePlacement(layouts?.desktop) || clonePlacement(fallback) || {...DEFAULT_PLACEMENT};
    const tablet = clonePlacement(layouts?.tablet);
    const mobile = clonePlacement(layouts?.mobile);

    return {
        desktop,
        ...(tablet ? {tablet} : {}),
        ...(mobile ? {mobile} : {}),
    };
}

function cloneJsonValue(value: unknown, stack = new WeakSet<object>()): JsonValue | undefined {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (!value || typeof value !== 'object') return undefined;

    if (stack.has(value)) return undefined;
    stack.add(value);

    try {
        if (Array.isArray(value)) {
            return value.map((entry) => cloneJsonValue(entry, stack) ?? null);
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return undefined;

        const result: Record<string, JsonValue> = {};
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (!descriptor.enumerable || !('value' in descriptor)) continue;
            const normalized = cloneJsonValue(descriptor.value, stack);
            if (normalized !== undefined) result[key] = normalized;
        }
        return result;
    } finally {
        stack.delete(value);
    }
}

/** Exported for migration tests and for consumers that need a JSON-safe settings copy. */
export function cloneLegacyWidgetSettings(value: unknown): Record<string, JsonValue> {
    const normalized = cloneJsonValue(value);
    return normalized && !Array.isArray(normalized) && typeof normalized === 'object' ? normalized : {};
}

function cloneRevision(revision: RevisionStamp): RevisionStamp {
    return {
        updatedAt: revision.updatedAt,
        deviceId: revision.deviceId,
        sequence: revision.sequence,
    };
}

function createBase(item: SiteItem, context: LegacyTileAdapterContext) {
    const base = {
        id: item.id,
        layouts: cloneLayouts(item.layouts, context.placement),
        createdAt: isFiniteNumber(item.createdAt) ? item.createdAt : context.fallbackCreatedAt,
        revision: cloneRevision(context.revision),
    };

    return typeof item.title === 'string' ? {...base, title: item.title} : base;
}

function asOptionalString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
}

function cloneTags(value: unknown) {
    return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : undefined;
}

export function adaptLegacySiteItem(item: SiteItem, context: LegacyTileAdapterContext): TileInstance {
    const base = createBase(item, context);

    if (item.kind === 'widget') {
        const tile: ComponentTile = {
            ...base,
            tileType: toBuiltinTileType(item.widgetType),
            settings: cloneLegacyWidgetSettings(item.widgetConfig),
        };
        return tile;
    }

    const iconType = item.iconType === 'auto' || item.iconType === 'text' || item.iconType === 'icon'
        ? item.iconType
        : undefined;
    const tags = cloneTags(item.tags);
    const tile: SiteTile = {
        ...base,
        tileType: SITE_TILE_TYPE,
        url: asOptionalString(item.url) || '',
        ...(asOptionalString(item.icon) ? {icon: item.icon} : {}),
        ...(iconType ? {iconType} : {}),
        ...(asOptionalString(item.iconValue) ? {iconValue: item.iconValue} : {}),
        ...(asOptionalString(item.bgColor) ? {bgColor: item.bgColor} : {}),
        ...(asOptionalString(item.remark) ? {remark: item.remark} : {}),
        ...(tags ? {tags} : {}),
    };
    return tile;
}
