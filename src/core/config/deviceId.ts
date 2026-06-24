const DEVICE_ID_KEY = 'voidtab:config-device-id:v1';

const createDeviceId = () => {
    const random = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `device-${random}`;
};

/** Stable local identity used by migration revision stamps and rollback keys. */
export function getStableConfigDeviceId() {
    try {
        const storage = globalThis.localStorage;
        const existing = storage?.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const next = createDeviceId();
        storage?.setItem(DEVICE_ID_KEY, next);
        return next;
    } catch {
        return createDeviceId();
    }
}
