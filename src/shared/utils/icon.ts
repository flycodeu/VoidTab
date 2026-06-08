import {fetchWithRetry} from './network';

export type IconProvider =
    | 'browser_favicon'
    | 'first_party_proxy'
    | 'cn_favicon'
    | 'google_s2'
    | 'yandex'
    | 'duckduckgo'
    | 'icon_horse'
    | 'favicon_im'
    | 'unavatar'
    | 'site_manifest'
    | 'site_favicon'
    | 'preset'
    | 'unknown';

type IconCandidate = {
    url: string;
    provider: IconProvider;
};

type CandidateHealthCacheEntry = {
    ok: boolean;
    retryAfter: number;
    status?: number;
};

type PersistentFailEntry = {
    retryAfter: number;
    failCount: number;
    lastStatus?: number;
    lastFailAt: number;
};

type PathFailureStat = {
    failCount: number;
    lastFailAt: number;
    lastStatus?: number;
};

type ProviderFailureStat = {
    count: number;
    lastAt: number;
    lastStatus?: number;
};

type ProbeOptions = {
    timeoutMs?: number;
    totalTimeoutMs?: number;
    maxCandidates?: number;
    minEdgePx?: number;
    skipProviders?: Iterable<IconProvider>;
    declaredTimeoutMs?: number;
    parallelism?: number;
};

const CANDIDATE_FAIL_RETRY_MS = 30 * 60 * 1000;
const CANDIDATE_OK_TTL_MS = 10 * 60 * 1000;
const PERSISTENT_FAIL_TTL_MS = 24 * 60 * 60 * 1000;
const PERSISTENT_TRANSIENT_FAIL_TTL_MS = 30 * 60 * 1000;
const PERSISTENT_FAIL_STORAGE_KEY = 'voidtab:icon_candidate_fail:v3';
const PERSISTENT_FAIL_MAX_ENTRIES = 1200;
const FAILURE_STATS_STORAGE_KEY = 'voidtab:icon_failure_stats:v2';
const FAILURE_STATS_MAX_PATH_ENTRIES = 1200;
const candidateHealthCache = new Map<string, CandidateHealthCacheEntry>();
const persistentFailCache = new Map<string, PersistentFailEntry>();
const providerFailureStats = new Map<IconProvider, ProviderFailureStat>();
const pathFailureStats = new Map<string, PathFailureStat>();
let persistentFailLoaded = false;
let persistentFailPersistTimer: number | null = null;
let failureStatsPersistTimer: number | null = null;

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && !!window.localStorage;
}

function loadPersistentFailCache(): void {
    if (persistentFailLoaded) return;
    persistentFailLoaded = true;
    if (!canUseStorage()) return;

    try {
        const raw = window.localStorage.getItem(PERSISTENT_FAIL_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, any>;
        const now = Date.now();
        for (const [url, value] of Object.entries(parsed || {})) {
            if (!value || typeof value !== 'object') continue;
            const retryAfter = Number((value as any).retryAfter);
            const failCount = Number((value as any).failCount);
            const lastFailAt = Number((value as any).lastFailAt);
            const lastStatusRaw = Number((value as any).lastStatus);
            if (!Number.isFinite(retryAfter) || retryAfter <= now) continue;
            if (!Number.isFinite(failCount) || failCount <= 0) continue;
            if (!Number.isFinite(lastFailAt) || lastFailAt <= 0) continue;
            persistentFailCache.set(url, {
                retryAfter,
                failCount,
                lastFailAt,
                lastStatus: Number.isFinite(lastStatusRaw) ? lastStatusRaw : undefined,
            });
        }
    } catch {
        // ignore broken storage payload
    }
}

function schedulePersistPersistentFailCache(): void {
    if (!canUseStorage()) return;
    if (persistentFailPersistTimer != null) return;
    persistentFailPersistTimer = window.setTimeout(() => {
        persistentFailPersistTimer = null;
        const now = Date.now();
        const alive = Array.from(persistentFailCache.entries())
            .filter(([, value]) => Number(value.retryAfter) > now)
            .sort((a, b) => Number(b[1].lastFailAt || 0) - Number(a[1].lastFailAt || 0))
            .slice(0, PERSISTENT_FAIL_MAX_ENTRIES);
        const payload: Record<string, PersistentFailEntry> = {};
        for (const [url, value] of alive) payload[url] = value;
        try {
            window.localStorage.setItem(PERSISTENT_FAIL_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore quota/storage failures
        }
    }, 200);
}

function schedulePersistFailureStats(): void {
    if (!canUseStorage()) return;
    if (failureStatsPersistTimer != null) return;
    failureStatsPersistTimer = window.setTimeout(() => {
        failureStatsPersistTimer = null;
        const providerStats: Record<string, ProviderFailureStat> = {};
        for (const [provider, stat] of providerFailureStats.entries()) {
            providerStats[provider] = stat;
        }
        const pathMisses: Record<string, PathFailureStat> = {};
        const pathEntries = Array.from(pathFailureStats.entries())
            .sort((a, b) => Number(b[1].lastFailAt || 0) - Number(a[1].lastFailAt || 0))
            .slice(0, FAILURE_STATS_MAX_PATH_ENTRIES);
        for (const [path, stat] of pathEntries) {
            pathMisses[path] = stat;
        }
        try {
            window.localStorage.setItem(
                FAILURE_STATS_STORAGE_KEY,
                JSON.stringify({
                    totalFailures: Array.from(providerFailureStats.values()).reduce((acc, x) => acc + Number(x.count || 0), 0),
                    providerStats,
                    pathMisses,
                    updatedAt: Date.now(),
                })
            );
        } catch {
            // ignore quota/storage failures
        }
    }, 300);
}

function buildPathFailureKey(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase()}`;
    } catch {
        return url.toLowerCase();
    }
}

function rememberPersistentFailure(url: string, status?: number): void {
    loadPersistentFailCache();
    const now = Date.now();
    const prev = persistentFailCache.get(url);
    const isPermanentFailure = status === 404 || status === 410;
    const ttlMs = isPermanentFailure ? PERSISTENT_FAIL_TTL_MS : PERSISTENT_TRANSIENT_FAIL_TTL_MS;
    persistentFailCache.set(url, {
        retryAfter: now + ttlMs,
        failCount: Number(prev?.failCount || 0) + 1,
        lastStatus: status,
        lastFailAt: now,
    });
    schedulePersistPersistentFailCache();
}

function clearPersistentFailure(url: string): void {
    loadPersistentFailCache();
    if (!persistentFailCache.delete(url)) return;
    schedulePersistPersistentFailCache();
}

function rememberProviderAndPathFailure(url: string, provider: IconProvider, status?: number): void {
    const providerPrev = providerFailureStats.get(provider);
    providerFailureStats.set(provider, {
        count: Number(providerPrev?.count || 0) + 1,
        lastAt: Date.now(),
        lastStatus: status,
    });

    const pathKey = buildPathFailureKey(url);
    const pathPrev = pathFailureStats.get(pathKey);
    pathFailureStats.set(pathKey, {
        failCount: Number(pathPrev?.failCount || 0) + 1,
        lastFailAt: Date.now(),
        lastStatus: status,
    });
    if (pathFailureStats.size > FAILURE_STATS_MAX_PATH_ENTRIES * 2) {
        const pruned = Array.from(pathFailureStats.entries())
            .sort((a, b) => Number(b[1].lastFailAt || 0) - Number(a[1].lastFailAt || 0))
            .slice(0, FAILURE_STATS_MAX_PATH_ENTRIES);
        pathFailureStats.clear();
        for (const [key, value] of pruned) {
            pathFailureStats.set(key, value);
        }
    }
    schedulePersistFailureStats();
}

export function isDirectIconSource(value: string | null | undefined): boolean {
    if (!value) return false;
    const normalized = String(value).trim();
    if (!normalized) return false;
    return normalized.startsWith('data:') || normalized.startsWith('blob:') || normalized.includes('/');
}

const PRESET_ICONS: Record<string, string> = {
    'github.com': 'https://github.githubassets.com/favicons/favicon.png',
    'bilibili.com': 'https://www.bilibili.com/favicon.ico',
    'youtube.com': 'https://www.youtube.com/s/desktop/10c3080e/img/favicon_144x144.png',
    'taobao.com': 'https://img.alicdn.com/tfs/TB1_uT8a5ZX8KJjSgoSXXa.sXXa-128-128.png',
    'zhihu.com': 'https://static.zhihu.com/heifetz/assets/apple-touch-icon-152.a53ae37b.png',
    'csdn.net': 'https://g.csdnimg.cn/static/logo/favicon32.ico',
    'chat.deepseek.com': 'https://cdn.deepseek.com/chat/icon.png',
    'deepseek.com': 'https://cdn.deepseek.com/chat/icon.png',
};

export const ICON_MIN_EDGE_PX = 96;
export const RETINA_ICON_MIN_EDGE_PX = 96;

export type IconProbeResult = {
    url: string;
    source: string;
    provider: IconProvider;
    width: number;
    height: number;
    lowQuality: boolean;
    qualityScore: number;
};

const MULTI_LEVEL_PUBLIC_SUFFIXES = new Set([
    'ac.uk',
    'co.jp',
    'co.kr',
    'co.nz',
    'co.uk',
    'com.au',
    'com.br',
    'com.cn',
    'com.hk',
    'com.sg',
    'com.tw',
    'edu.cn',
    'gov.cn',
    'net.cn',
    'org.cn',
]);

function safeParseUrl(rawUrl: string): URL | null {
    if (!rawUrl) return null;
    try {
        return new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    } catch {
        return null;
    }
}

function normalizeHost(hostname: string): string {
    return String(hostname || '').trim().toLowerCase().replace(/\.+$/, '');
}

function isIpHost(hostname: string): boolean {
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
    // URL#hostname returns IPv6 without brackets, e.g. "::1"
    if (hostname.includes(':')) return true;
    return false;
}

export function getRegistrableDomain(hostname: string): string {
    const host = normalizeHost(hostname);
    if (!host) return '';
    if (isPrivateOrLocalHost(host) || isIpHost(host)) return host;

    const labels = host.split('.').filter(Boolean);
    if (labels.length <= 2) return host;

    const publicSuffix2 = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
    if (MULTI_LEVEL_PUBLIC_SUFFIXES.has(publicSuffix2) && labels.length >= 3) {
        return labels.slice(-3).join('.');
    }

    return labels.slice(-2).join('.');
}

function getThirdPartyQueryDomains(hostname: string): string[] {
    const host = normalizeHost(hostname);
    if (!host) return [];

    const registrable = getRegistrableDomain(host);
    if (!registrable || registrable === host) return [host];
    return [host, registrable];
}

function dedupe(candidates: IconCandidate[]): IconCandidate[] {
    const seen = new Set<string>();
    const out: IconCandidate[] = [];
    for (const item of candidates) {
        if (!item?.url || seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
    }
    return out;
}

function pushPresetCandidate(candidates: IconCandidate[], host: string, rootDomain: string) {
    if (host && PRESET_ICONS[host]) {
        candidates.push({url: PRESET_ICONS[host], provider: 'preset'});
        return;
    }
    if (rootDomain && PRESET_ICONS[rootDomain]) {
        candidates.push({url: PRESET_ICONS[rootDomain], provider: 'preset'});
    }
}

function buildSiteOriginCandidates(origin: string): IconCandidate[] {
    return [
        {
            url: `${origin}/favicon.ico`,
            provider: 'site_favicon',
        },
        {
            url: `${origin}/favicon.svg`,
            provider: 'site_manifest',
        },
        {
            url: `${origin}/favicon.png`,
            provider: 'site_manifest',
        },
        {
            url: `${origin}/apple-touch-icon.png`,
            provider: 'site_manifest',
        },
        {
            url: `${origin}/favicon-32x32.png`,
            provider: 'site_manifest',
        },
    ];
}

export function isExtensionContext(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
}

function canUseBrowserFaviconApi(): boolean {
    if (!isExtensionContext()) return false;
    try {
        const manifest = chrome.runtime?.getManifest?.() as any;
        const permissions = [
            ...(Array.isArray(manifest?.permissions) ? manifest.permissions : []),
            ...(Array.isArray(manifest?.optional_permissions) ? manifest.optional_permissions : []),
        ];
        return permissions.includes('favicon');
    } catch {
        return false;
    }
}

export function getEffectiveMinEdgePx(base = ICON_MIN_EDGE_PX): number {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    if (dpr >= 2) return Math.max(base, RETINA_ICON_MIN_EDGE_PX);
    return base;
}

export function extractSiteDomain(rawUrl: string): string {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return '';
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
}

export function isPrivateOrLocalHost(hostname: string): boolean {
    if (!hostname) return false;
    const host = String(hostname).trim().toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
    if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
    if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
    const m = host.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
    if (m) {
        const second = Number(m[1]);
        if (second >= 16 && second <= 31) return true;
    }
    return false;
}

export function isPrivateOrLocalUrl(rawUrl: string): boolean {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return false;
    return isPrivateOrLocalHost(parsed.hostname);
}

function buildExtensionCandidates(pageUrl: string): IconCandidate[] {
    const encoded = encodeURIComponent(pageUrl);
    const runtimeBase = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('').replace(/\/$/, '')
        : '';

    const primary = runtimeBase
        ? `${runtimeBase}/_favicon/?pageUrl=${encoded}&size=128`
        : `/_favicon/?pageUrl=${encoded}&size=128`;
    const fallback = runtimeBase
        ? `${runtimeBase}/_favicon/?pageUrl=${encoded}&size=64`
        : `/_favicon/?pageUrl=${encoded}&size=64`;

    return [
        {url: primary, provider: 'browser_favicon'},
        {url: fallback, provider: 'browser_favicon'},
    ];
}

export function resolveDirectIconUrl(rawIcon: string | null | undefined, pageUrl?: string): string {
    const raw = String(rawIcon || '').trim();
    if (!raw || !isDirectIconSource(raw)) return '';

    if (/^data:image\//i.test(raw)) return raw;
    if (raw.startsWith('blob:')) return '';

    const page = safeParseUrl(pageUrl || '');
    const pageHref = page?.href || '';
    const pageOrigin = page?.origin || '';
    const browserFaviconForPage = (targetUrl: string) => {
        const target = safeParseUrl(targetUrl);
        if (!target || !isExtensionContext() || !canUseBrowserFaviconApi()) return '';
        return buildExtensionCandidates(target.href)[0]?.url || '';
    };

    try {
        const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
        const fallbackBase = pageOrigin || (typeof window !== 'undefined' ? window.location.href : 'https://voidtab.local/');
        const normalizedRaw = raw.startsWith('//') ? `${browserProtocol}${raw}` : raw;
        const parsed = new URL(normalizedRaw, fallbackBase);

        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;

        if ((parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') && parsed.pathname.startsWith('/_favicon/')) {
            return browserFaviconForPage(parsed.searchParams.get('pageUrl') || pageHref);
        }

        if ((parsed.protocol === 'chrome:' || parsed.protocol === 'edge:') && parsed.href.includes('favicon')) {
            return browserFaviconForPage(pageHref);
        }
    } catch {
        if (pageOrigin) {
            try {
                return new URL(raw, pageOrigin).href;
            } catch {
                return '';
            }
        }
    }

    return '';
}

export function canUseDirectIconInstantly(resolvedUrl: string | null | undefined): boolean {
    const raw = String(resolvedUrl || '').trim();
    if (!raw) return false;
    if (/^data:image\//i.test(raw)) return true;
    if (typeof window === 'undefined') return false;

    try {
        const parsed = new URL(raw, window.location.href);
        if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') {
            return parsed.pathname.startsWith('/_favicon/') || parsed.origin === window.location.origin;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        return parsed.origin === window.location.origin;
    } catch {
        return false;
    }
}

export function getDirectIconFallbackUrl(
    rawIcon: string | null | undefined,
    rawIconValue: string | null | undefined,
    pageUrl?: string
): string {
    const fromValue = resolveDirectIconUrl(rawIconValue, pageUrl);
    if (canUseDirectIconInstantly(fromValue)) return fromValue;

    const fromIcon = resolveDirectIconUrl(rawIcon, pageUrl);
    if (canUseDirectIconInstantly(fromIcon)) return fromIcon;

    return '';
}

export function getInstantAutoIconUrl(
    pageUrl: string | null | undefined,
    rawIcon: string | null | undefined,
    rawIconValue: string | null | undefined
): string {
    const url = String(pageUrl || '').trim();
    const explicitDirect = resolveDirectIconUrl(rawIconValue, url);
    if (canUseDirectIconInstantly(explicitDirect)) return explicitDirect;

    const legacyDirect = resolveDirectIconUrl(rawIcon, url);
    if (canUseDirectIconInstantly(legacyDirect)) return legacyDirect;

    return getFastIconCandidates(url)[0] || '';
}

function canUseFirstPartyFaviconProxy(): boolean {
    if (typeof window === 'undefined') return false;
    if (isExtensionContext()) return false;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function buildFirstPartyProxyCandidates(pageUrl: string): IconCandidate[] {
    if (!canUseFirstPartyFaviconProxy()) return [];
    try {
        const proxy = new URL('/api/favicon', window.location.origin);
        proxy.searchParams.set('url', pageUrl);
        proxy.searchParams.set('size', '256');
        return [{url: proxy.toString(), provider: 'first_party_proxy'}];
    } catch {
        return [];
    }
}

function buildExternalCandidates(domains: string[]): IconCandidate[] {
    const candidates: IconCandidate[] = [];
    for (const domain of domains) {
        candidates.push({
            url: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=256`,
            provider: 'google_s2',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://icon.horse/icon/${encodeURIComponent(domain)}`,
            provider: 'icon_horse',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
            provider: 'duckduckgo',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://favicon.yandex.net/favicon/${encodeURIComponent(domain)}?size=120`,
            provider: 'yandex',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://api.iowen.cn/favicon/${encodeURIComponent(domain)}.png`,
            provider: 'cn_favicon',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(`https://${domain}`)}`,
            provider: 'google_s2',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://favicon.im/${encodeURIComponent(domain)}?larger=true`,
            provider: 'favicon_im',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://unavatar.io/${encodeURIComponent(domain)}`,
            provider: 'unavatar',
        });
    }
    for (const domain of domains) {
        candidates.push({
            url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
            provider: 'google_s2',
        });
    }
    return candidates;
}

export function getIconCandidatesWithProviders(rawUrl: string): IconCandidate[] {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const host = normalizeHost(parsed.hostname);
    const rootDomain = getRegistrableDomain(host);
    const thirdPartyDomains = getThirdPartyQueryDomains(host);
    const origin = parsed.origin;
    const privateOrLocal = isPrivateOrLocalHost(host);
    const inExtension = isExtensionContext();
    const candidates: IconCandidate[] = [];

    if (inExtension) {
        // Extension: prefer browser favicon first, then presets, then third-party, then site origin.
        if (canUseBrowserFaviconApi()) {
            candidates.push(...buildExtensionCandidates(parsed.href));
        }
        pushPresetCandidate(candidates, host, rootDomain);
        if (!privateOrLocal) {
            candidates.push(...buildExternalCandidates(thirdPartyDomains));
        }
        candidates.push(...buildSiteOriginCandidates(origin));

        return dedupe(candidates);
    }

    // Web/dev: use the same-origin proxy first, then presets/third-party sources
    // to avoid Tracking Prevention and CORP/ORB blocked direct site icons.
    const proxyCandidates = !privateOrLocal ? buildFirstPartyProxyCandidates(parsed.href) : [];
    candidates.push(...proxyCandidates);
    pushPresetCandidate(candidates, host, rootDomain);
    if (!privateOrLocal && !proxyCandidates.length) {
        candidates.push(...buildExternalCandidates(thirdPartyDomains));
    }
    if (privateOrLocal) {
        candidates.push(...buildSiteOriginCandidates(origin));
    }

    return dedupe(candidates);
}

export function getFastIconCandidatesWithProviders(rawUrl: string): IconCandidate[] {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const host = normalizeHost(parsed.hostname);
    const rootDomain = getRegistrableDomain(host);
    const origin = parsed.origin;
    const privateOrLocal = isPrivateOrLocalHost(host);
    const thirdPartyDomains = getThirdPartyQueryDomains(host);
    const inExtension = isExtensionContext();
    const candidates: IconCandidate[] = [];

    if (inExtension) {
        // Fast path (Extension): browser favicon first, then preset, then third-party, then site origin.
        if (canUseBrowserFaviconApi()) {
            candidates.push(...buildExtensionCandidates(parsed.href));
        }
        pushPresetCandidate(candidates, host, rootDomain);
        if (!privateOrLocal) {
            candidates.push(...buildExternalCandidates(thirdPartyDomains));
        }
        candidates.push(...buildSiteOriginCandidates(origin));

        return dedupe(candidates);
    }

    // Fast path (Web): same-origin proxy first, then preset/third-party.
    // Public site-origin favicons are often blocked by CORP/ORB when embedded from the web app.
    const proxyCandidates = !privateOrLocal ? buildFirstPartyProxyCandidates(parsed.href) : [];
    candidates.push(...proxyCandidates);
    pushPresetCandidate(candidates, host, rootDomain);
    if (!privateOrLocal && !proxyCandidates.length) {
        candidates.push(...buildExternalCandidates(thirdPartyDomains));
    }
    if (privateOrLocal) {
        candidates.push(...buildSiteOriginCandidates(origin));
    }

    return dedupe(candidates);
}

export function getIconCandidates(rawUrl: string): string[] {
    return getIconCandidatesWithProviders(rawUrl).map((x) => x.url);
}

export function getFastIconCandidates(rawUrl: string): string[] {
    return getFastIconCandidatesWithProviders(rawUrl).map((x) => x.url);
}

const FETCHABLE_ICON_PROBE_HOSTS = new Set([
    'api.iowen.cn',
    'www.google.com',
    't2.gstatic.com',
    'icons.duckduckgo.com',
    'favicon.yandex.net',
    'favicon.im',
    'icon.horse',
    'unavatar.io',
]);

function canFetchProbeImageBlob(url: string): boolean {
    if (!isExtensionContext()) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && FETCHABLE_ICON_PROBE_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
        return false;
    }
}

async function createProbeImageObjectUrl(url: string, timeoutMs: number): Promise<string> {
    if (!canFetchProbeImageBlob(url)) return '';
    try {
        const resp = await fetchWithRetry(url, {
            cache: 'force-cache',
            credentials: 'omit',
        }, {
            timeoutMs,
            retries: 0,
            metricName: 'icon.probe.blob',
        });
        if (!resp.ok) return '';
        const blob = await resp.blob();
        if (!blob || blob.size <= 0) return '';
        return URL.createObjectURL(blob);
    } catch {
        return '';
    }
}

async function probeImage(url: string, timeoutMs = 2500): Promise<{ width: number; height: number } | null> {
    const objectUrl = await createProbeImageObjectUrl(url, timeoutMs);
    return await new Promise((resolve) => {
        const img = new Image();
        let settled = false;

        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            resolve(value);
        };

        const timer = window.setTimeout(() => finish(null), timeoutMs);

        img.onload = () => {
            finish({
                width: Number(img.naturalWidth || 0),
                height: Number(img.naturalHeight || 0),
            });
        };
        img.onerror = () => finish(null);
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = objectUrl || url;
    });
}

function getLargestDeclaredEdge(sizeValue: string | null | undefined): number {
    if (!sizeValue) return 0;
    const tokens = sizeValue
        .split(/\s+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    let max = 0;
    for (const token of tokens) {
        if (token === 'any') {
            max = Math.max(max, 1024);
            continue;
        }
        const m = token.match(/^(\d+)[xX](\d+)$/);
        if (!m) continue;
        const w = Number(m[1] || 0);
        const h = Number(m[2] || 0);
        if (Number.isFinite(w) && Number.isFinite(h)) {
            max = Math.max(max, Math.min(w, h));
        }
    }
    return max;
}

function scoreDeclaredCandidate(url: string, declaredEdge: number, rel: string, type: string): number {
    let score = declaredEdge || 0;
    const normalizedUrl = url.toLowerCase();
    const normalizedType = String(type || '').toLowerCase();
    const normalizedRel = String(rel || '').toLowerCase();

    if (normalizedType.includes('svg') || normalizedUrl.endsWith('.svg')) score += 1000;
    if (normalizedType.includes('png') || normalizedUrl.endsWith('.png') || normalizedUrl.endsWith('.webp')) score += 200;
    if (normalizedRel.includes('apple-touch-icon')) score += 120;
    if (normalizedRel.includes('mask-icon')) score += 80;
    if (normalizedRel.includes('shortcut icon')) score += 20;
    return score;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
    try {
        const resp = await fetchWithRetry(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
        }, {
            timeoutMs,
            retries: 1,
            retryDelayMs: 250,
            maxRetryDelayMs: 750,
            metricName: 'icon.declared.text',
        });
        if (!resp.ok) return null;
        return await resp.text();
    } catch {
        return null;
    }
}

function shouldPrevalidateCandidate(candidate: IconCandidate): boolean {
    // Browser favicon/proxy are image endpoints and preset is curated; skip extra precheck.
    if (candidate.provider === 'browser_favicon' || candidate.provider === 'first_party_proxy' || candidate.provider === 'preset') return false;
    return true;
}

function canPrevalidateUrl(url: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

        // Only prevalidate same-origin. Extension pages often can render cross-origin
        // favicons as images but cannot fetch them without host permissions.
        return parsed.origin === window.location.origin;
    } catch {
        return false;
    }
}

function getCachedHealth(url: string, now = Date.now()): CandidateHealthCacheEntry | null {
    const cached = candidateHealthCache.get(url);
    if (cached) {
        if (cached.retryAfter <= now) {
            candidateHealthCache.delete(url);
        } else {
            return cached;
        }
    }

    loadPersistentFailCache();
    const persistent = persistentFailCache.get(url);
    if (!persistent) return null;
    if (persistent.retryAfter <= now) {
        persistentFailCache.delete(url);
        schedulePersistPersistentFailCache();
        return null;
    }
    return {
        ok: false,
        retryAfter: persistent.retryAfter,
        status: persistent.lastStatus,
    };
}

function rememberCandidateSuccess(candidate: IconCandidate, status?: number): void {
    candidateHealthCache.set(candidate.url, {
        ok: true,
        retryAfter: Date.now() + CANDIDATE_OK_TTL_MS,
        status,
    });
    clearPersistentFailure(candidate.url);
}

function rememberCandidateFailure(candidate: IconCandidate, status?: number): void {
    candidateHealthCache.set(candidate.url, {
        ok: false,
        retryAfter: Date.now() + CANDIDATE_FAIL_RETRY_MS,
        status,
    });
    rememberPersistentFailure(candidate.url, status);
    rememberProviderAndPathFailure(candidate.url, candidate.provider, status);
}

async function prevalidateCandidateUrl(candidate: IconCandidate, timeoutMs = 1200): Promise<boolean> {
    const now = Date.now();
    const cached = getCachedHealth(candidate.url, now);
    if (cached) return cached.ok;
    if (!canPrevalidateUrl(candidate.url)) return true;

    const tryFetch = async (method: 'HEAD' | 'GET'): Promise<Response> => {
        return await fetchWithRetry(candidate.url, {
            method,
            cache: 'no-store',
            credentials: 'omit',
        }, {
            timeoutMs,
            retries: 0,
            metricName: `icon.prevalidate.${method.toLowerCase()}`,
        });
    };

    try {
        let resp: Response;
        try {
            resp = await tryFetch('HEAD');
            if (resp.status === 405 || resp.status === 501) {
                resp = await tryFetch('GET');
            }
        } catch {
            resp = await tryFetch('GET');
        }

        if (resp.ok) {
            rememberCandidateSuccess(candidate, resp.status);
            return true;
        }

        rememberCandidateFailure(candidate, resp.status);
        return false;
    } catch {
        rememberCandidateFailure(candidate);
        return false;
    }
}

function normalizeResolvedUrl(raw: string, base: string): string {
    if (!raw) return '';
    try {
        const next = new URL(raw, base);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') return '';
        return next.toString();
    } catch {
        return '';
    }
}

async function getDeclaredIconCandidates(rawUrl: string, timeoutMs = 1800): Promise<IconCandidate[]> {
    if (!isExtensionContext()) return [];

    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const html = await fetchTextWithTimeout(parsed.href, timeoutMs);
    if (!html) return [];

    let doc: Document | null = null;
    try {
        doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
        doc = null;
    }
    if (!doc) return [];

    const scored: Array<{ candidate: IconCandidate; score: number }> = [];
    const pushScored = (href: string, edge: number, rel: string, type: string) => {
        const resolved = normalizeResolvedUrl(href, parsed.href);
        if (!resolved) return;
        scored.push({
            candidate: {url: resolved, provider: 'site_manifest'},
            score: scoreDeclaredCandidate(resolved, edge, rel, type),
        });
    };

    const links = Array.from(doc.querySelectorAll('link[href]'));
    for (const link of links) {
        const rel = String(link.getAttribute('rel') || '').trim().toLowerCase();
        if (!rel.includes('icon') && !rel.includes('apple-touch-icon') && !rel.includes('mask-icon')) continue;
        const href = String(link.getAttribute('href') || '').trim();
        if (!href) continue;
        const type = String(link.getAttribute('type') || '').trim().toLowerCase();
        const declaredEdge = getLargestDeclaredEdge(link.getAttribute('sizes'));
        pushScored(href, declaredEdge, rel, type);
    }

    const manifestLink = links.find((link) => String(link.getAttribute('rel') || '').toLowerCase().includes('manifest'));
    if (manifestLink) {
        const manifestHref = String(manifestLink.getAttribute('href') || '').trim();
        const manifestUrl = normalizeResolvedUrl(manifestHref, parsed.href);
        if (manifestUrl) {
            const manifestText = await fetchTextWithTimeout(manifestUrl, timeoutMs);
            if (manifestText) {
                try {
                    const manifestJson = JSON.parse(manifestText);
                    const icons = Array.isArray(manifestJson?.icons) ? manifestJson.icons : [];
                    for (const icon of icons) {
                        if (!icon || typeof icon !== 'object') continue;
                        const src = String(icon.src || '').trim();
                        if (!src) continue;
                        const type = String(icon.type || '').trim().toLowerCase();
                        const declaredEdge = getLargestDeclaredEdge(String(icon.sizes || ''));
                        pushScored(src, declaredEdge, 'manifest', type);
                    }
                } catch {
                    // noop
                }
            }
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return dedupe(scored.map((x) => x.candidate));
}

export async function probeBestIconCandidate(
    rawUrl: string,
    options?: ProbeOptions
): Promise<IconProbeResult | null> {
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const baseCandidates = getIconCandidatesWithProviders(rawUrl);
    const siteOriginCandidates = baseCandidates.filter((x) => x.provider === 'site_favicon' || x.provider === 'site_manifest');
    const browserCandidates = baseCandidates.filter((x) => x.provider === 'browser_favicon');
    const presetCandidates = baseCandidates.filter((x) => x.provider === 'preset');
    const remoteCandidates = baseCandidates.filter(
        (x) =>
            x.provider !== 'site_favicon'
            && x.provider !== 'site_manifest'
            && x.provider !== 'browser_favicon'
            && x.provider !== 'preset'
    );
    const declaredCandidates = await getDeclaredIconCandidates(rawUrl, options?.declaredTimeoutMs ?? 1800);
    const inExtension = isExtensionContext();
    const candidates = dedupe(inExtension ? [
        ...browserCandidates,
        ...presetCandidates,
        ...remoteCandidates,
        ...declaredCandidates,
        ...siteOriginCandidates,
    ] : [
        ...presetCandidates,
        ...remoteCandidates,
        ...siteOriginCandidates,
    ]);
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs: options?.timeoutMs,
        totalTimeoutMs: options?.totalTimeoutMs,
        maxCandidates: options?.maxCandidates,
        minEdgePx: minEdge,
        skipProviders: options?.skipProviders,
        parallelism: options?.parallelism ?? (inExtension ? 2 : 3),
    });
}

export async function probeFastIconCandidate(
    rawUrl: string,
    options?: ProbeOptions
): Promise<IconProbeResult | null> {
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const candidates = getFastIconCandidatesWithProviders(rawUrl);
    const timeoutMs = options?.timeoutMs ?? 800;
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs,
        totalTimeoutMs: options?.totalTimeoutMs ?? Math.max(900, timeoutMs * 3),
        maxCandidates: options?.maxCandidates ?? 8,
        minEdgePx: minEdge,
        skipProviders: options?.skipProviders,
        parallelism: options?.parallelism ?? (isExtensionContext() ? 2 : 3),
    });
}

async function probeSingleIconCandidate(
    candidate: IconCandidate,
    options: {
        minEdge: number;
        skipped: Set<IconProvider>;
        perCandidateTimeoutMs: number;
        deadlineAt: number;
    }
): Promise<IconProbeResult | null> {
    if (options.deadlineAt && Date.now() >= options.deadlineAt) return null;
    if (options.skipped.has(candidate.provider)) return null;

    const cached = getCachedHealth(candidate.url);
    if (cached && !cached.ok) return null;

    const remainingMs = options.deadlineAt
        ? Math.max(0, options.deadlineAt - Date.now())
        : options.perCandidateTimeoutMs;
    if (options.deadlineAt && remainingMs < 250) return null;

    const timeoutMs = Math.max(250, Math.min(options.perCandidateTimeoutMs, remainingMs));

    if (shouldPrevalidateCandidate(candidate) && !cached?.ok) {
        const prevalidated = await prevalidateCandidateUrl(candidate, Math.min(1200, timeoutMs));
        if (!prevalidated) return null;
    }

    if (options.deadlineAt && Date.now() >= options.deadlineAt) return null;
    const size = await probeImage(candidate.url, timeoutMs);
    if (!size) {
        if (candidate.provider !== 'first_party_proxy') {
            rememberCandidateFailure(candidate);
        }
        return null;
    }

    rememberCandidateSuccess(candidate);

    const edge = Math.min(size.width, size.height);
    return {
        url: candidate.url,
        source: candidate.url,
        provider: candidate.provider,
        width: size.width,
        height: size.height,
        lowQuality: edge < options.minEdge,
        qualityScore: edge,
    };
}

function probeIconCandidateBatch(
    batch: IconCandidate[],
    options: {
        minEdge: number;
        skipped: Set<IconProvider>;
        perCandidateTimeoutMs: number;
        deadlineAt: number;
    }
): Promise<{ highQuality: IconProbeResult | null; lowQuality: IconProbeResult[] }> {
    return new Promise((resolve) => {
        if (!batch.length) {
            resolve({highQuality: null, lowQuality: []});
            return;
        }

        let pending = batch.length;
        let settled = false;
        const lowQuality: IconProbeResult[] = [];
        const finishOne = () => {
            pending -= 1;
            if (!settled && pending <= 0) {
                settled = true;
                resolve({highQuality: null, lowQuality});
            }
        };

        for (const candidate of batch) {
            void probeSingleIconCandidate(candidate, options)
                .then((result) => {
                    if (settled) return;
                    if (result && !result.lowQuality) {
                        settled = true;
                        resolve({highQuality: result, lowQuality});
                        return;
                    }
                    if (result) lowQuality.push(result);
                    finishOne();
                })
                .catch(() => {
                    if (!settled) finishOne();
                });
        }
    });
}

async function probeBestIconCandidateFromCandidates(
    candidates: IconCandidate[],
    options?: ProbeOptions
): Promise<IconProbeResult | null> {
    if (!candidates.length) return null;
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const skipped = new Set<IconProvider>(options?.skipProviders ? Array.from(options.skipProviders) : []);
    const perCandidateTimeoutMs = Math.max(300, Number(options?.timeoutMs ?? 2500));
    const totalTimeoutRaw = Number(options?.totalTimeoutMs ?? 0);
    const deadlineAt = Number.isFinite(totalTimeoutRaw) && totalTimeoutRaw > 0
        ? Date.now() + Math.max(300, totalTimeoutRaw)
        : 0;
    const maxCandidatesRaw = Number(options?.maxCandidates ?? candidates.length);
    const maxCandidates = Number.isFinite(maxCandidatesRaw)
        ? Math.max(1, Math.min(candidates.length, Math.round(maxCandidatesRaw)))
        : candidates.length;
    const effectiveCandidates = candidates.slice(0, maxCandidates);
    const parallelismRaw = Number(options?.parallelism ?? 1);
    const parallelism = Number.isFinite(parallelismRaw)
        ? Math.max(1, Math.min(4, Math.round(parallelismRaw)))
        : 1;
    let bestLowQuality: IconProbeResult | null = null;

    for (let i = 0; i < effectiveCandidates.length; i += parallelism) {
        if (deadlineAt && Date.now() >= deadlineAt) break;
        const batch = effectiveCandidates.slice(i, i + parallelism);
        const result = await probeIconCandidateBatch(batch, {
            minEdge,
            skipped,
            perCandidateTimeoutMs,
            deadlineAt,
        });

        if (result.highQuality) return result.highQuality;
        for (const lowQuality of result.lowQuality) {
            if (!bestLowQuality || lowQuality.qualityScore > bestLowQuality.qualityScore) {
                bestLowQuality = lowQuality;
            }
        }
    }

    return bestLowQuality;
}

export function getIconFailureStatsSnapshot(): {
    totalFailures: number;
    providerStats: Record<string, ProviderFailureStat>;
    pathMisses: Record<string, PathFailureStat>;
    updatedAt: number;
} {
    const providerStats: Record<string, ProviderFailureStat> = {};
    for (const [provider, stat] of providerFailureStats.entries()) {
        providerStats[provider] = {...stat};
    }
    const pathMisses: Record<string, PathFailureStat> = {};
    for (const [path, stat] of pathFailureStats.entries()) {
        pathMisses[path] = {...stat};
    }
    const totalFailures = Object.values(providerStats).reduce((acc, x) => acc + Number(x.count || 0), 0);
    return {
        totalFailures,
        providerStats,
        pathMisses,
        updatedAt: Date.now(),
    };
}

export const getHighResIconUrl = (url: string): string => {
    const candidates = getIconCandidates(url);
    return candidates.length > 0 ? candidates[0] : '';
};
