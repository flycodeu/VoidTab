import {idbGetBlob, idbSetBlob} from '../../core/storage/photoIdb';
import {extractSiteDomain, ICON_MIN_EDGE_PX, probeBestIconCandidate} from './icon';
import type {RuntimeConfig, SiteIconCacheRecord} from '../../core/config/types';

export const SITE_ICON_CACHE_VERSION = 1;
export const SITE_ICON_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SiteIconResult = {
    url: string;
    domain: string;
    fromCache: boolean;
    objectUrl: boolean;
    lowQuality: boolean;
    stale: boolean;
};

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
        runtime.siteIcons.version = SITE_ICON_CACHE_VERSION;
    }

    if (!Number.isFinite(Number(runtime.siteIcons.lastBatchRefreshAt))) {
        runtime.siteIcons.lastBatchRefreshAt = 0;
    }
}

export function isRecordStale(record: SiteIconCacheRecord | undefined, ttlMs = SITE_ICON_TTL_MS): boolean {
    if (!record) return true;
    const updated = Number(record.updatedAt || 0);
    return !updated || (Date.now() - updated > ttlMs);
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
    if (!record?.blobKey) return null;

    const blob = await idbGetBlob(record.blobKey);
    if (!blob) return null;

    return {
        url: URL.createObjectURL(blob),
        domain,
        fromCache: true,
        objectUrl: true,
        lowQuality: !!(record.width && record.height && Math.min(record.width, record.height) < ICON_MIN_EDGE_PX),
        stale: isRecordStale(record, ttlMs),
    };
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
    options?: { forceRefresh?: boolean; ttlMs?: number; timeoutMs?: number; minEdgePx?: number }
): Promise<SiteIconResult | null> {
    ensureSiteIconRuntime(runtime);

    const domain = extractSiteDomain(rawUrl);
    if (!domain) return null;

    const ttlMs = options?.ttlMs ?? SITE_ICON_TTL_MS;
    const cached = await readCachedSiteIcon(rawUrl, runtime, ttlMs);

    if (cached && !options?.forceRefresh && !cached.stale) {
        return cached;
    }

    const probe = await probeBestIconCandidate(rawUrl, {
        timeoutMs: options?.timeoutMs ?? 2500,
        minEdgePx: options?.minEdgePx ?? ICON_MIN_EDGE_PX,
    });

    if (!probe) return cached ?? null;

    const releaseCachedIfUnused = () => {
        if (cached?.objectUrl && cached.url.startsWith('blob:')) {
            URL.revokeObjectURL(cached.url);
        }
    };

    const blob = await fetchIconBlob(probe.url);
    if (blob) {
        const blobKey = getSiteIconBlobKey(domain);
        await idbSetBlob(blobKey, blob);
        runtime.siteIcons.records[domain] = {
            blobKey,
            updatedAt: Date.now(),
            source: probe.source,
            width: probe.width,
            height: probe.height,
        };
        releaseCachedIfUnused();

        return {
            url: URL.createObjectURL(blob),
            domain,
            fromCache: true,
            objectUrl: true,
            lowQuality: probe.lowQuality,
            stale: false,
        };
    }

    releaseCachedIfUnused();

    return {
        url: probe.url,
        domain,
        fromCache: false,
        objectUrl: false,
        lowQuality: probe.lowQuality,
        stale: false,
    };
}
