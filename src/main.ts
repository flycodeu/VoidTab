import {createApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';
import './style.css';

import {useConfigStore} from './stores/useConfigStore';
import {applyThemeToDom} from './shared/composables/theme/applyThemeToDom';
import {initPerformanceMonitor, markPerformance, recordPerformance} from './shared/utils/performance';

const bootStartedAt = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
const elapsedBootMs = () => {
    const now = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
    return now - bootStartedAt;
};

// ResizeObserver polyfill（仅在不支持的浏览器中加载）
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    import('resize-observer-polyfill').then((module) => {
        (window as any).ResizeObserver = module.default;
    });
}

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

initPerformanceMonitor({maxEntries: 160, exposeGlobal: true});
markPerformance('app.boot.start');

const store = useConfigStore();
const configReady = store.loadConfig()
    .then(() => {
        applyThemeToDom(store.config.theme);
        recordPerformance('app.boot.configReady', elapsedBootMs(), store.isLoaded ? 'loaded' : 'pending');
    })
    .catch((error) => {
        const message = error instanceof Error ? error.message : 'config load failed';
        recordPerformance('app.boot.configReady', elapsedBootMs(), 'error', false, message);
    });

applyThemeToDom(store.config.theme);
app.mount('#app');
recordPerformance('app.boot.mount', elapsedBootMs(), store.isLoaded ? 'config-ready' : 'shell-first');

requestAnimationFrame(() => {
    document.getElementById('app')?.classList.add('loaded');
    recordPerformance('app.boot.firstFrame', elapsedBootMs(), store.isLoaded ? 'config-ready' : 'config-pending');
});

/**
 * Load web fonts AFTER first paint, never blocking boot. The previous
 * render-blocking `@import` in style.css could stall the new tab for a long time
 * when fonts.googleapis.com is slow or unreachable (notably mainland China with a
 * cold cache). System fallback fonts render immediately; the web font swaps in
 * only if the request succeeds, and a failure never affects load time.
 */
function loadWebFontsDeferred() {
    if (typeof document === 'undefined') return;
    const inject = () => {
        if (document.querySelector('link[data-voidtab-fonts]')) return;
        const preconnect = document.createElement('link');
        preconnect.rel = 'preconnect';
        preconnect.href = 'https://fonts.gstatic.com';
        preconnect.crossOrigin = 'anonymous';
        document.head.appendChild(preconnect);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap';
        link.setAttribute('data-voidtab-fonts', '');
        document.head.appendChild(link);
    };
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: {timeout: number}) => number);
    if (typeof ric === 'function') ric(inject, {timeout: 3000});
    else globalThis.setTimeout(inject, 1200);
}
loadWebFontsDeferred();

void configReady;
