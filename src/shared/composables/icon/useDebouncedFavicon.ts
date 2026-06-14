// src/composables/icon/useDebouncedFavicon.ts
import {ref, watch, onUnmounted, type Ref} from 'vue';
import type {RuntimeConfig} from '../../../core/config/types';
import {getInstantAutoIconUrl} from '../../utils/icon.ts';
import {resolveAndCacheSiteIcon, type SiteIconResult} from '../../utils/siteIconCache';
import {warmBrowserIconCache} from '../../utils/iconPreloader';

type MaybeRuntimeRef = RuntimeConfig | Ref<RuntimeConfig | undefined> | undefined;

type DebouncedFaviconOptions = {
    runtime?: MaybeRuntimeRef;
    timeoutMs?: number;
    minEdgePx?: number;
};

function unwrapRuntime(runtime: MaybeRuntimeRef): RuntimeConfig | undefined {
    if (!runtime) return undefined;
    if (typeof runtime === 'object' && 'value' in runtime) {
        return runtime.value;
    }
    return runtime;
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
            resolveTimeoutMs: Math.max(900, Math.min(1800, Number(options?.timeoutMs ?? 1600))),
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

    const loadFromSafeInstantCandidate = async (url: string, token: number) => {
        if (token !== runToken) return;
        setFaviconUrl(getInstantAutoIconUrl(url, '', ''), false);
    };

    const run = async (url: string, token: number) => {
        isFetching.value = true;
        setFaviconUrl('', false);

        try {
            void warmBrowserIconCache(url, {fastFirst: true, limit: 3});
            const handledByRuntime = await loadFromRuntimeCache(url, token);
            if (!handledByRuntime) {
                await loadFromSafeInstantCandidate(url, token);
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
