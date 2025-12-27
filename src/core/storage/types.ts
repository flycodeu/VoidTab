// src/core/storage/types.ts
export type StorageArea = 'local' | 'sync';

export interface StorageChangeEvent {
    area: StorageArea;
    key: string;
    oldValue: any;
    newValue: any;
}

export type StorageChangeHandler = (changes: StorageChangeEvent[]) => void;

/**
 * 统一存储接口：
 * - 扩展端：chrome.storage.local / chrome.storage.sync
 * - Web端：localStorage（用前缀模拟 area）
 */
export interface KVStorage {
    get<T>(key: string, fallback: T, area: StorageArea): Promise<T>;

    set<T>(key: string, value: T, area: StorageArea): Promise<void>;

    remove(key: string, area: StorageArea): Promise<void>;

    /**
     * 可选：监听变更（扩展端可用）
     * 返回 unsubscribe
     */
    onChanged?(handler: StorageChangeHandler): () => void;
}
