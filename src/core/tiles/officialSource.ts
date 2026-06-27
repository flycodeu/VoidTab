import type {PackageTrustIndex} from './contracts.ts';
import {fetchPackageTrustIndex, normalizePackageTrustIndex} from './packageStore.ts';

declare global {
    interface Window {
        __VOIDTAB_OFFICIAL_TILE_INDEX_URL__?: string;
    }
}

const OFFICIAL_TILE_INDEX_ENV_KEYS = [
    'VITE_VOIDTAB_OFFICIAL_TILE_INDEX_URL',
    'VITE_VOIDTAB_TILE_TRUST_INDEX_URL',
];

function normalizeOfficialUrl(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try {
        const url = new URL(raw.trim());
        if (url.protocol !== 'https:') return '';
        url.username = '';
        url.password = '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

export function getOfficialTileTrustIndexUrl(explicitUrl?: string): string {
    const explicit = normalizeOfficialUrl(explicitUrl);
    if (explicit) return explicit;

    const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
    for (const key of OFFICIAL_TILE_INDEX_ENV_KEYS) {
        const value = normalizeOfficialUrl((env as Record<string, unknown>)[key]);
        if (value) return value;
    }

    if (typeof window !== 'undefined') {
        const globalUrl = normalizeOfficialUrl(window.__VOIDTAB_OFFICIAL_TILE_INDEX_URL__);
        if (globalUrl) return globalUrl;
    }
    return '';
}

export async function fetchOfficialTileTrustIndex(options: {
    url?: string;
    signal?: AbortSignal;
    fallbackIndex?: PackageTrustIndex;
} = {}): Promise<PackageTrustIndex> {
    const url = getOfficialTileTrustIndexUrl(options.url);
    if (!url) {
        if (options.fallbackIndex) return normalizePackageTrustIndex(options.fallbackIndex);
        throw new TypeError('官方组件审核源 URL 未配置');
    }
    return fetchPackageTrustIndex(url, {signal: options.signal});
}
