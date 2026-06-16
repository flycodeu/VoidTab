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

void configReady;
