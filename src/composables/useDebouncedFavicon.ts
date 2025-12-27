import {ref, watch, onUnmounted, type Ref} from 'vue';
import {getHighResIconUrl} from '../utils/icon';

export function useDebouncedFavicon(urlRef: Ref<string>, delay = 500) {
    const faviconUrl = ref('');
    const isFetching = ref(false);

    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const run = (url: string) => {
        isFetching.value = true;
        try {
            faviconUrl.value = url ? getHighResIconUrl(url) : '';
        } catch {
            faviconUrl.value = '';
        } finally {
            // 给 spinner 一个最小展示时间，避免闪烁
            setTimeout(() => (isFetching.value = false), 200);
        }
    };

    const refresh = (immediate = false) => {
        clearTimer();
        const url = urlRef.value;
        if (!url) {
            faviconUrl.value = '';
            return;
        }
        if (immediate) run(url);
        else timer = setTimeout(() => run(url), delay);
    };

    watch(urlRef, () => refresh(false), {immediate: true});

    onUnmounted(() => clearTimer());

    return {faviconUrl, isFetching, refresh, clearTimer};
}
