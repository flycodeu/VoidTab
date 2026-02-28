const PRESET_ICONS: Record<string, string> = {
    'github.com': 'https://github.githubassets.com/favicons/favicon.png',
    'bilibili.com': 'https://www.bilibili.com/favicon.ico',
    'youtube.com': 'https://www.youtube.com/s/desktop/10c3080e/img/favicon_144x144.png',
    'taobao.com': 'https://img.alicdn.com/tfs/TB1_uT8a5ZX8KJjSgoSXXa.sXXa-128-128.png',
    'zhihu.com': 'https://static.zhihu.com/heifetz/assets/apple-touch-icon-152.a53ae37b.png',
    'csdn.net': 'https://g.csdnimg.cn/static/logo/favicon32.ico',
};

export const ICON_MIN_EDGE_PX = 24;

export type IconProbeResult = {
    url: string;
    source: string;
    width: number;
    height: number;
    lowQuality: boolean;
};

function safeParseUrl(rawUrl: string): URL | null {
    if (!rawUrl) return null;
    try {
        return new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    } catch {
        return null;
    }
}

function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}

export function extractSiteDomain(rawUrl: string): string {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return '';
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
}

export function getIconCandidates(rawUrl: string): string[] {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed) return [];

    const host = parsed.hostname.toLowerCase();
    const rootDomain = host.replace(/^www\./i, '');
    const origin = parsed.origin;

    if (PRESET_ICONS[host]) return [PRESET_ICONS[host]];
    if (PRESET_ICONS[rootDomain]) return [PRESET_ICONS[rootDomain]];

    return dedupe([
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rootDomain)}&sz=256`,
        `https://favicon.yandex.net/favicon/${encodeURIComponent(rootDomain)}?size=256`,
        `https://icons.duckduckgo.com/ip3/${encodeURIComponent(rootDomain)}.ico`,
        `${origin}/apple-touch-icon.png`,
        `${origin}/favicon-32x32.png`,
        `${origin}/favicon.ico`,
    ]);
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
    const minEdge = options?.minEdgePx ?? ICON_MIN_EDGE_PX;
    const candidates = getIconCandidates(rawUrl);
    if (!candidates.length) return null;

    let firstLoaded: IconProbeResult | null = null;
    for (const candidate of candidates) {
        const size = await probeImage(candidate, options?.timeoutMs ?? 2500);
        if (!size) continue;

        const lowQuality = Math.min(size.width, size.height) < minEdge;
        const result: IconProbeResult = {
            url: candidate,
            source: candidate,
            width: size.width,
            height: size.height,
            lowQuality,
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

