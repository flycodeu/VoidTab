// src/core/storage/index.ts
import type {KVStorage} from './types';
import {WebStorageAdapter} from './adapters/web';
import {ChromeStorageAdapter} from './adapters/chrome';

const isChromeStorageAvailable = () => {
    try {
        return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
    } catch {
        return false;
    }
};

export const createStorage = (): KVStorage => {
    if (isChromeStorageAvailable()) return new ChromeStorageAdapter();
    return new WebStorageAdapter();
};

export const storage: KVStorage = createStorage();

export * from './types';
