import type {RuntimeConfig} from '../../core/config/types';
import {
    getFastIconCandidatesWithProviders,
    getIconCandidatesWithProviders,
    type IconProvider,
} from './icon';
import {resolveAndCacheSiteIcon, type SiteIconResolveOptions, type SiteIconResult} from './siteIconCache';

export type IconBrowserWarmOptions = {
    fastFirst?: boolean;
    limit?: number;
    timeoutMs?: number;
    linkRel?: 'prefetch' | 'preload';
};

export type SiteIconPreloadOptions = SiteIconResolveOptions & {
    concurrency?: number;
    browserWarm?: boolean;
    browserWarmLimit?: number;
    signal?: AbortSignal;
    onProgress?: (result: SiteIconPreloadItemResult) => void;
};

export type SiteIconPreloadItemResult = {
    url: string;
    ok: boolean;
    fromCache?: boolean;
    provider?: string;
    error?: string;
};

export type SiteIconPreloadBatchResult = {
    total: number;
    loaded: number;
    failed: number;
    cancelled: boolean;
    results: SiteIconPreloadItemResult[];
};

export type SiteIconPreloadHandle = {
    cancel: () => void;
    done: Promise<SiteIconPreloadBatchResult>;
};

const DEFAULT_BROWSER_WARM_LIMIT = 4;
const browserWarmInflight = new Map<string, Promise<boolean>>();
const browserWarmSeen = new Set<string>();
const BROWSER_WARM_SEEN_MAX = 2048;

function trimBrowserWarmSeen(): void {
    if (browserWarmSeen.size <= BROWSER_WARM_SEEN_MAX) return;
    const keep = Array.from(browserWarmSeen).slice(-BROWSER_WARM_SEEN_MAX);
    browserWarmSeen.clear();
    for (const url of keep) browserWarmSeen.add(url);
}

function canWarmBrowserUrl(url: string): boolean {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return false;
    if (typeof window === 'undefined') return false;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.protocol === 'chrome-extension:') return true;
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        if (parsed.origin === window.location.origin) return true;
        return false;
    } catch {
        return false;
    }
}

function canSpeculativelyWarmProvider(provider: IconProvider): boolean {
    return provider === 'browser_favicon'
        || provider === 'first_party_proxy'
        || provider === 'preset'
        || provider === 'unknown';
}

function appendWarmLink(url: string, rel: 'prefetch' | 'preload'): void {
    if (typeof document === 'undefined' || !document.head) return;
    const existing = Array.from(document.head.querySelectorAll('link[data-voidtab-icon-preload]'))
        .some((node) => node.getAttribute('data-voidtab-icon-preload') === url);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = rel;
    link.as = 'image';
    link.href = url;
    link.referrerPolicy = 'no-referrer';
    link.setAttribute('data-voidtab-icon-preload', url);
    document.head.appendChild(link);

    window.setTimeout(() => {
        try {
            link.remove();
        } catch {
            // ignore detached preload link
        }
    }, 45_000);
}

function releaseObjectUrl(result: SiteIconResult | null | undefined): void {
    if (result?.objectUrl && result.url.startsWith('blob:')) {
        URL.revokeObjectURL(result.url);
    }
}

export function getBrowserWarmIconCandidates(rawUrl: string, options?: IconBrowserWarmOptions): string[] {
    const fast = options?.fastFirst ?? true ? getFastIconCandidatesWithProviders(rawUrl) : [];
    const full = getIconCandidatesWithProviders(rawUrl);
    const seen = new Set<string>();
    const merged = [...fast, ...full].filter((candidate) => {
        if (!candidate.url || seen.has(candidate.url)) return false;
        if (!canSpeculativelyWarmProvider(candidate.provider)) return false;
        seen.add(candidate.url);
        return canWarmBrowserUrl(candidate.url);
    });
    const limit = Math.max(1, Number(options?.limit ?? DEFAULT_BROWSER_WARM_LIMIT));
    return merged.slice(0, limit).map((candidate) => candidate.url);
}

export function warmBrowserIconUrl(url: string, options?: IconBrowserWarmOptions): Promise<boolean> {
    if (!canWarmBrowserUrl(url)) return Promise.resolve(false);
    const existing = browserWarmInflight.get(url);
    if (existing) return existing;

    if (!browserWarmSeen.has(url)) {
        browserWarmSeen.add(url);
        trimBrowserWarmSeen();
        appendWarmLink(url, options?.linkRel ?? 'prefetch');
    }

    const timeoutMs = Math.max(300, Number(options?.timeoutMs ?? 1200));
    const promise = new Promise<boolean>((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(ok);
        };
        const timer = window.setTimeout(() => finish(false), timeoutMs);

        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = url;
    });

    browserWarmInflight.set(url, promise);
    void promise.finally(() => browserWarmInflight.delete(url));
    return promise;
}

export async function warmBrowserIconCache(rawUrl: string, options?: IconBrowserWarmOptions): Promise<number> {
    const candidates = getBrowserWarmIconCandidates(rawUrl, options);
    if (!candidates.length) return 0;
    const settled = await Promise.allSettled(candidates.map((url) => warmBrowserIconUrl(url, options)));
    return settled.filter((x) => x.status === 'fulfilled' && x.value).length;
}

export async function preloadSiteIcon(
    rawUrl: string,
    runtime: RuntimeConfig,
    options?: SiteIconPreloadOptions
): Promise<SiteIconPreloadItemResult> {
    if (options?.signal?.aborted) {
        return {url: rawUrl, ok: false, error: 'cancelled'};
    }

    if (options?.browserWarm ?? true) {
        void warmBrowserIconCache(rawUrl, {
            fastFirst: options?.fastFirst,
            limit: options?.browserWarmLimit,
            timeoutMs: Math.min(1200, Number(options?.fastTimeoutMs ?? 800)),
        });
    }

    try {
        const result = await resolveAndCacheSiteIcon(rawUrl, runtime, {
            ...options,
            backgroundUpgrade: options?.backgroundUpgrade ?? false,
        });
        const item: SiteIconPreloadItemResult = {
            url: rawUrl,
            ok: !!result?.url,
            fromCache: result?.fromCache,
            provider: result?.provider,
            error: result?.url ? undefined : 'not_found',
        };
        releaseObjectUrl(result);
        return item;
    } catch (err) {
        return {
            url: rawUrl,
            ok: false,
            error: err instanceof Error ? err.message : 'preload_failed',
        };
    }
}

export async function preloadSiteIcons(
    rawUrls: Iterable<string>,
    runtime: RuntimeConfig,
    options?: SiteIconPreloadOptions
): Promise<SiteIconPreloadBatchResult> {
    const urls = Array.from(new Set(Array.from(rawUrls).map((x) => String(x || '').trim()).filter(Boolean)));
    const concurrency = Math.max(1, Math.min(12, Number(options?.concurrency ?? 4)));
    const results: SiteIconPreloadItemResult[] = [];
    let loaded = 0;
    let nextIndex = 0;
    let cancelled = false;

    const worker = async () => {
        while (nextIndex < urls.length) {
            if (options?.signal?.aborted) {
                cancelled = true;
                return;
            }

            const url = urls[nextIndex++];
            const result = await preloadSiteIcon(url, runtime, options);
            results.push(result);
            if (result.ok) loaded += 1;
            options?.onProgress?.(result);
        }
    };

    await Promise.all(Array.from({length: Math.min(concurrency, urls.length)}, () => worker()));
    cancelled = cancelled || !!options?.signal?.aborted;

    return {
        total: urls.length,
        loaded,
        failed: urls.length - loaded,
        cancelled,
        results,
    };
}

export function queueSiteIconPreload(
    rawUrls: Iterable<string>,
    runtime: RuntimeConfig,
    options?: SiteIconPreloadOptions & {idleTimeoutMs?: number}
): SiteIconPreloadHandle {
    let cancelled = false;
    let started = false;
    let settled = false;
    let idleId: number | null = null;
    let timerId: number | null = null;
    let finishDone: (result: SiteIconPreloadBatchResult) => void = () => undefined;
    const controller = new AbortController();
    const queuedOptions: SiteIconPreloadOptions = {
        ...options,
        signal: controller.signal,
    };

    if (options?.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), {once: true});
    }

    const done = new Promise<SiteIconPreloadBatchResult>((resolve) => {
        const finish = (result: SiteIconPreloadBatchResult) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        finishDone = finish;

        const run = () => {
            started = true;
            if (cancelled) {
                finish({total: 0, loaded: 0, failed: 0, cancelled: true, results: []});
                return;
            }
            void preloadSiteIcons(rawUrls, runtime, queuedOptions).then(finish);
        };

        if (typeof window === 'undefined') {
            void preloadSiteIcons(rawUrls, runtime, queuedOptions).then(finish);
            return;
        }

        const requestIdle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: {timeout: number}) => number);
        if (requestIdle) {
            idleId = requestIdle(run, {timeout: Math.max(500, Number(options?.idleTimeoutMs ?? 2000))});
        } else {
            timerId = window.setTimeout(run, Math.max(0, Number(options?.idleTimeoutMs ?? 0)));
        }
    });

    return {
        cancel: () => {
            cancelled = true;
            controller.abort();
            if (typeof window === 'undefined') return;
            const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
            if (idleId != null && cancelIdle) cancelIdle(idleId);
            if (timerId != null) window.clearTimeout(timerId);
            if (!started) finishDone({total: 0, loaded: 0, failed: 0, cancelled: true, results: []});
        },
        done,
    };
}
