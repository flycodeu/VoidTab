import type {ComponentTile, DeclarativeValue, JsonValue} from './contracts.ts';
import {isExtensionContext, getBrowserInfo} from '../../shared/utils/browser.ts';

export interface DeclarativeDataContext {
    settings: Record<string, JsonValue>;
    data: Record<string, JsonValue>;
    host: {
        target: 'web' | 'extension';
        now: number;
        locale: string;
        browser: string;
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const readPath = (root: unknown, path: string): unknown => {
    if (!path.trim()) return undefined;
    return path.split('.').reduce<unknown>((current, key) => {
        if (!isRecord(current)) return undefined;
        return current[key];
    }, root);
};

const isDeclarativeBinding = (value: unknown): value is Extract<DeclarativeValue, {from: 'settings' | 'data' | 'host'}> =>
    isRecord(value)
    && (value.from === 'settings' || value.from === 'data' || value.from === 'host')
    && typeof value.path === 'string';

export function createDeclarativeDataContext(
    tile: Pick<ComponentTile, 'settings'>,
    data: Record<string, JsonValue> = {},
    now = Date.now(),
): DeclarativeDataContext {
    const browser = typeof navigator !== 'undefined' ? getBrowserInfo().name : 'unknown';
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN';
    return {
        settings: tile.settings || {},
        data,
        host: {
            target: isExtensionContext() ? 'extension' : 'web',
            now: Math.round(now),
            locale,
            browser,
        },
    };
}

export function resolveDeclarativeValue(value: DeclarativeValue | undefined, context: DeclarativeDataContext): JsonValue {
    if (isDeclarativeBinding(value)) {
        const source = context[value.from];
        const resolved = readPath(source, value.path);
        return resolved === undefined ? (value.fallback ?? '') : resolved as JsonValue;
    }
    if (value === undefined) return '';
    return value as JsonValue;
}

export function resolveDeclarativeText(value: DeclarativeValue | undefined, context: DeclarativeDataContext): string {
    const resolved = resolveDeclarativeValue(value, context);
    if (typeof resolved === 'string') {
        return resolved.replace(/\{\{\s*(settings|data|host)\.([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, source, path) => {
            const next = readPath(context[source as keyof DeclarativeDataContext], path);
            if (next === undefined || next === null || typeof next === 'object') return '';
            return String(next);
        });
    }
    if (resolved === null || resolved === undefined) return '';
    if (typeof resolved === 'object') return JSON.stringify(resolved);
    return String(resolved);
}

export function resolveDeclarativeBoolean(value: DeclarativeValue | undefined, context: DeclarativeDataContext): boolean {
    const resolved = resolveDeclarativeValue(value, context);
    if (typeof resolved === 'boolean') return resolved;
    if (typeof resolved === 'string') return resolved === 'true' || resolved === '1';
    if (typeof resolved === 'number') return resolved !== 0;
    return false;
}

export function normalizeDeclarativeUrl(raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value;

    try {
        const url = new URL(value);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch {
        return '';
    }
    return '';
}
