import {idbGetBlob, idbSetBlob} from '../../core/storage/photoIdb';
import {
    extractSiteDomain,
    getEffectiveMinEdgePx,
    getFastIconCandidatesWithProviders,
    ICON_MIN_EDGE_PX,
    isExtensionContext,
    probeFastIconCandidate,
    probeBestIconCandidate,
    type IconProvider
} from './icon';
import {fetchWithRetry} from './network';
import type {RuntimeConfig, SiteIconCacheMode, SiteIconCacheRecord, SiteIconProvider} from '../../core/config/types';

export const SITE_ICON_CACHE_VERSION = 16;
export const SITE_ICON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SITE_ICON_RETRY_MS = 30 * 60 * 1000;
export const SITE_ICON_IMG_ERROR_RETRY_MS = 2 * 60 * 1000;
export const SITE_ICON_PROVIDER_BACKOFF_MS = 10 * 60 * 1000;
export const SITE_ICON_EXTERNAL_PROVIDER_BACKOFF_MS = 30 * 60 * 1000;
const SITE_ICON_MIGRATION_MAX_RETRY_LOCK_MS = 2 * 60 * 60 * 1000;

export type SiteIconResult = {
    url: string;
    domain: string;
    fromCache: boolean;
    objectUrl: boolean;
    lowQuality: boolean;
    stale: boolean;
    provider: IconProvider;
    qualityScore: number;
};

export type SiteIconResolveOptions = {
    forceRefresh?: boolean;
    ttlMs?: number;
    retryMs?: number;
    timeoutMs?: number;
    resolveTimeoutMs?: number;
    minEdgePx?: number;
    fastFirst?: boolean;
    fastTimeoutMs?: number;
    backgroundUpgrade?: boolean;
};

type SiteIconCacheAsset = {
    cacheMode: SiteIconCacheMode;
    domain: string;
    updatedAt: number;
    source: string;
    provider: IconProvider;
    qualityScore: number;
    width: number;
    height: number;
    retryAfter?: number;
    lastError?: string;
    url?: string;
    blob?: Blob;
};

const SITE_ICON_MEMORY_MAX_ENTRIES = 512;
const SITE_ICON_RESOLVE_SOFT_TIMEOUT_MS = 1800;
const siteIconMemoryCache = new Map<string, SiteIconCacheAsset>();
const siteIconResolveInflight = new Map<string, Promise<SiteIconCacheAsset | null>>();
const siteIconBlobFetchInflight = new Map<string, Promise<Blob | null>>();
const siteIconBackgroundRefreshQueued = new Set<string>();
const SITE_ICON_RESOLVE_TIMED_OUT = Symbol('SITE_ICON_RESOLVE_TIMED_OUT');

function toRuntimeProvider(provider: IconProvider): SiteIconProvider {
    return provider;
}

function isExternalProvider(provider: SiteIconProvider | IconProvider | undefined): boolean {
    return provider === 'first_party_proxy'
        || provider === 'google_s2'
        || provider === 'duckduckgo'
        || provider === 'yandex'
        || provider === 'cn_favicon'
        || provider === 'icon_horse'
        || provider === 'favicon_im'
        || provider === 'unavatar';
}

function isKnownProvider(provider: any): provider is SiteIconProvider {
    return provider === 'browser_favicon'
        || provider === 'first_party_proxy'
        || provider === 'cn_favicon'
        || provider === 'google_s2'
        || provider === 'yandex'
        || provider === 'duckduckgo'
        || provider === 'icon_horse'
        || provider === 'favicon_im'
        || provider === 'unavatar'
        || provider === 'site_manifest'
        || provider === 'site_favicon'
        || provider === 'preset'
        || provider === 'unknown';
}

function isThirdPartyFaviconSource(source: string): boolean {
    return source.includes('/api/favicon')
        || source.includes('api.iowen.cn/favicon/')
        || source.includes('google.com/s2/favicons')
        || source.includes('t2.gstatic.com/faviconv2')
        || source.includes('duckduckgo.com/ip3/')
        || source.includes('favicon.yandex.net/favicon/')
        || source.includes('favicon.im/')
        || source.includes('icon.horse/icon/')
        || source.includes('unavatar.io/');
}

function sanitizeProviderBackoffUntil(
    value: any
): Partial<Record<SiteIconProvider, number>> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const out: Partial<Record<SiteIconProvider, number>> = {};
    for (const [provider, rawUntil] of Object.entries(value)) {
        const until = Number(rawUntil);
        if (!Number.isFinite(until) || until <= 0) continue;
        if (!isKnownProvider(provider)) continue;
        out[provider as SiteIconProvider] = until;
    }
    return Object.keys(out).length ? out : undefined;
}

function getRecordProviderBackoffUntil(
    record: SiteIconCacheRecord | undefined
): Partial<Record<SiteIconProvider, number>> | undefined {
    return sanitizeProviderBackoffUntil(record?.providerBackoffUntil);
}

function withoutProviderBackoff(
    record: SiteIconCacheRecord | undefined,
    provider: IconProvider
): Partial<Record<SiteIconProvider, number>> | undefined {
    const map = getRecordProviderBackoffUntil(record);
    if (!map) return undefined;
    const next = {...map};
    delete next[provider];
    return Object.keys(next).length ? next : undefined;
}

function withProviderBackoff(
    record: SiteIconCacheRecord | undefined,
    provider: IconProvider | undefined,
    retryAfter: number
): Partial<Record<SiteIconProvider, number>> | undefined {
    const map = getRecordProviderBackoffUntil(record);
    if (!provider) return map;
    return {
        ...(map || {}),
        [provider]: retryAfter,
    };
}

function getSkippedProviders(record: SiteIconCacheRecord | undefined, now = Date.now()): Set<IconProvider> {
    const skipped = new Set<IconProvider>();
    const map = getRecordProviderBackoffUntil(record);
    if (!map) return skipped;

    for (const [provider, until] of Object.entries(map)) {
        if (Number(until) > now) skipped.add(provider as IconProvider);
    }
    return skipped;
}

function getProviderBackoffMs(provider: IconProvider | undefined, error: string, retryMs: number): number {
    if (error !== 'img_error') return retryMs;
    if (provider === 'browser_favicon' || isExternalProvider(provider)) {
        return Math.max(SITE_ICON_EXTERNAL_PROVIDER_BACKOFF_MS, retryMs);
    }
    return Math.max(SITE_ICON_PROVIDER_BACKOFF_MS, retryMs);
}

function trimSiteIconMemoryCache(): void {
    if (siteIconMemoryCache.size <= SITE_ICON_MEMORY_MAX_ENTRIES) return;

    const keep = Array.from(siteIconMemoryCache.entries())
        .sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0))
        .slice(0, SITE_ICON_MEMORY_MAX_ENTRIES);

    siteIconMemoryCache.clear();
    for (const [domain, asset] of keep) {
        siteIconMemoryCache.set(domain, asset);
    }
}

function isUsableMemoryAsset(asset: SiteIconCacheAsset | undefined): asset is SiteIconCacheAsset {
    if (!asset) return false;
    if (asset.cacheMode === 'blob') return !!asset.blob;
    if (asset.cacheMode === 'url') return !!asset.url;
    return asset.cacheMode === 'miss';
}

function getSiteIconMemoryAsset(domain: string): SiteIconCacheAsset | null {
    const asset = siteIconMemoryCache.get(domain);
    if (!asset) return null;
    if (isUsableMemoryAsset(asset)) return asset;
    siteIconMemoryCache.delete(domain);
    return null;
}

function rememberSiteIconMemoryAsset(asset: SiteIconCacheAsset): void {
    if (!asset.domain) return;
    siteIconMemoryCache.set(asset.domain, asset);
    trimSiteIconMemoryCache();
}

function forgetSiteIconMemoryAsset(domain: string): void {
    siteIconMemoryCache.delete(domain);
}

function touchSiteIconMemoryRetryLock(
    domain: string,
    retryAfter: number,
    error: string,
    provider?: IconProvider
): void {
    const asset = getSiteIconMemoryAsset(domain);
    if (!asset) return;
    rememberSiteIconMemoryAsset({
        ...asset,
        retryAfter,
        lastError: error,
        provider: provider || asset.provider,
        updatedAt: Date.now(),
    });
}

function createResultFromAsset(
    asset: SiteIconCacheAsset,
    ttlMs: number,
    fromCache: boolean
): SiteIconResult | null {
    if (asset.cacheMode === 'miss') return null;

    const edge = Number(asset.qualityScore || Math.min(asset.width || 0, asset.height || 0) || 0);
    const minEdge = getEffectiveMinEdgePx(ICON_MIN_EDGE_PX);
    const lowQuality = edge > 0 ? edge < minEdge : false;
    const stale = !asset.updatedAt || (Date.now() - Number(asset.updatedAt || 0) > ttlMs);

    if (asset.cacheMode === 'url') {
        if (!asset.url) return null;
        return {
            url: asset.url,
            domain: asset.domain,
            fromCache,
            objectUrl: false,
            lowQuality,
            stale,
            provider: asset.provider,
            qualityScore: edge,
        };
    }

    if (asset.cacheMode === 'blob') {
        if (!asset.blob) return null;
        return {
            url: URL.createObjectURL(asset.blob),
            domain: asset.domain,
            fromCache,
            objectUrl: true,
            lowQuality,
            stale,
            provider: asset.provider,
            qualityScore: edge,
        };
    }

    return null;
}

function memoryAssetFromRecord(
    domain: string,
    record: SiteIconCacheRecord | undefined,
    blob?: Blob
): SiteIconCacheAsset | null {
    if (!record) return null;
    const mode = getRecordCacheMode(record);
    const provider = (record.provider || 'unknown') as IconProvider;
    const qualityScore = getRecordEdge(record);
    const width = Number(record.width || qualityScore || 0);
    const height = Number(record.height || qualityScore || 0);
    const base = {
        domain,
        updatedAt: getRecordUpdatedAt(record),
        source: String(record.source || ''),
        provider,
        qualityScore,
        width,
        height,
        retryAfter: Number.isFinite(Number(record.retryAfter)) ? Number(record.retryAfter) : undefined,
        lastError: record.lastError,
    };

    if (mode === 'url') {
        if (!record.fallbackUrl) return null;
        return {
            ...base,
            cacheMode: 'url',
            url: record.fallbackUrl,
        };
    }

    if (mode === 'blob') {
        if (!blob) return null;
        return {
            ...base,
            cacheMode: 'blob',
            blob,
        };
    }

    return {
        ...base,
        cacheMode: 'miss',
    };
}

function releaseSiteIconResultObjectUrl(result: SiteIconResult | null | undefined): void {
    if (result?.objectUrl && result.url.startsWith('blob:')) {
        URL.revokeObjectURL(result.url);
    }
}

async function waitForSiteIconAsset(
    promise: Promise<SiteIconCacheAsset | null>,
    timeoutMs: number
): Promise<SiteIconCacheAsset | null | typeof SITE_ICON_RESOLVE_TIMED_OUT> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return await promise;

    return await new Promise((resolve, reject) => {
        let settled = false;
        const timer = globalThis.setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(SITE_ICON_RESOLVE_TIMED_OUT);
        }, Math.max(300, Math.round(timeoutMs)));

        promise.then((value) => {
            if (settled) return;
            settled = true;
            globalThis.clearTimeout(timer);
            resolve(value);
        }).catch((error) => {
            if (settled) return;
            settled = true;
            globalThis.clearTimeout(timer);
            reject(error);
        });
    });
}

export function ensureSiteIconRuntime(runtime: RuntimeConfig): void {
    if (!runtime.siteIcons) {
        runtime.siteIcons = {
            version: SITE_ICON_CACHE_VERSION,
            records: {},
            lastBatchRefreshAt: 0,
        };
        return;
    }

    if (!runtime.siteIcons.records || typeof runtime.siteIcons.records !== 'object') {
        runtime.siteIcons.records = {};
    }

    if (!Number.isFinite(Number(runtime.siteIcons.version))) {
        runtime.siteIcons.version = 0;
    }

    if (!Number.isFinite(Number(runtime.siteIcons.lastBatchRefreshAt))) {
        runtime.siteIcons.lastBatchRefreshAt = 0;
    }

    const currentVersion = Number(runtime.siteIcons.version || 0);
    if (currentVersion < SITE_ICON_CACHE_VERSION) {
        // Self-heal: clean poisoned records and normalize new runtime fields.
        const now = Date.now();
        for (const [domain, value] of Object.entries(runtime.siteIcons.records)) {
            const rec = value as SiteIconCacheRecord | undefined;
            if (!rec || typeof rec !== 'object') {
                delete runtime.siteIcons.records[domain];
                forgetSiteIconMemoryAsset(domain);
                continue;
            }

            const mode = getRecordCacheMode(rec);
            const source = String(rec.source || '').toLowerCase();
            let provider = (rec.provider || 'unknown') as SiteIconProvider;
            if (provider === 'unknown' && source.includes('/api/favicon')) {
                provider = 'first_party_proxy';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('api.iowen.cn/favicon/')) {
                provider = 'cn_favicon';
                rec.provider = provider;
            }
            if (provider === 'unknown' && (source.includes('t2.gstatic.com/faviconv2') || source.includes('google.com/s2/favicons'))) {
                provider = 'google_s2';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('duckduckgo.com/ip3/')) {
                provider = 'duckduckgo';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('favicon.yandex.net/favicon/')) {
                provider = 'yandex';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('icon.horse/icon/')) {
                provider = 'icon_horse';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('favicon.im/')) {
                provider = 'favicon_im';
                rec.provider = provider;
            }
            if (provider === 'unknown' && source.includes('unavatar.io/')) {
                provider = 'unavatar';
                rec.provider = provider;
            }
            const poisonedBrowserScheme = source.startsWith('chrome://') || source.startsWith('edge://');
            const poisonedBrowserUrl = mode === 'url' && provider === 'browser_favicon';
            const poisonedFailedExternal = mode === 'url'
                && isExternalProvider(provider)
                && (rec.lastError === 'img_error' || rec.lastError === 'probe_failed');
            const staleDisplayOnlyRemote = mode === 'url'
                && rec.lastError === 'display_only'
                && (isExternalProvider(provider) || provider === 'unknown');
            const staleExternalUrlRecord = mode === 'url'
                && isExternalProvider(provider)
                && provider !== 'first_party_proxy'
                && provider !== 'preset';
            const staleDisplayOnlyDirectSite = mode === 'url'
                && rec.lastError === 'display_only'
                && provider !== 'preset'
                && !isThirdPartyFaviconSource(source);
            const retryAfter = Number(rec.retryAfter || 0);
            const longRetryLock = Number.isFinite(retryAfter) && retryAfter > now + SITE_ICON_MIGRATION_MAX_RETRY_LOCK_MS;
            const poisonedMiss = mode === 'miss'
                && ((rec.lastError === 'img_error' || rec.lastError === 'probe_failed') || longRetryLock);
            const poisonedUnknownThirdParty = mode === 'url'
                && provider === 'unknown'
                && isThirdPartyFaviconSource(source);

            if (
                poisonedBrowserScheme
                || poisonedBrowserUrl
                || poisonedFailedExternal
                || staleDisplayOnlyRemote
                || staleExternalUrlRecord
                || staleDisplayOnlyDirectSite
                || poisonedMiss
                || poisonedUnknownThirdParty
            ) {
                delete runtime.siteIcons.records[domain];
                forgetSiteIconMemoryAsset(domain);
                continue;
            }

            rec.providerBackoffUntil = sanitizeProviderBackoffUntil(rec.providerBackoffUntil);
            if (rec.lastTriedProvider && !isKnownProvider(rec.lastTriedProvider)) {
                rec.lastTriedProvider = undefined;
            }
            if (rec.lastSuccessProvider && !isKnownProvider(rec.lastSuccessProvider)) {
                rec.lastSuccessProvider = undefined;
            }
        }
        runtime.siteIcons.version = SITE_ICON_CACHE_VERSION;
        runtime.siteIcons.lastBatchRefreshAt = 0;
    }
}

function getRecordEdge(record: SiteIconCacheRecord | undefined): number {
    if (!record) return 0;
    if (Number.isFinite(Number(record.qualityScore))) return Number(record.qualityScore);
    const w = Number(record.width || 0);
    const h = Number(record.height || 0);
    return Math.min(w || 0, h || 0);
}

function getRecordCacheMode(record: SiteIconCacheRecord | undefined): SiteIconCacheMode {
    if (!record) return 'miss';
    if (record.cacheMode === 'blob' || record.cacheMode === 'url' || record.cacheMode === 'miss') {
        return record.cacheMode;
    }
    return record.blobKey ? 'blob' : 'miss';
}

function getRecordUpdatedAt(record: SiteIconCacheRecord | undefined): number {
    if (!record) return 0;
    const updatedAt = Number(record.updatedAt || 0);
    return Number.isFinite(updatedAt) ? updatedAt : 0;
}

function isRetryLocked(record: SiteIconCacheRecord | undefined, now = Date.now()): boolean {
    const retryAfter = Number(record?.retryAfter || 0);
    return Number.isFinite(retryAfter) && retryAfter > now;
}

function hasProviderSpecificBackoff(record: SiteIconCacheRecord | undefined, now = Date.now()): boolean {
    const map = getRecordProviderBackoffUntil(record);
    if (!map) return false;
    return Object.values(map).some((until) => Number(until) > now);
}

export function isRecordStale(record: SiteIconCacheRecord | undefined, ttlMs = SITE_ICON_TTL_MS): boolean {
    if (!record) return true;
    const updated = getRecordUpdatedAt(record);
    if (!updated || (Date.now() - updated > ttlMs)) return true;
    return false;
}

export function getSiteIconBlobKey(domain: string): string {
    return `site_icon:${domain}`;
}

export async function readCachedSiteIcon(
    rawUrl: string,
    runtime: RuntimeConfig,
    ttlMs = SITE_ICON_TTL_MS
): Promise<SiteIconResult | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const memoryAsset = getSiteIconMemoryAsset(domain);
    if (memoryAsset) {
        const result = createResultFromAsset(memoryAsset, ttlMs, true);
        if (result || memoryAsset.cacheMode === 'miss') return result;
    }

    const record = runtime.siteIcons.records[domain];
    if (!record) return null;

    const mode = getRecordCacheMode(record);

    if (mode === 'url') {
        if (!record.fallbackUrl) return null;
        const asset = memoryAssetFromRecord(domain, record);
        if (!asset) return null;
        rememberSiteIconMemoryAsset(asset);
        return createResultFromAsset(asset, ttlMs, true);
    }

    if (mode === 'miss') {
        const asset = memoryAssetFromRecord(domain, record);
        if (asset) rememberSiteIconMemoryAsset(asset);
        return null;
    }

    if (!record.blobKey) return null;

    const blob = await idbGetBlob(record.blobKey);
    if (!blob) return null;
    const asset = memoryAssetFromRecord(domain, record, blob);
    if (!asset) return null;
    rememberSiteIconMemoryAsset(asset);

    return createResultFromAsset(asset, ttlMs, true);
}

function isSameOriginHttpUrl(rawUrl: string): boolean {
    if (typeof window === 'undefined' || !window.location?.origin) return false;
    try {
        const parsed = new URL(rawUrl, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        return parsed.origin === window.location.origin;
    } catch {
        return false;
    }
}

function canFetchToBlob(url: string, provider: IconProvider): boolean {
    if (provider === 'browser_favicon') return false;
    if (url.startsWith('chrome://')) return false;

    if (isExtensionContext()) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'api.iowen.cn'
                || host === 'www.google.com'
                || host === 't2.gstatic.com'
                || host === 'icons.duckduckgo.com'
                || host === 'favicon.yandex.net'
                || host === 'favicon.im'
                || host === 'icon.horse'
                || host === 'unavatar.io';
        } catch {
            return false;
        }
    }

    // In web/dev context, avoid cross-origin fetch to prevent CORS errors.
    return isSameOriginHttpUrl(url);
}

function writeBlobRecord(
    runtime: RuntimeConfig,
    domain: string,
    payload: {
        blobKey: string;
        source: string;
        provider: IconProvider;
        qualityScore: number;
        width: number;
        height: number;
        providerBackoffUntil?: Partial<Record<SiteIconProvider, number>>;
    }
) {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    runtime.siteIcons.records[domain] = {
        cacheMode: 'blob',
        blobKey: payload.blobKey,
        updatedAt: Date.now(),
        source: payload.source,
        provider: toRuntimeProvider(payload.provider),
        dprAtFetch: dpr,
        qualityScore: payload.qualityScore,
        width: payload.width,
        height: payload.height,
        providerBackoffUntil: payload.providerBackoffUntil,
        lastTriedProvider: toRuntimeProvider(payload.provider),
        lastSuccessProvider: toRuntimeProvider(payload.provider),
        retryAfter: undefined,
        fallbackUrl: undefined,
        lastError: undefined,
    };
}

function writeUrlRecord(
    runtime: RuntimeConfig,
    domain: string,
    payload: {
        url: string;
        source: string;
        provider: IconProvider;
        qualityScore: number;
        width: number;
        height: number;
        retryAfter: number;
        error?: string;
        providerBackoffUntil?: Partial<Record<SiteIconProvider, number>>;
    }
) {
    runtime.siteIcons.records[domain] = {
        cacheMode: 'url',
        updatedAt: Date.now(),
        source: payload.source,
        provider: toRuntimeProvider(payload.provider),
        qualityScore: payload.qualityScore,
        width: payload.width,
        height: payload.height,
        fallbackUrl: payload.url,
        retryAfter: payload.retryAfter,
        blobKey: undefined,
        lastError: payload.error,
        providerBackoffUntil: payload.providerBackoffUntil,
        lastTriedProvider: toRuntimeProvider(payload.provider),
        lastSuccessProvider: toRuntimeProvider(payload.provider),
    };

    rememberSiteIconMemoryAsset({
        cacheMode: 'url',
        domain,
        updatedAt: Date.now(),
        source: payload.source,
        provider: payload.provider,
        qualityScore: payload.qualityScore,
        width: payload.width,
        height: payload.height,
        retryAfter: payload.retryAfter,
        lastError: payload.error,
        url: payload.url,
    });
}

function writeMissRecord(
    runtime: RuntimeConfig,
    domain: string,
    retryAfter: number,
    error = 'probe_failed',
    provider?: IconProvider
) {
    runtime.siteIcons.records[domain] = {
        cacheMode: 'miss',
        updatedAt: Date.now(),
        source: 'miss',
        provider: provider ? toRuntimeProvider(provider) : 'unknown',
        retryAfter,
        blobKey: undefined,
        fallbackUrl: undefined,
        qualityScore: 0,
        width: 0,
        height: 0,
        lastError: error,
        providerBackoffUntil: withProviderBackoff(runtime.siteIcons.records[domain], provider, retryAfter),
        lastTriedProvider: provider ? toRuntimeProvider(provider) : undefined,
    };

    rememberSiteIconMemoryAsset({
        cacheMode: 'miss',
        domain,
        updatedAt: Date.now(),
        source: 'miss',
        provider: provider || 'unknown',
        retryAfter,
        lastError: error,
        qualityScore: 0,
        width: 0,
        height: 0,
    });
}

function touchRecordRetryLock(
    record: SiteIconCacheRecord,
    retryAfter: number,
    error: string,
    provider?: IconProvider
) {
    record.retryAfter = retryAfter;
    record.lastError = error;
    record.providerBackoffUntil = withProviderBackoff(record, provider, retryAfter);
    record.lastTriedProvider = provider ? toRuntimeProvider(provider) : record.lastTriedProvider;
}

export function markSiteIconMiss(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: { retryMs?: number; error?: string; preserveExisting?: boolean }
): boolean {
    ensureSiteIconRuntime(runtime);
    const domain = extractSiteDomain(rawUrl);
    if (!domain) return false;
    const error = options?.error || 'img_error';
    const existing = runtime.siteIcons.records[domain];
    const existingProvider = existing?.provider as IconProvider | undefined;
    const baseRetryMs = options?.retryMs ?? (error === 'img_error' ? SITE_ICON_IMG_ERROR_RETRY_MS : SITE_ICON_RETRY_MS);
    const retryMs = getProviderBackoffMs(existingProvider, error, baseRetryMs);
    const retryAfter = Date.now() + retryMs;
    const preserveExisting = options?.preserveExisting ?? error === 'img_error';
    const existingMode = getRecordCacheMode(existing);
    if (preserveExisting && existing && existingMode === 'blob') {
        touchRecordRetryLock(existing, retryAfter, error, existingProvider);
        touchSiteIconMemoryRetryLock(domain, retryAfter, error, existingProvider);
        return true;
    }

    // URL fallback failed to render: downgrade to miss to avoid reusing poisoned URL.
    writeMissRecord(runtime, domain, retryAfter, error, existingProvider);
    return true;
}

async function fetchIconBlob(iconUrl: string): Promise<Blob | null> {
    const inflight = siteIconBlobFetchInflight.get(iconUrl);
    if (inflight) return inflight;

    const promise = (async () => {
        try {
            const resp = await fetchWithRetry(iconUrl, {cache: 'force-cache', credentials: 'omit'}, {
                timeoutMs: 4000,
                retries: 1,
                retryDelayMs: 300,
                maxRetryDelayMs: 900,
                metricName: 'icon.blob.cache',
            });
            if (!resp.ok) return null;
            const blob = await resp.blob();
            if (!blob || blob.size <= 0) return null;
            return blob;
        } catch {
            return null;
        }
    })();

    siteIconBlobFetchInflight.set(iconUrl, promise);
    try {
        return await promise;
    } finally {
        if (siteIconBlobFetchInflight.get(iconUrl) === promise) {
            siteIconBlobFetchInflight.delete(iconUrl);
        }
    }
}

export async function resolveAndCacheSiteIcon(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: SiteIconResolveOptions
): Promise<SiteIconResult | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const ttlMs = options?.ttlMs ?? SITE_ICON_TTL_MS;
    const backgroundUpgrade = options?.backgroundUpgrade ?? true;
    const now = Date.now();
    const record = runtime.siteIcons.records[domain];
    const recordMode = getRecordCacheMode(record);
    const cached = await readCachedSiteIcon(rawUrl, runtime, ttlMs);
    const forceRefresh = !!options?.forceRefresh;

    if (!forceRefresh) {
        if (recordMode === 'miss' && isRetryLocked(record, now) && !hasProviderSpecificBackoff(record, now)) {
            releaseSiteIconResultObjectUrl(cached);
            return null;
        }
        if (recordMode === 'url' && isRetryLocked(record, now) && record?.lastError === 'img_error' && !hasProviderSpecificBackoff(record, now)) {
            releaseSiteIconResultObjectUrl(cached);
            return null;
        }
        if (cached) {
            if (backgroundUpgrade && (cached.stale || cached.lowQuality)) {
                scheduleBackgroundSiteIconRefresh(rawUrl, runtime, options);
            }
            return cached;
        }
    }

    const inflightKey = domain;
    let inflight = siteIconResolveInflight.get(inflightKey);
    if (!inflight) {
        inflight = resolveAndCacheSiteIconAsset(rawUrl, runtime, options, !!cached);
        siteIconResolveInflight.set(inflightKey, inflight);
        void inflight.finally(() => {
            if (siteIconResolveInflight.get(inflightKey) === inflight) {
                siteIconResolveInflight.delete(inflightKey);
            }
        }).catch(() => null);
    }

    const resolveTimeoutRaw = Number(options?.resolveTimeoutMs ?? SITE_ICON_RESOLVE_SOFT_TIMEOUT_MS);
    let asset: SiteIconCacheAsset | null | typeof SITE_ICON_RESOLVE_TIMED_OUT;
    try {
        asset = await waitForSiteIconAsset(inflight, resolveTimeoutRaw);
    } catch {
        return cached;
    }

    if (asset === SITE_ICON_RESOLVE_TIMED_OUT) {
        return cached;
    }

    if (!asset) {
        return cached;
    }

    releaseSiteIconResultObjectUrl(cached);
    const fromCache = asset.cacheMode === 'blob';
    const result = createResultFromAsset(asset, ttlMs, fromCache);
    if (!forceRefresh && backgroundUpgrade && result && (result.stale || result.lowQuality)) {
        scheduleBackgroundSiteIconRefresh(rawUrl, runtime, options);
    }
    return result;
}

async function resolveAndCacheSiteIconAsset(
    rawUrl: string,
    runtime: RuntimeConfig,
    options: SiteIconResolveOptions | undefined,
    hasCachedFallback: boolean
): Promise<SiteIconCacheAsset | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const retryMs = options?.retryMs ?? SITE_ICON_RETRY_MS;
    const slowTimeoutMs = Number.isFinite(Number(options?.timeoutMs))
        ? Math.max(400, Number(options?.timeoutMs))
        : 1200;
    const fastFirst = options?.fastFirst ?? true;
    const fastTimeoutMsRaw = Number(options?.fastTimeoutMs ?? 900);
    const fastTimeoutMs = Number.isFinite(fastTimeoutMsRaw) ? Math.max(300, fastTimeoutMsRaw) : 900;
    const minEdgePx = options?.minEdgePx ?? getEffectiveMinEdgePx(ICON_MIN_EDGE_PX);
    const now = Date.now();
    const record = runtime.siteIcons.records[domain];
    const skipProviders = getSkippedProviders(record, now);

    const materializeProbeAsset = async (probe: {
        url: string;
        source: string;
        provider: IconProvider;
        qualityScore: number;
        width: number;
        height: number;
        lowQuality: boolean;
    }): Promise<SiteIconCacheAsset> => {
        const canPersist = !probe.lowQuality && canFetchToBlob(probe.url, probe.provider);
        const updatedAt = Date.now();

        if (canPersist) {
            const blob = await fetchIconBlob(probe.url);
            if (blob) {
                const blobKey = getSiteIconBlobKey(domain);
                await idbSetBlob(blobKey, blob);
                writeBlobRecord(runtime, domain, {
                    blobKey,
                    source: probe.source,
                    provider: probe.provider,
                    qualityScore: probe.qualityScore,
                    width: probe.width,
                    height: probe.height,
                    providerBackoffUntil: withoutProviderBackoff(runtime.siteIcons.records[domain], probe.provider),
                });

                const asset: SiteIconCacheAsset = {
                    cacheMode: 'blob',
                    domain,
                    updatedAt,
                    source: probe.source,
                    provider: probe.provider,
                    qualityScore: probe.qualityScore,
                    width: probe.width,
                    height: probe.height,
                    blob,
                };
                rememberSiteIconMemoryAsset(asset);
                return asset;
            }
        }

        const urlRetryAfter = now + Math.min(retryMs, 6 * 60 * 60 * 1000);
        writeUrlRecord(runtime, domain, {
            url: probe.url,
            source: probe.source,
            provider: probe.provider,
            qualityScore: probe.qualityScore,
            width: probe.width,
            height: probe.height,
            retryAfter: urlRetryAfter,
            error: canPersist ? 'persist_blob_failed' : 'display_only',
            providerBackoffUntil: withoutProviderBackoff(runtime.siteIcons.records[domain], probe.provider),
        });

        return getSiteIconMemoryAsset(domain) || {
            cacheMode: 'url',
            domain,
            updatedAt,
            source: probe.source,
            provider: probe.provider,
            qualityScore: probe.qualityScore,
            width: probe.width,
            height: probe.height,
            retryAfter: urlRetryAfter,
            lastError: canPersist ? 'persist_blob_failed' : 'display_only',
            url: probe.url,
        };
    };

    // Web/dev: the first-party /api/favicon proxy is a same-origin, server-side resolver
    // that can take a moment (it fetches declared + provider candidates). Probing it with
    // tight client timeouts under a page-load storm spuriously fails and poisons the cache,
    // making every icon disappear. Trust it instead: fetch it once to populate the blob
    // cache, or fall back to a URL record that the <img> renders directly (SiteIcon already
    // gives /api/favicon URLs a generous load window).
    if (!isExtensionContext()) {
        const proxyCandidate = getFastIconCandidatesWithProviders(rawUrl)
            .find((candidate) => candidate.provider === 'first_party_proxy');
        if (proxyCandidate && !skipProviders.has('first_party_proxy')) {
            return await materializeProbeAsset({
                url: proxyCandidate.url,
                source: proxyCandidate.url,
                provider: 'first_party_proxy',
                qualityScore: 256,
                width: 256,
                height: 256,
                lowQuality: false,
            });
        }
    }

    if (fastFirst) {
        const fastProbe = await probeFastIconCandidate(rawUrl, {
            timeoutMs: fastTimeoutMs,
            totalTimeoutMs: Math.max(900, fastTimeoutMs * 3),
            maxCandidates: 8,
            minEdgePx,
            skipProviders,
            parallelism: isExtensionContext() ? 2 : 1,
        });

        if (fastProbe) {
            return await materializeProbeAsset(fastProbe);
        }
    }

    const probe = await probeBestIconCandidate(rawUrl, {
        timeoutMs: slowTimeoutMs,
        totalTimeoutMs: Math.max(1800, slowTimeoutMs * 4),
        maxCandidates: 18,
        minEdgePx,
        skipProviders,
        parallelism: isExtensionContext() ? 2 : 1,
    });

    if (!probe) {
        if (!hasCachedFallback) {
            writeMissRecord(runtime, domain, now + retryMs, 'probe_failed', record?.provider as IconProvider | undefined);
        }
        return null;
    }

    return await materializeProbeAsset(probe);
}

function scheduleBackgroundSiteIconRefresh(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: SiteIconResolveOptions
): void {
    if (typeof window === 'undefined') return;
    const domain = extractSiteDomain(rawUrl);
    if (!domain || siteIconBackgroundRefreshQueued.has(domain)) return;

    siteIconBackgroundRefreshQueued.add(domain);
    window.setTimeout(() => {
        void resolveAndCacheSiteIcon(rawUrl, runtime, {
            ...options,
            forceRefresh: true,
            fastFirst: false,
            backgroundUpgrade: false,
            resolveTimeoutMs: 0,
        })
            .then((result) => releaseSiteIconResultObjectUrl(result))
            .catch(() => null)
            .finally(() => siteIconBackgroundRefreshQueued.delete(domain));
    }, 0);
}
