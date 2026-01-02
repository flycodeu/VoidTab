import {computed, onUnmounted, ref, watch, type Ref} from 'vue';
import {getHighResIconUrl} from '../../utils/icon.ts';

/**
 * 只处理 auto favicon 的加载/超时/降级
 * - 组件只要传入 item.url 和 isAuto
 * - fallback 由外部注入（通常 store.setIconFallback）
 */
export function useAutoIcon(options: {
    url: Ref<string>;
    isAuto: Ref<boolean>;
    timeoutMs?: number;
    onFallback: () => void;
}) {
    const isLoaded = ref(false);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const autoIconUrl = computed(() => {
        if (!options.isAuto.value) return '';
        const url = options.url.value;
        if (!url) return '';
        return getHighResIconUrl(url);
    });

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const triggerFallback = () => {
        if (!options.isAuto.value) return;
        options.onFallback();
    };

    const handleImgLoad = () => {
        isLoaded.value = true;
        clearTimer();
    };

    const startTimeout = () => {
        clearTimer();
        isLoaded.value = false;

        if (!options.isAuto.value) return;
        if (!autoIconUrl.value) return;

        timer = setTimeout(() => {
            if (!isLoaded.value) triggerFallback();
        }, options.timeoutMs ?? 2500);
    };

    // url 或模式变化 => 重启计时
    watch([options.url, options.isAuto], startTimeout, {immediate: true});

    onUnmounted(clearTimer);

    return {
        autoIconUrl,
        isLoaded,
        handleImgLoad,
        triggerFallback,
    };
}
