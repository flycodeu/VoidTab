import type {KVStorage, StorageArea, StorageChangeHandler, StorageChangeEvent} from '../types';

function makeKey(area: StorageArea, key: string) {
    return `voidtab:${area}:${key}`;
}

export class WebStorageAdapter implements KVStorage {
    async get<T>(key: string, fallback: T, area: StorageArea): Promise<T> {
        const k = makeKey(area, key);
        const raw = localStorage.getItem(k);
        if (raw == null) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            // 如果历史数据不是 JSON，也兜底返回字符串
            return (raw as unknown) as T;
        }
    }

    async set<T>(key: string, value: T, area: StorageArea): Promise<void> {
        const k = makeKey(area, key);
        localStorage.setItem(k, JSON.stringify(value));
    }

    async remove(key: string, area: StorageArea): Promise<void> {
        const k = makeKey(area, key);
        localStorage.removeItem(k);
    }

    onChanged(handler: StorageChangeHandler): () => void {
        const listener = (ev: StorageEvent) => {
            if (!ev.key) return;
            if (!ev.key.startsWith('voidtab:')) return;

            const [, area, key] = ev.key.split(':'); // voidtab:local:xxx
            if (!area || !key) return;

            const change: StorageChangeEvent = {
                area: (area as StorageArea),
                key,
                oldValue: ev.oldValue ? safeParse(ev.oldValue) : undefined,
                newValue: ev.newValue ? safeParse(ev.newValue) : undefined
            };

            handler([change]);
        };

        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
    }
}

function safeParse(v: string) {
    try {
        return JSON.parse(v);
    } catch {
        return v;
    }
}
