import { ref } from 'vue';

/**
 * 系统主题偏好（prefers-color-scheme）监听器。
 *
 * 用途：
 * - 在主题模式为 system 时，实时跟随系统深浅色切换。
 * - 使用单例模式，避免重复注册监听导致多次触发。
 */

const QUERY = '(prefers-color-scheme: dark)';

const prefersDark = ref(false);
const isSupported = ref(false);

let initialized = false;
let cleanup: (() => void) | null = null;

function initOnce() {
    if (initialized) return;
    initialized = true;

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        prefersDark.value = false;
        isSupported.value = false;
        cleanup = () => {};
        return;
    }

    const mql = window.matchMedia(QUERY);
    if (!mql) {
        prefersDark.value = false;
        isSupported.value = false;
        cleanup = () => {};
        return;
    }

    isSupported.value = true;
    prefersDark.value = !!mql.matches;

    const handler = (e: MediaQueryListEvent) => {
        prefersDark.value = !!e.matches;
    };

    // 监听系统主题变化
    mql.addEventListener('change', handler);
    cleanup = () => mql.removeEventListener('change', handler);
}

export function useSystemPrefersDark() {
    initOnce();
    return { prefersDark, isSupported, stop: () => cleanup?.() };
}
