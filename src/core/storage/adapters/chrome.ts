// src/core/storage/adapters/chrome.ts
import type {KVStorage, StorageArea, StorageChangeHandler, StorageChangeEvent} from '../types';

type ChromeStorageArea = any; // 避免在非扩展环境下因为类型/全局 chrome 缺失导致编译/运行问题

function getChromeApi(): any | null {
    // 用 globalThis 防止某些环境下直接访问 chrome 触发 ReferenceError
    const c = (globalThis as any).chrome;
    if (!c?.storage?.local) return null;
    return c;
}

function getArea(area: StorageArea): ChromeStorageArea {
    const chromeApi = getChromeApi();
    if (!chromeApi) throw new Error('[storage] chrome.storage not available in this environment');
    return area === 'sync' ? chromeApi.storage.sync : chromeApi.storage.local;
}

function chromeGet(area: ChromeStorageArea, key: string): Promise<any> {
    return new Promise((resolve) => {
        // callback 版：最兼容
        area.get([key], (obj: any) => resolve(obj));
    });
}

function chromeSet(area: ChromeStorageArea, key: string, value: any): Promise<void> {
    return new Promise((resolve) => {
        area.set({[key]: value}, () => resolve());
    });
}

function chromeRemove(area: ChromeStorageArea, key: string): Promise<void> {
    return new Promise((resolve) => {
        area.remove([key], () => resolve());
    });
}

export class ChromeStorageAdapter implements KVStorage {
    async get<T>(key: string, fallback: T, area: StorageArea): Promise<T> {
        const a = getArea(area);
        const obj = await chromeGet(a, key);
        const v = obj?.[key];
        return (v === undefined ? fallback : (v as T));
    }

    async set<T>(key: string, value: T, area: StorageArea): Promise<void> {
        const a = getArea(area);
        await chromeSet(a, key, value);
    }

    async remove(key: string, area: StorageArea): Promise<void> {
        const a = getArea(area);
        await chromeRemove(a, key);
    }

    onChanged(handler: StorageChangeHandler): () => void {
        const chromeApi = getChromeApi();
        if (!chromeApi?.storage?.onChanged?.addListener) {
            // 网页环境：返回空取消函数，避免崩
            return () => {
            };
        }

        const listener = (changes: Record<string, any>, areaName: string) => {
            const mappedArea = (areaName === 'sync' ? 'sync' : 'local') as StorageArea;
            const mapped: StorageChangeEvent[] = Object.entries(changes).map(([key, c]) => ({
                area: mappedArea,
                key,
                oldValue: c?.oldValue,
                newValue: c?.newValue
            }));
            handler(mapped);
        };

        chromeApi.storage.onChanged.addListener(listener);
        return () => chromeApi.storage.onChanged.removeListener(listener);
    }
}

// （可选）给外面判断用：是否支持 chrome.storage
export const isChromeStorageAvailable = () => !!getChromeApi();
