// src/shared/utils/persist.ts
export function loadJson<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function saveJson(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Optional persisted state keeps its in-memory value when storage is unavailable.
    }
}

export function removeKey(key: string) {
    localStorage.removeItem(key);
}
