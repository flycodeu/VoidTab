import type {KVStorage} from '../types';
import {ChromeStorageAdapter} from './chrome';
import {WebStorageAdapter} from './web.ts';

function hasChromeStorage(): boolean {
    try {
        return typeof chrome !== 'undefined'
            && !!chrome.storage
            && !!chrome.storage.local;
    } catch {
        return false;
    }
}

export function createStorage(): KVStorage {
    return hasChromeStorage() ? new ChromeStorageAdapter() : new WebStorageAdapter();
}
