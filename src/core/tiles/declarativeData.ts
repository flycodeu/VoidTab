import type {
    ComponentTile,
    DeclarativeGranularity,
    DeclarativeProvider,
    DeclarativeValue,
    JsonValue,
} from './contracts.ts';
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

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isJsonSafe = (value: unknown): value is JsonValue => {
    try {
        JSON.stringify(value);
        return value === null
            || ['string', 'number', 'boolean'].includes(typeof value)
            || Array.isArray(value)
            || isRecord(value);
    } catch {
        return false;
    }
};

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

const GRANULARITY_MS: Record<DeclarativeGranularity, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
};

const granularityMs = (granularity: DeclarativeGranularity | undefined, fallback: DeclarativeGranularity): number =>
    GRANULARITY_MS[granularity ?? fallback] ?? GRANULARITY_MS[fallback];

const floorToGranularity = (now: number, granularity: DeclarativeGranularity | undefined, fallback: DeclarativeGranularity): number => {
    const step = granularityMs(granularity, fallback);
    return Math.floor(now / step) * step;
};

const clockOutput = (epoch: number): JsonValue => {
    const date = new Date(epoch);
    return {
        epoch,
        iso: date.toISOString(),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        weekday: date.getDay(),
    };
};

const parseTargetEpoch = (value: JsonValue): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value.trim());
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
};

const countdownOutput = (remainingMs: number): JsonValue => {
    const clamped = Math.max(0, remainingMs);
    const totalSeconds = Math.floor(clamped / 1000);
    return {
        remainingMs: clamped,
        done: clamped <= 0,
        totalSeconds,
        days: Math.floor(totalSeconds / 86_400),
        hours: Math.floor((totalSeconds % 86_400) / 3_600),
        minutes: Math.floor((totalSeconds % 3_600) / 60),
        seconds: totalSeconds % 60,
    };
};

/**
 * Pure evaluation of declarative providers into the `data.<key>` namespace.
 * No DOM, no network, no global clock access other than the injected `now`.
 * `static` returns a constant; `clock`/`countdown` are quantised to their
 * granularity so the host can throttle refreshes to a safe minimum interval.
 */
export function evaluateDeclarativeProviders(
    providers: Record<string, DeclarativeProvider> | undefined,
    options: {settings?: Record<string, JsonValue>; host?: DeclarativeDataContext['host']; now?: number} = {},
): Record<string, JsonValue> {
    if (!isRecord(providers)) return {};
    const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
    const resolveContext: DeclarativeDataContext = {
        settings: options.settings || {},
        data: {},
        host: options.host || {
            target: isExtensionContext() ? 'extension' : 'web',
            now: Math.round(now),
            locale: typeof navigator !== 'undefined' ? navigator.language : 'zh-CN',
            browser: typeof navigator !== 'undefined' ? getBrowserInfo().name : 'unknown',
        },
    };

    const out: Record<string, JsonValue> = {};
    for (const [key, provider] of Object.entries(providers)) {
        if (!key.trim() || !isRecord(provider)) continue;
        if (provider.type === 'static') {
            out[key] = isJsonSafe(provider.value) ? cloneJson(provider.value) : null;
            continue;
        }
        if (provider.type === 'clock') {
            out[key] = clockOutput(floorToGranularity(now, provider.granularity, 'minute'));
            continue;
        }
        if (provider.type === 'countdown') {
            const target = parseTargetEpoch(resolveDeclarativeValue(provider.target, resolveContext));
            if (target === null) {
                out[key] = countdownOutput(0);
                continue;
            }
            const tick = floorToGranularity(now, provider.granularity, 'second');
            out[key] = countdownOutput(target - tick);
        }
    }
    return out;
}

/**
 * Smallest refresh interval (ms) required by the providers, or 0 when none are
 * time-based. The host uses this to drive a single throttled tick that pauses
 * while the page is hidden. `static` providers never request a refresh.
 */
export function declarativeProvidersRefreshMs(providers: Record<string, DeclarativeProvider> | undefined): number {
    if (!isRecord(providers)) return 0;
    let min = 0;
    for (const provider of Object.values(providers)) {
        if (!isRecord(provider)) continue;
        const step = provider.type === 'clock'
            ? granularityMs(provider.granularity, 'minute')
            : provider.type === 'countdown'
                ? granularityMs(provider.granularity, 'second')
                : 0;
        if (step <= 0) continue;
        min = min === 0 ? step : Math.min(min, step);
    }
    return min;
}

const localeOf = (context: DeclarativeDataContext): string | undefined => {
    const locale = context.host?.locale;
    return typeof locale === 'string' && locale.trim() ? locale.trim() : undefined;
};

export function formatDeclarativeNumber(
    value: JsonValue,
    context: DeclarativeDataContext,
    options: {numberStyle?: 'decimal' | 'percent'; minimumFractionDigits?: number; maximumFractionDigits?: number} = {},
): string {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return '';
    try {
        return new Intl.NumberFormat(localeOf(context), {
            style: options.numberStyle === 'percent' ? 'percent' : 'decimal',
            ...(typeof options.minimumFractionDigits === 'number' ? {minimumFractionDigits: Math.max(0, Math.min(20, options.minimumFractionDigits))} : {}),
            ...(typeof options.maximumFractionDigits === 'number' ? {maximumFractionDigits: Math.max(0, Math.min(20, options.maximumFractionDigits))} : {}),
        }).format(numeric);
    } catch {
        return String(numeric);
    }
}

export function formatDeclarativeDate(
    value: JsonValue,
    context: DeclarativeDataContext,
    options: {dateStyle?: 'short' | 'medium' | 'long' | 'full' | 'none'; timeStyle?: 'short' | 'medium' | 'long' | 'none'} = {},
): string {
    const epoch = parseTargetEpoch(value);
    if (epoch === null) return '';
    const dateStyle = options.dateStyle === 'none' ? undefined : options.dateStyle ?? 'medium';
    const timeStyle = options.timeStyle === 'none' ? undefined : options.timeStyle;
    try {
        return new Intl.DateTimeFormat(localeOf(context), {
            ...(dateStyle ? {dateStyle} : {}),
            ...(timeStyle ? {timeStyle} : {}),
        }).format(new Date(epoch));
    } catch {
        return new Date(epoch).toISOString();
    }
}

export function formatDeclarativeRelativeTime(value: JsonValue, context: DeclarativeDataContext): string {
    const epoch = parseTargetEpoch(value);
    if (epoch === null) return '';
    const now = Number.isFinite(context.host?.now) ? Number(context.host.now) : Date.now();
    const deltaSec = Math.round((epoch - now) / 1000);
    const abs = Math.abs(deltaSec);
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 31_536_000],
        ['month', 2_592_000],
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
        ['second', 1],
    ];
    const [unit, perUnit] = units.find(([, seconds]) => abs >= seconds) ?? ['second', 1];
    try {
        return new Intl.RelativeTimeFormat(localeOf(context), {numeric: 'auto'}).format(Math.round(deltaSec / perUnit), unit);
    } catch {
        return '';
    }
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

export function writeDeclarativeSettingPath(
    settings: Record<string, JsonValue>,
    path: string,
    value: JsonValue,
): Record<string, JsonValue> {
    const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
    if (!parts.length || !isJsonSafe(value)) return settings;
    const next = cloneJson(settings);
    let cursor: Record<string, JsonValue> = next;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        const current = cursor[key];
        if (!isRecord(current) || Array.isArray(current)) cursor[key] = {};
        cursor = cursor[key] as Record<string, JsonValue>;
    }
    cursor[parts[parts.length - 1]] = cloneJson(value);
    return next;
}

export function toggleDeclarativeSettingPath(
    settings: Record<string, JsonValue>,
    path: string,
    explicitValue?: JsonValue,
): Record<string, JsonValue> {
    if (explicitValue !== undefined) return writeDeclarativeSettingPath(settings, path, explicitValue);
    const current = readPath(settings, path);
    return writeDeclarativeSettingPath(settings, path, !(current === true));
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
