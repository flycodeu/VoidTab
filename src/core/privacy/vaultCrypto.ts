import type {
    PrivacyVaultEnvelope,
    PrivacyVaultKdf,
    PrivacyVaultPayload,
    PrivacyVaultPayloadV2,
} from '../config/types';

const VAULT_PAYLOAD_VERSION = 2 as const;
const VAULT_ENVELOPE_VERSION = 1 as const;
const VAULT_ALGORITHM = 'AES-256-GCM' as const;
const AES_GCM = 'AES-GCM';
const PBKDF2 = 'PBKDF2';
const HASH = 'SHA-256';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 600000;
const VERIFIER_TEXT = 'voidtab-privacy-vault:v1';

export const emptyPrivacyVaultPayload = (): PrivacyVaultPayloadV2 => ({
    version: VAULT_PAYLOAD_VERSION,
    workspaces: [],
    tiles: [],
});

const assertCrypto = () => {
    if (
        typeof globalThis.crypto === 'undefined' ||
        typeof globalThis.crypto.subtle === 'undefined' ||
        typeof globalThis.crypto.getRandomValues === 'undefined'
    ) {
        throw new Error('当前浏览器不支持 Web Crypto，无法启用安全区。');
    }
};

const randomBytes = (length: number) => {
    assertCrypto();
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
};

const base64ToBytes = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const encodeText = (value: string) => new TextEncoder().encode(value);
const decodeText = (value: ArrayBuffer) => new TextDecoder().decode(value);

const deriveKey = async (password: string, kdf: PrivacyVaultKdf): Promise<CryptoKey> => {
    assertCrypto();

    if (kdf.name !== 'PBKDF2-SHA256') {
        throw new Error('当前版本暂不支持该加密参数。');
    }

    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        encodeText(password),
        PBKDF2,
        false,
        ['deriveKey']
    );

    return await globalThis.crypto.subtle.deriveKey(
        {
            name: PBKDF2,
            salt: base64ToBytes(kdf.salt) as BufferSource,
            iterations: kdf.iterations,
            hash: HASH,
        },
        keyMaterial,
        {
            name: AES_GCM,
            length: 256,
        },
        false,
        ['encrypt', 'decrypt']
    );
};

const encryptString = async (plainText: string, key: CryptoKey) => {
    const iv = randomBytes(IV_LENGTH);
    const encrypted = await globalThis.crypto.subtle.encrypt(
        {name: AES_GCM, iv: iv as BufferSource},
        key,
        encodeText(plainText)
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return bytesToBase64(combined);
};

const decryptString = async (cipherText: string, key: CryptoKey) => {
    try {
        const combined = base64ToBytes(cipherText);
        const iv = combined.slice(0, IV_LENGTH);
        const encrypted = combined.slice(IV_LENGTH);
        const plain = await globalThis.crypto.subtle.decrypt(
            {name: AES_GCM, iv: iv as BufferSource},
            key,
            encrypted as BufferSource
        );
        return decodeText(plain);
    } catch {
        throw new Error('密码错误或数据已损坏。');
    }
};

const normalizePayload = (raw: unknown): PrivacyVaultPayload => {
    if (!raw || typeof raw !== 'object') return emptyPrivacyVaultPayload();
    const payload = raw as {
        version?: unknown;
        groups?: unknown;
        sites?: unknown;
        workspaces?: unknown;
        tiles?: unknown;
    };
    if (payload.version === 2) {
        return {
            version: 2,
            workspaces: Array.isArray(payload.workspaces) ? payload.workspaces : [],
            tiles: Array.isArray(payload.tiles) ? payload.tiles : [],
        };
    }
    return {
        version: 1,
        groups: Array.isArray(payload.groups) ? payload.groups : [],
        sites: Array.isArray(payload.sites) ? payload.sites : [],
    };
};

export const createPrivacyVaultEnvelope = async (
    password: string,
    payload: PrivacyVaultPayload = emptyPrivacyVaultPayload()
): Promise<PrivacyVaultEnvelope> => {
    const kdf: PrivacyVaultKdf = {
        name: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(randomBytes(SALT_LENGTH)),
    };
    const key = await deriveKey(password, kdf);

    return {
        version: VAULT_ENVELOPE_VERSION,
        alg: VAULT_ALGORITHM,
        kdf,
        verifier: await encryptString(VERIFIER_TEXT, key),
        ciphertext: await encryptString(JSON.stringify(normalizePayload(payload)), key),
        updatedAt: Date.now(),
    };
};

export const openPrivacyVaultEnvelope = async (
    envelope: PrivacyVaultEnvelope,
    password: string
): Promise<PrivacyVaultPayload> => {
    if (envelope.alg !== VAULT_ALGORITHM) {
        throw new Error('加密算法不受支持。');
    }

    const key = await deriveKey(password, envelope.kdf);
    const verifier = await decryptString(envelope.verifier, key);
    if (verifier !== VERIFIER_TEXT) {
        throw new Error('密码错误或数据已损坏。');
    }

    const payloadText = await decryptString(envelope.ciphertext, key);
    return normalizePayload(JSON.parse(payloadText));
};

export const resealPrivacyVaultEnvelope = async (
    envelope: PrivacyVaultEnvelope,
    password: string,
    payload: PrivacyVaultPayload
): Promise<PrivacyVaultEnvelope> => {
    const key = await deriveKey(password, envelope.kdf);
    const verifier = await decryptString(envelope.verifier, key);
    if (verifier !== VERIFIER_TEXT) {
        throw new Error('密码错误或数据已损坏。');
    }

    return {
        ...envelope,
        ciphertext: await encryptString(JSON.stringify(normalizePayload(payload)), key),
        updatedAt: Date.now(),
    };
};
