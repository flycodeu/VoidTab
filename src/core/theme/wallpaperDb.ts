// src/core/theme/wallpaperDb.ts

const DB_NAME = 'UserAssets';
const STORE_NAME = 'wallpapers';
const KEY = 'custom_wallpaper';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const wallpaperDb = {
    async save(file: File | Blob): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(file, KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async get(): Promise<Blob | null> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async delete(): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            console.log(reject)
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(KEY);
            tx.oncomplete = () => resolve();
        });
    }
};