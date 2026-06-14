import {onUnmounted, ref, watch, type Ref} from 'vue';
import type {RuntimeConfig} from '../../../core/config/types';
import {getInstantAutoIconUrl} from '../../utils/icon.ts';
import {markSiteIconMiss, resolveAndCacheSiteIcon, type SiteIconResult} from '../../utils/siteIconCache';
import {warmBrowserIconCache} from '../../utils/iconPreloader';

type MaybeRuntimeRef = RuntimeConfig | Ref<RuntimeConfig | undefined> | undefined;

function unwrapRuntime(runtime: MaybeRuntimeRef): RuntimeConfig | undefined {
    if (!runtime) return undefined;
    if (typeof runtime === 'object' && 'value' in runtime) {
        return runtime.value;
    }
    return runtime;
}

/**
 * 只处理 auto favicon 的加载/超时/降级。
 * 传入 runtime 时走 siteIconCache 的内存/持久化/浏览器三级缓存；未传时保持旧的 URL 候选行为。
 */
export function useAutoIcon(options: {
    url: Ref<string>;
    isAuto: Ref<boolean>;
    timeoutMs?: number;
    runtime?: MaybeRuntimeRef;
    onFallback: () => void;
}) {
    const autoIconUrl = ref('');
    const isLoaded = ref(false);
    const isObjectUrl = ref(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolveToken = 0;

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const revokeObjectUrl = () => {
        if (isObjectUrl.value && autoIconUrl.value.startsWith('blob:')) {
            URL.revokeObjectURL(autoIconUrl.value);
        }
        isObjectUrl.value = false;
    };

    const startTimeout = () => {
        clearTimer();
        if (!options.isAuto.value || !autoIconUrl.value) return;

        timer = setTimeout(() => {
            if (!isLoaded.value) triggerFallback();
        }, options.timeoutMs ?? 2500);
    };

    const setAutoIconUrl = (url: string, objectUrl: boolean) => {
        revokeObjectUrl();
        autoIconUrl.value = url;
        isObjectUrl.value = objectUrl;
        startTimeout();
    };

    const releaseUnusedResult = (result: SiteIconResult | null | undefined) => {
        if (result?.objectUrl && result.url.startsWith('blob:')) {
            URL.revokeObjectURL(result.url);
        }
    };

    const resolveAutoIcon = async () => {
        clearTimer();
        isLoaded.value = false;

        if (!options.isAuto.value) {
            setAutoIconUrl('', false);
            return;
        }

        const url = options.url.value;
        if (!url) {
            setAutoIconUrl('', false);
            return;
        }

        const token = ++resolveToken;
        void warmBrowserIconCache(url, {fastFirst: true, limit: 3});

        const runtime = unwrapRuntime(options.runtime);
        if (!runtime) {
            if (token !== resolveToken) return;
            setAutoIconUrl(getInstantAutoIconUrl(url, '', ''), false);
            return;
        }

        const result = await resolveAndCacheSiteIcon(url, runtime, {
            fastFirst: true,
            fastTimeoutMs: 700,
            timeoutMs: options.timeoutMs,
            resolveTimeoutMs: Math.max(900, Math.min(1800, Number(options.timeoutMs ?? 1800))),
        });

        if (token !== resolveToken) {
            releaseUnusedResult(result);
            return;
        }

        if (!result?.url) {
            setAutoIconUrl('', false);
            triggerFallback();
            return;
        }

        setAutoIconUrl(result.url, !!result.objectUrl);
    };

    const triggerFallback = () => {
        if (!options.isAuto.value) return;
        const runtime = unwrapRuntime(options.runtime);
        if (runtime && options.url.value) {
            markSiteIconMiss(options.url.value, runtime, {error: 'img_error', preserveExisting: true});
        }
        options.onFallback();
    };

    const handleImgLoad = () => {
        isLoaded.value = true;
        clearTimer();
    };

    watch([options.url, options.isAuto], () => {
        void resolveAutoIcon();
    }, {immediate: true});

    onUnmounted(() => {
        resolveToken += 1;
        clearTimer();
        revokeObjectUrl();
    });

    return {
        autoIconUrl,
        isLoaded,
        handleImgLoad,
        triggerFallback,
    };
}
