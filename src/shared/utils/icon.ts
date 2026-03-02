export type IconProvider =
    | 'browser_favicon'
    | 'cn_favicon'
    | 'google_s2'
    | 'yandex'
    | 'duckduckgo'
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
    minEdgePx?: number;
    skipProviders?: Iterable<IconProvider>;
    declaredTimeoutMs?: number;
};

const CANDIDATE_FAIL_RETRY_MS = 30 * 60 * 1000;
const CANDIDATE_OK_TTL_MS = 10 * 60 * 1000;
const PERSISTENT_FAIL_TTL_MS = 24 * 60 * 60 * 1000;
const PERSISTENT_FAIL_STORAGE_KEY = 'voidtab:icon_candidate_fail:v1';
const PERSISTENT_FAIL_MAX_ENTRIES = 1200;
const FAILURE_STATS_STORAGE_KEY = 'voidtab:icon_failure_stats:v1';
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
    persistentFailCache.set(url, {
        retryAfter: now + PERSISTENT_FAIL_TTL_MS,
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
    return [registrable, host];
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

function isExternalProvider(provider: IconProvider): boolean {
    return provider === 'google_s2' || provider === 'duckduckgo' || provider === 'yandex';
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

function buildExternalCandidates(domains: string[]): IconCandidate[] {
    const candidates: IconCandidate[] = [];
    for (const domain of domains) {
        candidates.push(
            {
                url: `https://api.iowen.cn/favicon/${encodeURIComponent(domain)}.png`,
                provider: 'cn_favicon',
            },
            {
                url: `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(`https://${domain}`)}`,
                provider: 'google_s2',
            },
            {
                url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
                provider: 'google_s2',
            },
            {
                url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
                provider: 'duckduckgo',
            },
        );
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
    const candidates: IconCandidate[] = [];

    candidates.push(...buildSiteOriginCandidates(origin));

    if (isExtensionContext()) {
        candidates.push(...buildExtensionCandidates(parsed.href));
    }

    pushPresetCandidate(candidates, host, rootDomain);

    if (privateOrLocal) {
        return dedupe(candidates);
    }

    // In non-extension context, third-party sources are noisy and often blocked by CORS/network policy.
    if (!isExtensionContext()) {
        return dedupe(candidates);
    }

    candidates.push(...buildExternalCandidates(thirdPartyDomains));

    return dedupe(candidates);
}

export function getFastIconCandidatesWithProviders(rawUrl: string): IconCandidate[] {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const host = normalizeHost(parsed.hostname);
    const rootDomain = getRegistrableDomain(host);
    const origin = parsed.origin;
    const candidates: IconCandidate[] = [];

    // Fast path: own origin first, then extension API, then preset.
    candidates.push(...buildSiteOriginCandidates(origin));

    if (isExtensionContext()) {
        candidates.push(...buildExtensionCandidates(parsed.href));
    }
    pushPresetCandidate(candidates, host, rootDomain);

    return dedupe(candidates);
}

export function getIconCandidates(rawUrl: string): string[] {
    return getIconCandidatesWithProviders(rawUrl).map((x) => x.url);
}

export function getFastIconCandidates(rawUrl: string): string[] {
    return getFastIconCandidatesWithProviders(rawUrl).map((x) => x.url);
}

async function probeImage(url: string, timeoutMs = 2500): Promise<{ width: number; height: number } | null> {
    return await new Promise((resolve) => {
        const img = new Image();
        let settled = false;

        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
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
        img.src = url;
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
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
    try {
        const resp = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            signal: controller.signal,
        });
        if (!resp.ok) return null;
        return await resp.text();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function shouldPrevalidateCandidate(candidate: IconCandidate): boolean {
    // Browser favicon is extension internal and preset is curated; skip extra precheck.
    if (candidate.provider === 'browser_favicon' || candidate.provider === 'preset') return false;
    return true;
}

function canPrevalidateUrl(url: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

        // In extension context cross-origin fetch is allowed by host permissions.
        if (isExtensionContext()) return true;

        // In web/dev mode only prevalidate same-origin to avoid CORS false negatives.
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
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
        try {
            return await fetch(candidate.url, {
                method,
                cache: 'no-store',
                credentials: 'omit',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
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
    const cnFallbackCandidates = baseCandidates.filter((x) => x.provider === 'cn_favicon');
    const externalCandidates = baseCandidates.filter((x) => isExternalProvider(x.provider));
    const unknownCandidates = baseCandidates.filter(
        (x) =>
            x.provider !== 'site_favicon'
            && x.provider !== 'site_manifest'
            && x.provider !== 'browser_favicon'
            && x.provider !== 'preset'
            && x.provider !== 'cn_favicon'
            && !isExternalProvider(x.provider)
    );
    const declaredCandidates = await getDeclaredIconCandidates(rawUrl, options?.declaredTimeoutMs ?? 1800);
    const candidates = dedupe([
        ...declaredCandidates,
        ...presetCandidates,
        ...browserCandidates,
        ...siteOriginCandidates,
        ...cnFallbackCandidates,
        ...externalCandidates,
        ...unknownCandidates,
    ]);
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs: options?.timeoutMs,
        minEdgePx: minEdge,
        skipProviders: options?.skipProviders,
    });
}

export async function probeFastIconCandidate(
    rawUrl: string,
    options?: ProbeOptions
): Promise<IconProbeResult | null> {
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const candidates = getFastIconCandidatesWithProviders(rawUrl);
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs: options?.timeoutMs,
        minEdgePx: minEdge,
        skipProviders: options?.skipProviders,
    });
}

async function probeBestIconCandidateFromCandidates(
    candidates: IconCandidate[],
    options?: ProbeOptions
): Promise<IconProbeResult | null> {
    if (!candidates.length) return null;
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const skipped = new Set<IconProvider>(options?.skipProviders ? Array.from(options.skipProviders) : []);

    for (const candidate of candidates) {
        if (skipped.has(candidate.provider)) continue;
        const cached = getCachedHealth(candidate.url);
        if (cached && !cached.ok) continue;

        if (shouldPrevalidateCandidate(candidate) && !cached?.ok) {
            const prevalidated = await prevalidateCandidateUrl(candidate, Math.min(1500, options?.timeoutMs ?? 2500));
            if (!prevalidated) continue;
        }

        const size = await probeImage(candidate.url, options?.timeoutMs ?? 2500);
        if (!size) {
            rememberCandidateFailure(candidate);
            continue;
        }

        rememberCandidateSuccess(candidate);

        const edge = Math.min(size.width, size.height);
        const lowQuality = edge < minEdge;
        const result: IconProbeResult = {
            url: candidate.url,
            source: candidate.url,
            provider: candidate.provider,
            width: size.width,
            height: size.height,
            lowQuality,
            qualityScore: edge,
        };

        if (!lowQuality) return result;
    }

    return null;
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
