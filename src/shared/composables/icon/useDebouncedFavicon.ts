// src/composables/icon/useDebouncedFavicon.ts
import {ref, watch, onUnmounted, type Ref} from 'vue';
import type {RuntimeConfig} from '../../../core/config/types';
import {getFastIconCandidates, getIconCandidates, getEffectiveMinEdgePx, ICON_MIN_EDGE_PX} from '../../utils/icon.ts';
import {resolveAndCacheSiteIcon, type SiteIconResult} from '../../utils/siteIconCache';
import {warmBrowserIconCache} from '../../utils/iconPreloader';

type MaybeRuntimeRef = RuntimeConfig | Ref<RuntimeConfig | undefined> | undefined;

type DebouncedFaviconOptions = {
    runtime?: MaybeRuntimeRef;
    timeoutMs?: number;
    minEdgePx?: number;
};

const candidateProbeInflight = new Map<string, Promise<{url: string; width: number; height: number} | null>>();

function unwrapRuntime(runtime: MaybeRuntimeRef): RuntimeConfig | undefined {
    if (!runtime) return undefined;
    if (typeof runtime === 'object' && 'value' in runtime) {
        return runtime.value;
    }
    return runtime;
}

function probeCandidateIcon(url: string, timeoutMs: number): Promise<{url: string; width: number; height: number} | null> {
    const existing = candidateProbeInflight.get(url);
    if (existing) return existing;

    const promise = new Promise<{url: string; width: number; height: number} | null>((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (value: {url: string; width: number; height: number} | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), Math.max(300, timeoutMs));

        img.onload = () => {
            finish({
                url,
                width: Number(img.naturalWidth || 0),
                height: Number(img.naturalHeight || 0),
            });
        };
        img.onerror = () => finish(null);
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = url;
    });

    candidateProbeInflight.set(url, promise);
    void promise.finally(() => candidateProbeInflight.delete(url));
    return promise;
}

function releaseResultObjectUrl(result: SiteIconResult | null | undefined): void {
    if (result?.objectUrl && result.url.startsWith('blob:')) {
        URL.revokeObjectURL(result.url);
    }
}

export function useDebouncedFavicon(
    urlRef: Ref<string>,
    delay = 500,
    options?: DebouncedFaviconOptions
) {
    const faviconUrl = ref('');
    const isFetching = ref(false);
    const currentIsObjectUrl = ref(false);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let runToken = 0;

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const releaseCurrentObjectUrl = () => {
        if (currentIsObjectUrl.value && faviconUrl.value.startsWith('blob:')) {
            URL.revokeObjectURL(faviconUrl.value);
        }
        currentIsObjectUrl.value = false;
    };

    const setFaviconUrl = (url: string, objectUrl = false) => {
        releaseCurrentObjectUrl();
        faviconUrl.value = url;
        currentIsObjectUrl.value = objectUrl;
    };

    const loadFromRuntimeCache = async (url: string, token: number): Promise<boolean> => {
        const runtime = unwrapRuntime(options?.runtime);
        if (!runtime) return false;

        const result = await resolveAndCacheSiteIcon(url, runtime, {
            fastFirst: true,
            fastTimeoutMs: Math.min(900, Number(options?.timeoutMs ?? 1200)),
            timeoutMs: options?.timeoutMs,
            minEdgePx: options?.minEdgePx,
        });

        if (token !== runToken) {
            releaseResultObjectUrl(result);
            return true;
        }

        if (!result?.url) {
            setFaviconUrl('', false);
            return true;
        }

        setFaviconUrl(result.url, !!result.objectUrl);
        return true;
    };

    const loadFromBrowserCandidates = async (url: string, token: number) => {
        const fastCandidates = getFastIconCandidates(url);
        const fullCandidates = getIconCandidates(url);
        const candidates = [...fastCandidates, ...fullCandidates.filter((x) => !fastCandidates.includes(x))];
        const minEdge = getEffectiveMinEdgePx(options?.minEdgePx ?? ICON_MIN_EDGE_PX);
        const timeoutMs = Math.max(300, Number(options?.timeoutMs ?? 1600));

        void warmBrowserIconCache(url, {fastFirst: true, limit: 4, timeoutMs: Math.min(1200, timeoutMs)});

        for (const candidate of candidates) {
            if (token !== runToken) return;

            const loaded = await probeCandidateIcon(candidate, timeoutMs);
            if (token !== runToken) return;
            if (!loaded) continue;

            const edge = Math.min(loaded.width, loaded.height);
            const lowQuality = edge > 0 && edge < minEdge;
            if (lowQuality && candidate !== candidates[candidates.length - 1]) continue;

            setFaviconUrl(loaded.url, false);
            return;
        }

        setFaviconUrl('', false);
    };

    const run = async (url: string, token: number) => {
        isFetching.value = true;
        setFaviconUrl('', false);

        try {
            void warmBrowserIconCache(url, {fastFirst: true, limit: 3});
            const handledByRuntime = await loadFromRuntimeCache(url, token);
            if (!handledByRuntime) {
                await loadFromBrowserCandidates(url, token);
            }
        } finally {
            if (token === runToken) {
                isFetching.value = false;
            }
        }
    };

    const refresh = (immediate = false) => {
        clearTimer();
        const url = urlRef.value;
        const token = ++runToken;

        if (!url) {
            setFaviconUrl('', false);
            isFetching.value = false;
            return;
        }

        if (immediate) {
            void run(url, token);
        } else {
            timer = setTimeout(() => void run(url, token), delay);
        }
    };

    watch(urlRef, () => refresh(false)); // 去掉 immediate: true，由组件控制初始化

    onUnmounted(() => {
        runToken += 1;
        clearTimer();
        releaseCurrentObjectUrl();
    });

    return {faviconUrl, isFetching, refresh};
}
