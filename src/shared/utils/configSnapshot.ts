import {toRaw} from 'vue';

function isPlainObject(value: object) {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isBrowserHostObject(value: object) {
    if (value === globalThis) return true;
    if (typeof window !== 'undefined' && value === window) return true;
    if (typeof Node !== 'undefined' && value instanceof Node) return true;
    if (typeof Event !== 'undefined' && value instanceof Event) return true;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
    return false;
}

function sanitizeSnapshotValue(value: unknown, seen: WeakSet<object>): unknown {
    const raw = toRaw(value) as unknown;

    if (raw === null) return null;

    const type = typeof raw;
    if (type === 'string' || type === 'boolean') return raw;
    if (type === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') return undefined;
    if (type !== 'object') return undefined;

    const rawObject = raw as object;

    if (isBrowserHostObject(rawObject)) return undefined;
    if (rawObject instanceof Date) return rawObject.toISOString();
    if (seen.has(rawObject)) return undefined;

    if (Array.isArray(rawObject)) {
        seen.add(rawObject);
        const out = rawObject
            .map((item) => sanitizeSnapshotValue(item, seen))
            .filter((item) => item !== undefined);
        seen.delete(rawObject);
        return out;
    }

    if (rawObject instanceof Map) {
        seen.add(rawObject);
        const out: Record<string, unknown> = {};
        for (const [key, entry] of rawObject.entries()) {
            const next = sanitizeSnapshotValue(entry, seen);
            if (next !== undefined) out[String(key)] = next;
        }
        seen.delete(rawObject);
        return out;
    }

    if (rawObject instanceof Set) {
        seen.add(rawObject);
        const out = Array.from(rawObject)
            .map((item) => sanitizeSnapshotValue(item, seen))
            .filter((item) => item !== undefined);
        seen.delete(rawObject);
        return out;
    }

    if (!isPlainObject(rawObject)) return undefined;

    seen.add(rawObject);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(rawObject)) {
        const next = sanitizeSnapshotValue(entry, seen);
        if (next !== undefined) out[key] = next;
    }
    seen.delete(rawObject);
    return out;
}

export function cloneConfigSnapshot<T>(value: T): T {
    return sanitizeSnapshotValue(value, new WeakSet<object>()) as T;
}
