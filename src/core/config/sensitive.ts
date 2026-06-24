import type {ConfigBase} from './types';
import {decrypt, encrypt, generateRandomPassword, isCryptoSupported} from '../../shared/utils/crypto';

export const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';

const LOCAL_SECRET_KEY = 'voidtab:config-secret:v1';
const SENSITIVE_PATHS = [
    'sync.password',
    'ai.apiKey',
    'runtime.auth.jwtToken',
] as const;

let memorySecret = '';

function cloneConfig<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function getByPath(root: any, path: string): unknown {
    return path.split('.').reduce((acc, key) => acc?.[key], root);
}

function setByPath(root: any, path: string, value: string) {
    const keys = path.split('.');
    let cursor = root;
    for (const key of keys.slice(0, -1)) {
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
}

function isEncryptedValue(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_VALUE_PREFIX);
}

function getLocalStorage(): Storage | null {
    try {
        return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    } catch {
        return null;
    }
}

async function getLocalSecret(): Promise<string> {
    const storage = getLocalStorage();
    if (!storage) {
        if (!memorySecret) memorySecret = generateRandomPassword();
        return memorySecret;
    }

    const existing = storage.getItem(LOCAL_SECRET_KEY);
    if (existing) return existing;

    const next = generateRandomPassword();
    storage.setItem(LOCAL_SECRET_KEY, next);
    return next;
}

export async function openSensitiveConfigFromStorage(raw: any): Promise<any> {
    const copy = cloneConfig(raw);
    if (!isCryptoSupported()) return copy;

    const secret = await getLocalSecret();

    for (const path of SENSITIVE_PATHS) {
        const value = getByPath(copy, path);
        if (!isEncryptedValue(value)) continue;

        try {
            setByPath(copy, path, await decrypt(value.slice(ENCRYPTED_VALUE_PREFIX.length), secret));
        } catch {
            setByPath(copy, path, '');
        }
    }

    return copy;
}

export async function sealSensitiveConfigForStorage<T extends ConfigBase>(cfg: T): Promise<T> {
    const copy = cloneConfig(cfg);
    if (!isCryptoSupported()) return copy;

    const secret = await getLocalSecret();

    for (const path of SENSITIVE_PATHS) {
        const value = getByPath(copy, path);
        if (typeof value !== 'string' || value === '' || isEncryptedValue(value)) continue;

        const sealed = await encrypt(value, secret);
        setByPath(copy, path, `${ENCRYPTED_VALUE_PREFIX}${sealed}`);
    }

    return copy;
}

export function stripSensitiveConfigForSync<T extends ConfigBase>(cfg: T): T {
    const copy = cloneConfig(cfg);

    for (const path of SENSITIVE_PATHS) {
        setByPath(copy, path, '');
    }

    return copy;
}

export function mergeLocalSensitiveFields<T extends ConfigBase>(remote: T, local: T): T {
    const copy = cloneConfig(remote);

    for (const path of SENSITIVE_PATHS) {
        const value = getByPath(local, path);
        if (typeof value === 'string' && value !== '' && !isEncryptedValue(value)) {
            setByPath(copy, path, value);
        }
    }

    return copy;
}
