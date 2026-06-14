type StoredRecord = {
    key: string;
    type: string;
    blob: Blob;
    createdAt: number;
    sourceUrl?: string;
    updatedAt?: number;
};

const DB_NAME = 'app-assets';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const REMOTE_IMAGE_PREFIX = 'remote-image:';
const REMOTE_IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMOTE_IMAGE_MAX_ENTRIES = 24;
const REMOTE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {keyPath: 'key'});
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

function hashString(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function getRemoteImageKey(url: string) {
    return `${REMOTE_IMAGE_PREFIX}${hashString(url)}-${hashString(url.slice(-96))}`;
}

async function putRecord(record: StoredRecord) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    await txDone(tx);
    db.close();
}

async function readRecord(key: string) {
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
}

async function deleteRecord(key: string) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    await txDone(tx);
    db.close();
}

async function pruneRemoteImageCache(maxEntries = REMOTE_IMAGE_MAX_ENTRIES) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();
    const kept: Array<{key: string; updatedAt: number}> = [];

    await new Promise<void>((resolve, reject) => {
        const req = store.openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve();
                return;
            }

            const record = cursor.value as StoredRecord;
            if (String(record?.key || '').startsWith(REMOTE_IMAGE_PREFIX)) {
                const updatedAt = Number(record.updatedAt || record.createdAt || 0);
                if (!updatedAt || now - updatedAt > REMOTE_IMAGE_TTL_MS) {
                    cursor.delete();
                } else {
                    kept.push({key: record.key, updatedAt});
                }
            }
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });

    await txDone(tx);
    db.close();

    const overflow = kept
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(maxEntries)
        .map((item) => item.key);

    if (!overflow.length) return;
    const cleanupDb = await openDB();
    const cleanupTx = cleanupDb.transaction(STORE_NAME, 'readwrite');
    const cleanupStore = cleanupTx.objectStore(STORE_NAME);
    for (const key of overflow) cleanupStore.delete(key);
    await txDone(cleanupTx);
    cleanupDb.close();
}

export const wallpaperStorage = {
    async save(file: Blob, mime: string) {
        const key = `wp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await putRecord({
            key,
            type: mime,
            blob: file,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return key;
    },

    async get(key: string) {
        return await readRecord(key);
    },

    async remove(key: string) {
        await deleteRecord(key);
    },

    async getCachedRemoteImage(url: string, ttlMs = REMOTE_IMAGE_TTL_MS) {
        const record = await readRecord(getRemoteImageKey(url));
        if (!record?.blob || !String(record.type || '').startsWith('image/')) return undefined;

        const updatedAt = Number(record.updatedAt || record.createdAt || 0);
        if (!updatedAt || Date.now() - updatedAt > ttlMs) {
            await deleteRecord(record.key);
            return undefined;
        }

        return record;
    },

    async cacheRemoteImage(url: string, blob: Blob, mime = blob.type || 'image/*') {
        if (!blob || blob.size <= 0 || blob.size > REMOTE_IMAGE_MAX_BYTES) return '';
        if (!String(mime || '').startsWith('image/')) return '';

        const key = getRemoteImageKey(url);
        await putRecord({
            key,
            type: mime,
            blob,
            sourceUrl: url,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        void pruneRemoteImageCache().catch(() => null);
        return key;
    },
};
