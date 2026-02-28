import {idbGetBlob, idbSetBlob} from '../../core/storage/photoIdb';
import {
    extractSiteDomain,
    getEffectiveMinEdgePx,
    ICON_MIN_EDGE_PX,
    isExtensionContext,
    probeBestIconCandidate,
    type IconProvider
} from './icon';
import type {RuntimeConfig, SiteIconCacheMode, SiteIconCacheRecord, SiteIconProvider} from '../../core/config/types';

export const SITE_ICON_CACHE_VERSION = 3;
export const SITE_ICON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SITE_ICON_RETRY_MS = 24 * 60 * 60 * 1000;
export const SITE_ICON_IMG_ERROR_RETRY_MS = 15 * 60 * 1000;

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

function toRuntimeProvider(provider: IconProvider): SiteIconProvider {
    return provider;
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
        // Self-heal: older builds may have poisoned many domains with stale miss records.
        for (const [domain, value] of Object.entries(runtime.siteIcons.records)) {
            const rec = value as SiteIconCacheRecord | undefined;
            if (!rec || typeof rec !== 'object') continue;
            if (rec.cacheMode === 'miss' && (rec.lastError === 'img_error' || rec.lastError === 'probe_failed')) {
                delete runtime.siteIcons.records[domain];
            }
        }
        runtime.siteIcons.version = SITE_ICON_CACHE_VERSION;
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

    const record = runtime.siteIcons.records[domain];
    if (!record) return null;
    const mode = getRecordCacheMode(record);
    const edge = getRecordEdge(record);
    const minEdge = getEffectiveMinEdgePx(ICON_MIN_EDGE_PX);
    const lowQuality = edge > 0 ? edge < minEdge : false;
    const stale = isRecordStale(record, ttlMs);
    const provider = (record.provider || 'unknown') as IconProvider;

    if (mode === 'url') {
        if (!record.fallbackUrl) return null;
        return {
            url: record.fallbackUrl,
            domain,
            fromCache: true,
            objectUrl: false,
            lowQuality,
            stale,
            provider,
            qualityScore: edge,
        };
    }

    if (mode !== 'blob' || !record.blobKey) return null;

    const blob = await idbGetBlob(record.blobKey);
    if (!blob) return null;

    return {
        url: URL.createObjectURL(blob),
        domain,
        fromCache: true,
        objectUrl: true,
        lowQuality,
        stale,
        provider,
        qualityScore: edge,
    };
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

    // In extension context, cross-origin fetch may be allowed by host permissions.
    if (isExtensionContext()) return true;

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
    };
}

function writeMissRecord(runtime: RuntimeConfig, domain: string, retryAfter: number, error = 'probe_failed') {
    runtime.siteIcons.records[domain] = {
        cacheMode: 'miss',
        updatedAt: Date.now(),
        source: 'miss',
        provider: 'unknown',
        retryAfter,
        blobKey: undefined,
        fallbackUrl: undefined,
        qualityScore: 0,
        width: 0,
        height: 0,
        lastError: error,
    };
}

export function markSiteIconMiss(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: { retryMs?: number; error?: string }
): boolean {
    ensureSiteIconRuntime(runtime);
    const domain = extractSiteDomain(rawUrl);
    if (!domain) return false;
    const error = options?.error || 'img_error';
    const retryMs = options?.retryMs ?? (error === 'img_error' ? SITE_ICON_IMG_ERROR_RETRY_MS : SITE_ICON_RETRY_MS);
    writeMissRecord(runtime, domain, Date.now() + retryMs, error);
    return true;
}

async function fetchIconBlob(iconUrl: string): Promise<Blob | null> {
    try {
        const resp = await fetch(iconUrl, {cache: 'force-cache', credentials: 'omit'});
        if (!resp.ok) return null;
        const blob = await resp.blob();
        if (!blob || blob.size <= 0) return null;
        return blob;
    } catch {
        return null;
    }
}

export async function resolveAndCacheSiteIcon(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: { forceRefresh?: boolean; ttlMs?: number; retryMs?: number; timeoutMs?: number; minEdgePx?: number }
): Promise<SiteIconResult | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const ttlMs = options?.ttlMs ?? SITE_ICON_TTL_MS;
    const retryMs = options?.retryMs ?? SITE_ICON_RETRY_MS;
    const now = Date.now();
    const record = runtime.siteIcons.records[domain];
    const recordMode = getRecordCacheMode(record);
    const cached = await readCachedSiteIcon(rawUrl, runtime, ttlMs);
    const forceRefresh = !!options?.forceRefresh;

    const releaseCachedIfUnused = () => {
        if (cached?.objectUrl && cached.url.startsWith('blob:')) {
            URL.revokeObjectURL(cached.url);
        }
    };

    if (!forceRefresh) {
        if (recordMode === 'miss' && isRetryLocked(record, now)) {
            return null;
        }
        if (cached) {
            return cached;
        }
    }

    const probe = await probeBestIconCandidate(rawUrl, {
        timeoutMs: options?.timeoutMs ?? 2500,
        minEdgePx: options?.minEdgePx ?? getEffectiveMinEdgePx(ICON_MIN_EDGE_PX),
    });

    if (!probe) {
        if (cached) return cached;
        writeMissRecord(runtime, domain, now + retryMs, 'probe_failed');
        releaseCachedIfUnused();
        return null;
    }

    const canPersist = !probe.lowQuality && canFetchToBlob(probe.url, probe.provider);

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
            });

            releaseCachedIfUnused();
            return {
                url: URL.createObjectURL(blob),
                domain,
                fromCache: true,
                objectUrl: true,
                lowQuality: false,
                stale: false,
                provider: probe.provider,
                qualityScore: probe.qualityScore,
            };
        }
    }

    writeUrlRecord(runtime, domain, {
        url: probe.url,
        source: probe.source,
        provider: probe.provider,
        qualityScore: probe.qualityScore,
        width: probe.width,
        height: probe.height,
        retryAfter: now + retryMs,
        error: canPersist ? 'persist_blob_failed' : 'display_only',
    });

    releaseCachedIfUnused();

    return {
        url: probe.url,
        domain,
        fromCache: false,
        objectUrl: false,
        lowQuality: probe.lowQuality,
        stale: false,
        provider: probe.provider,
        qualityScore: probe.qualityScore,
    };
}
