export type IconProvider =
    | 'browser_favicon'
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
};

export const ICON_MIN_EDGE_PX = 48;
export const RETINA_ICON_MIN_EDGE_PX = 64;

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
            url: `${origin}/favicon-32x32.png`,
            provider: 'site_manifest',
        },
        {
            url: `${origin}/apple-touch-icon.png`,
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
    return [
        {
            url: `chrome://favicon2/?size=128&pageUrl=${encoded}`,
            provider: 'browser_favicon',
        },
        {
            url: `/_favicon/?pageUrl=${encoded}&size=64`,
            provider: 'browser_favicon',
        },
    ];
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

    if (isExtensionContext()) {
        candidates.push(...buildExtensionCandidates(parsed.href));
    }

    pushPresetCandidate(candidates, host, rootDomain);
    candidates.push(...buildSiteOriginCandidates(origin));

    if (privateOrLocal) {
        return dedupe(candidates);
    }

    for (const domain of thirdPartyDomains) {
        candidates.push(
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

    return dedupe(candidates);
}

export function getFastIconCandidatesWithProviders(rawUrl: string): IconCandidate[] {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const host = normalizeHost(parsed.hostname);
    const rootDomain = getRegistrableDomain(host);
    const origin = parsed.origin;
    const candidates: IconCandidate[] = [];

    // Fast path: own origin first, then preset, then extension API.
    candidates.push(...buildSiteOriginCandidates(origin));
    pushPresetCandidate(candidates, host, rootDomain);

    if (isExtensionContext()) {
        candidates.push(...buildExtensionCandidates(parsed.href));
    }

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

export async function probeBestIconCandidate(
    rawUrl: string,
    options?: { timeoutMs?: number; minEdgePx?: number }
): Promise<IconProbeResult | null> {
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const candidates = getIconCandidatesWithProviders(rawUrl);
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs: options?.timeoutMs,
        minEdgePx: minEdge,
    });
}

export async function probeFastIconCandidate(
    rawUrl: string,
    options?: { timeoutMs?: number; minEdgePx?: number }
): Promise<IconProbeResult | null> {
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
    const candidates = getFastIconCandidatesWithProviders(rawUrl);
    return probeBestIconCandidateFromCandidates(candidates, {
        timeoutMs: options?.timeoutMs,
        minEdgePx: minEdge,
    });
}

async function probeBestIconCandidateFromCandidates(
    candidates: IconCandidate[],
    options?: { timeoutMs?: number; minEdgePx?: number }
): Promise<IconProbeResult | null> {
    if (!candidates.length) return null;
    const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);

    let firstLoaded: IconProbeResult | null = null;
    for (const candidate of candidates) {
        const size = await probeImage(candidate.url, options?.timeoutMs ?? 2500);
        if (!size) continue;

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

        if (!firstLoaded) firstLoaded = result;
        if (!lowQuality) return result;
    }

    return firstLoaded;
}

export const getHighResIconUrl = (url: string): string => {
    const candidates = getIconCandidates(url);
    return candidates.length > 0 ? candidates[0] : '';
};
