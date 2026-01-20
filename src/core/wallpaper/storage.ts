// src/core/wallpaper/storage.ts
// 轻量 IndexedDB Blob 存储（不进 pinia、不进 JSON）
// 用于保存上传的图片/视频壁纸

type StoredRecord = {
    key: string;
    type: string; // mime
    blob: Blob;
    createdAt: number;
};

const DB_NAME = 'app-assets';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function txDone(tx: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export const wallpaperStorage = {
    async save(file: Blob, mime: string) {
        const db = await openDB();
        const key = `wp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record: StoredRecord = {
            key,
            type: mime,
            blob: file,
            createdAt: Date.now()
        };

        store.put(record);
        await txDone(tx);
        db.close();

        return key;
    },

    async get(key: string) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const record = await new Promise<StoredRecord | undefined>((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result as StoredRecord | undefined);
            req.onerror = () => reject(req.error);
        });

        db.close();
        return record;
    },

    async remove(key: string) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        await txDone(tx);
        db.close();
    }
};
