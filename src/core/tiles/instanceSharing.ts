import type {
    ComponentTile,
    GridPlacement,
    JsonValue,
    RevisionStamp,
    SiteTile,
    TileInstance,
    TileLayouts,
    TileStyleOverride,
} from './contracts.ts';
import {MAX_TILE_SPAN} from './gridMetrics.ts';
import {normalizeTileStyleOverride} from './style.ts';
import {isTileType, toBuiltinTileType} from './tileType.ts';

export const TILE_INSTANCE_EXPORT_VERSION = 1 as const;

export interface TileInstanceExportV1 {
    kind: 'voidtab.tile-instance';
    version: typeof TILE_INSTANCE_EXPORT_VERSION;
    minReaderVersion: 1;
    exportedAt: number;
    sourceId: string;
    tile: TileInstance;
    sanitized: {
        sensitiveFieldsRemoved: string[];
    };
}

export interface ImportTileInstanceOptions {
    now?: number;
    id?: string;
    deviceId?: string;
}

const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|token|secret|api[_-]?key|apikey|authorization|bearer|cookie|credential|jwt|private[_-]?key|access[_-]?key|refresh[_-]?token)/i;
const SENSITIVE_QUERY_KEY_RE = /(?:token|secret|api[_-]?key|apikey|authorization|bearer|cookie|credential|jwt|password|passwd|pwd|access[_-]?key|refresh[_-]?token)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

const createRevision = (now: number, deviceId: string): RevisionStamp => ({
    updatedAt: Math.round(now),
    deviceId,
    sequence: 1,
});

function sanitizeUrl(raw: string, removed: string[], path: string) {
    const value = raw.trim();
    if (!value) return value;

    try {
        const url = new URL(value);
        if (url.username || url.password) {
            url.username = '';
            url.password = '';
            removed.push(`${path}.credentials`);
        }
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_KEY_RE.test(key)) {
                url.searchParams.delete(key);
                removed.push(`${path}.query.${key}`);
            }
        }
        return url.toString();
    } catch {
        return value.replace(/([?&](?:token|secret|api[_-]?key|apikey|authorization|password|passwd|pwd)=)[^&#\s]+/gi, (_match, prefix) => {
            removed.push(`${path}.query`);
            return prefix + '[redacted]';
        });
    }
}

function sanitizeJsonValue(value: unknown, removed: string[], path: string): JsonValue | undefined {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
        if (/^bearer\s+/i.test(value) || /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim())) {
            removed.push(path);
            return undefined;
        }
        if (/^https?:\/\//i.test(value)) return sanitizeUrl(value, removed, path);
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry, index) => sanitizeJsonValue(entry, removed, `${path}[${index}]`) ?? null);
    }
    if (!isRecord(value)) return undefined;

    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
        const entryPath = path ? `${path}.${key}` : key;
        if (SENSITIVE_KEY_RE.test(key)) {
            removed.push(entryPath);
            continue;
        }
        const sanitized = sanitizeJsonValue(entry, removed, entryPath);
        if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
}

function clonePlacement(raw: unknown, fallback: GridPlacement): GridPlacement {
    const value = isRecord(raw) ? raw : {};
    return {
        x: clampInt(value.x, 0, 10000, fallback.x),
        y: clampInt(value.y, 0, 10000, fallback.y),
        w: clampInt(value.w, 1, MAX_TILE_SPAN, fallback.w),
        h: clampInt(value.h, 1, MAX_TILE_SPAN, fallback.h),
    };
}

function cloneLayouts(raw: unknown): TileLayouts {
    const value = isRecord(raw) ? raw : {};
    const desktop = clonePlacement(value.desktop, {x: 0, y: 0, w: 1, h: 1});
    const tablet = isRecord(value.tablet) ? clonePlacement(value.tablet, desktop) : undefined;
    const mobile = isRecord(value.mobile) ? clonePlacement(value.mobile, desktop) : undefined;
    return {desktop, ...(tablet ? {tablet} : {}), ...(mobile ? {mobile} : {})};
}

function sanitizeStyle(raw: unknown): TileStyleOverride | undefined {
    return normalizeTileStyleOverride(raw);
}

function exportableTile(tile: TileInstance, removed: string[]): TileInstance {
    const clone = cloneJson(tile);
    const styleOverride = sanitizeStyle(clone.styleOverride);
    const common = {
        id: clone.id,
        ...(typeof clone.title === 'string' ? {title: clone.title} : {}),
        layouts: cloneLayouts(clone.layouts),
        ...(styleOverride ? {styleOverride} : {}),
        createdAt: typeof clone.createdAt === 'number' ? clone.createdAt : Date.now(),
        revision: clone.revision,
    };

    if (clone.tileType === 'site') {
        const url = sanitizeUrl(clone.url || '', removed, 'tile.url');
        const site: SiteTile = {
            ...common,
            tileType: 'site',
            url,
            ...(typeof clone.icon === 'string' && !clone.icon.startsWith('blob:') ? {icon: sanitizeUrl(clone.icon, removed, 'tile.icon')} : {}),
            ...(clone.iconType === 'auto' || clone.iconType === 'text' || clone.iconType === 'icon' ? {iconType: clone.iconType} : {}),
            ...(typeof clone.iconValue === 'string' ? {iconValue: clone.iconValue} : {}),
            ...(typeof clone.bgColor === 'string' ? {bgColor: clone.bgColor} : {}),
            ...(typeof clone.remark === 'string' ? {remark: clone.remark} : {}),
            ...(Array.isArray(clone.tags) ? {tags: clone.tags.filter((tag): tag is string => typeof tag === 'string')} : {}),
        };
        return site;
    }

    const settings = sanitizeJsonValue(clone.settings, removed, 'tile.settings');
    return {
        ...common,
        tileType: isTileType(clone.tileType) ? clone.tileType : toBuiltinTileType('missing'),
        settings: isRecord(settings) ? settings : {},
    };
}

export function exportTileInstance(tile: TileInstance, now = Date.now()): TileInstanceExportV1 {
    const sensitiveFieldsRemoved: string[] = [];
    return {
        kind: 'voidtab.tile-instance',
        version: TILE_INSTANCE_EXPORT_VERSION,
        minReaderVersion: 1,
        exportedAt: Math.round(now),
        sourceId: tile.id,
        tile: exportableTile(tile, sensitiveFieldsRemoved),
        sanitized: {
            sensitiveFieldsRemoved: [...new Set(sensitiveFieldsRemoved)],
        },
    };
}

function resolveRawTile(raw: unknown): unknown {
    if (isRecord(raw) && raw.kind === 'voidtab.tile-instance' && isRecord(raw.tile)) return raw.tile;
    if (isRecord(raw) && raw.tileType) return raw;
    throw new TypeError('不是有效的 VoidTab 卡片实例文件');
}

const createFallbackId = () => `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function importTileInstance(raw: unknown, options: ImportTileInstanceOptions = {}): TileInstance {
    const source = resolveRawTile(raw);
    const value = isRecord(source) ? source : {};
    const now = options.now ?? Date.now();
    const id = options.id || createFallbackId();
    const revision = createRevision(now, options.deviceId || 'import-local');
    const styleOverride = sanitizeStyle(value.styleOverride);
    const common = {
        id,
        ...(typeof value.title === 'string' ? {title: value.title} : {}),
        layouts: cloneLayouts(value.layouts),
        ...(styleOverride ? {styleOverride} : {}),
        createdAt: now,
        revision,
    };

    if (value.tileType === 'site') {
        return {
            ...common,
            tileType: 'site',
            url: typeof value.url === 'string' ? sanitizeUrl(value.url, [], 'tile.url') : '',
            ...(typeof value.icon === 'string' && !value.icon.startsWith('blob:') ? {icon: sanitizeUrl(value.icon, [], 'tile.icon')} : {}),
            ...(value.iconType === 'auto' || value.iconType === 'text' || value.iconType === 'icon' ? {iconType: value.iconType} : {}),
            ...(typeof value.iconValue === 'string' ? {iconValue: value.iconValue} : {}),
            ...(typeof value.bgColor === 'string' ? {bgColor: value.bgColor} : {}),
            ...(typeof value.remark === 'string' ? {remark: value.remark} : {}),
            ...(Array.isArray(value.tags) ? {tags: value.tags.filter((tag): tag is string => typeof tag === 'string')} : {}),
        };
    }

    const settings = sanitizeJsonValue(value.settings, [], 'tile.settings');
    return {
        ...common,
        tileType: isTileType(value.tileType) && value.tileType !== 'site' ? value.tileType : toBuiltinTileType('missing'),
        settings: isRecord(settings) ? settings : {},
    } as ComponentTile;
}
