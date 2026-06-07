import {onMounted, onUnmounted, watch} from 'vue';
import {useDocumentVisibility} from '@vueuse/core';

export function useVisibilityInterval(
    callback: () => void,
    intervalMs: number,
    options: { immediate?: boolean } = {}
) {
    const visibility = useDocumentVisibility();
    let timer: number | null = null;

    const stop = () => {
        if (timer == null) return;
        window.clearInterval(timer);
        timer = null;
    };

    const start = () => {
        if (timer != null) return;
        if (options.immediate) callback();
        timer = window.setInterval(callback, intervalMs);
    };

    const sync = () => {
        if (visibility.value === 'hidden') stop();
        else start();
    };

    onMounted(sync);
    onUnmounted(stop);
    watch(visibility, sync);

    return {start, stop};
}
