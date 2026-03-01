import {idbGetBlob, idbSetBlob} from '../../core/storage/photoIdb';
import {
    extractSiteDomain,
    getEffectiveMinEdgePx,
    ICON_MIN_EDGE_PX,
    isExtensionContext,
    probeFastIconCandidate,
    probeBestIconCandidate,
    type IconProvider
} from './icon';
import type {RuntimeConfig, SiteIconCacheMode, SiteIconCacheRecord, SiteIconProvider} from '../../core/config/types';

export const SITE_ICON_CACHE_VERSION = 5;
export const SITE_ICON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SITE_ICON_RETRY_MS = 24 * 60 * 60 * 1000;
export const SITE_ICON_IMG_ERROR_RETRY_MS = 2 * 60 * 1000;
export const SITE_ICON_PROVIDER_BACKOFF_MS = 10 * 60 * 1000;
export const SITE_ICON_EXTERNAL_PROVIDER_BACKOFF_MS = 30 * 60 * 1000;

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

function isExternalProvider(provider: SiteIconProvider | IconProvider | undefined): boolean {
    return provider === 'google_s2' || provider === 'duckduckgo' || provider === 'yandex';
}

function isKnownProvider(provider: any): provider is SiteIconProvider {
    return provider === 'browser_favicon'
        || provider === 'google_s2'
        || provider === 'yandex'
        || provider === 'duckduckgo'
        || provider === 'site_manifest'
        || provider === 'site_favicon'
        || provider === 'preset'
        || provider === 'unknown';
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
        for (const [domain, value] of Object.entries(runtime.siteIcons.records)) {
            const rec = value as SiteIconCacheRecord | undefined;
            if (!rec || typeof rec !== 'object') {
                delete runtime.siteIcons.records[domain];
                continue;
            }

            const mode = getRecordCacheMode(rec);
            const source = String(rec.source || '').toLowerCase();
            const provider = (rec.provider || 'unknown') as SiteIconProvider;
            const poisonedBrowserScheme = source.startsWith('chrome://') || source.startsWith('edge://');
            const poisonedBrowserUrl = mode === 'url' && provider === 'browser_favicon';
            const poisonedFailedExternal = mode === 'url'
                && isExternalProvider(provider)
                && (rec.lastError === 'img_error' || rec.lastError === 'probe_failed');
            const poisonedMiss = mode === 'miss' && (rec.lastError === 'img_error' || rec.lastError === 'probe_failed');

            if (poisonedBrowserScheme || poisonedBrowserUrl || poisonedFailedExternal || poisonedMiss) {
                delete runtime.siteIcons.records[domain];
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
        return true;
    }

    // URL fallback failed to render: downgrade to miss to avoid reusing poisoned URL.
    writeMissRecord(runtime, domain, retryAfter, error, existingProvider);
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
    options?: {
        forceRefresh?: boolean;
        ttlMs?: number;
        retryMs?: number;
        timeoutMs?: number;
        minEdgePx?: number;
        fastFirst?: boolean;
        fastTimeoutMs?: number;
        backgroundUpgrade?: boolean;
    }
): Promise<SiteIconResult | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const ttlMs = options?.ttlMs ?? SITE_ICON_TTL_MS;
    const retryMs = options?.retryMs ?? SITE_ICON_RETRY_MS;
    const slowTimeoutMs = Number.isFinite(Number(options?.timeoutMs))
        ? Math.max(400, Number(options?.timeoutMs))
        : 1200;
    const fastFirst = options?.fastFirst ?? true;
    const fastTimeoutMsRaw = Number(options?.fastTimeoutMs ?? 800);
    const fastTimeoutMs = Number.isFinite(fastTimeoutMsRaw) ? Math.max(300, fastTimeoutMsRaw) : 800;
    const backgroundUpgrade = options?.backgroundUpgrade ?? true;
    const minEdgePx = options?.minEdgePx ?? getEffectiveMinEdgePx(ICON_MIN_EDGE_PX);
    const now = Date.now();
    const record = runtime.siteIcons.records[domain];
    const recordMode = getRecordCacheMode(record);
    const skipProviders = getSkippedProviders(record, now);
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
        if (recordMode === 'url' && isRetryLocked(record, now) && record?.lastError === 'img_error') {
            return null;
        }
        if (cached) {
            return cached;
        }
    }

    const materializeProbeResult = async (probe: {
        url: string;
        source: string;
        provider: IconProvider;
        qualityScore: number;
        width: number;
        height: number;
        lowQuality: boolean;
    }): Promise<SiteIconResult> => {
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
                    providerBackoffUntil: withoutProviderBackoff(runtime.siteIcons.records[domain], probe.provider),
                });

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
    };

    const releaseUnusedResultObjectUrl = (result: SiteIconResult | null | undefined) => {
        if (result?.objectUrl && result.url.startsWith('blob:')) {
            URL.revokeObjectURL(result.url);
        }
    };

    if (fastFirst) {
        const fastProbe = await probeFastIconCandidate(rawUrl, {
            timeoutMs: fastTimeoutMs,
            minEdgePx,
            skipProviders,
        });

        if (fastProbe) {
            const fastResult = await materializeProbeResult(fastProbe);
            releaseCachedIfUnused();

            if (!forceRefresh && backgroundUpgrade && fastProbe.lowQuality) {
                window.setTimeout(() => {
                    void resolveAndCacheSiteIcon(rawUrl, runtime, {
                        forceRefresh: true,
                        ttlMs,
                        retryMs,
                        timeoutMs: slowTimeoutMs,
                        minEdgePx,
                        fastFirst: false,
                        fastTimeoutMs,
                        backgroundUpgrade: false,
                    })
                        .then((result) => releaseUnusedResultObjectUrl(result))
                        .catch(() => null);
                }, 0);
            }

            return fastResult;
        }
    }

    const probe = await probeBestIconCandidate(rawUrl, {
        timeoutMs: slowTimeoutMs,
        minEdgePx,
        skipProviders,
    });

    if (!probe) {
        if (cached) return cached;
        writeMissRecord(runtime, domain, now + retryMs, 'probe_failed', record?.provider as IconProvider | undefined);
        releaseCachedIfUnused();
        return null;
    }

    const finalResult = await materializeProbeResult(probe);
    releaseCachedIfUnused();
    return finalResult;
}
