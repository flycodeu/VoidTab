// src/composables/icon/useDebouncedFavicon.ts
import {ref, watch, onUnmounted, type Ref} from 'vue';
import {getFastIconCandidates, getIconCandidates, getEffectiveMinEdgePx, ICON_MIN_EDGE_PX} from '../../utils/icon.ts';

export function useDebouncedFavicon(urlRef: Ref<string>, delay = 500) {
    const faviconUrl = ref('');
    const isFetching = ref(false);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let currentImg: HTMLImageElement | null = null; // 用于取消上一次的加载请求

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    /**
     * 核心逻辑：尝试加载图片列表中的 URL
     * 只要有一个成功，就使用它；全部失败则置空。
     */
    const tryLoadIcons = (candidates: string[]) => {
        if (candidates.length === 0) {
            faviconUrl.value = '';
            isFetching.value = false;
            return;
        }

        // 取出第一个候选地址
        const attemptUrl = candidates[0];
        const remaining = candidates.slice(1);

        // 创建一个隐形的图片对象来探测是否能加载
        const img = new Image();
        currentImg = img;
        img.referrerPolicy = 'no-referrer';

        img.onload = () => {
            // 只有当这个 img 还是"当前正在请求"的 img 时才赋值
            // 防止快速输入时，旧的请求结果覆盖了新的
            if (currentImg === img) {
                const w = Number(img.naturalWidth || 0);
                const h = Number(img.naturalHeight || 0);
                const minEdge = getEffectiveMinEdgePx(ICON_MIN_EDGE_PX);
                const lowQuality = Math.min(w, h) > 0 && Math.min(w, h) < minEdge;
                if (lowQuality && remaining.length > 0) {
                    tryLoadIcons(remaining);
                    return;
                }
                faviconUrl.value = attemptUrl;
                isFetching.value = false;
            }
        };

        img.onerror = () => {
            if (currentImg === img) {
                // 如果失败了，且还有备选方案，递归尝试下一个
                if (remaining.length > 0) {
                    tryLoadIcons(remaining);
                } else {
                    // 彻底放弃，显示默认图标
                    faviconUrl.value = '';
                    isFetching.value = false;
                }
            }
        };

        // 开始加载
        img.src = attemptUrl;
    };

    const run = (url: string) => {
        isFetching.value = true;
        faviconUrl.value = ''; // 开始加载时先清空，或者保留旧的看你喜好

        // 获取候选列表 (例如: [DDG地址, Google地址, /favicon.ico])
        const fastCandidates = getFastIconCandidates(url);
        const fullCandidates = getIconCandidates(url);
        const candidates = [...fastCandidates, ...fullCandidates.filter((x) => !fastCandidates.includes(x))];

        tryLoadIcons(candidates);
    };

    const refresh = (immediate = false) => {
        clearTimer();
        const url = urlRef.value;

        if (!url) {
            faviconUrl.value = '';
            isFetching.value = false;
            return;
        }

        if (immediate) {
            run(url);
        } else {
            timer = setTimeout(() => run(url), delay);
        }
    };

    watch(urlRef, () => refresh(false)); // 去掉 immediate: true，由组件控制初始化

    onUnmounted(() => {
        clearTimer();
        currentImg = null;
    });

    return {faviconUrl, isFetching, refresh};
}
