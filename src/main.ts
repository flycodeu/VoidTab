import {createApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';
import './style.css';

// 1. 初始化主题逻辑
(function initTheme() {
    try {
        // 尽力做一次“同步”的主题预热，减少首屏闪烁（FOUC）。
        // WebStorageAdapter 下，配置存储键为：voidtab:local:voidtab-core-config
        // （Chrome 扩展存储为异步，这里无法同步读取，所以先回退到系统主题偏好，待应用加载后再纠正。）
        const saved =
            localStorage.getItem('voidtab:local:voidtab-core-config')
            ?? localStorage.getItem('voidtab-config'); // legacy

        let userMode: 'light' | 'dark' | 'system' = 'system';

        if (saved) {
            const config = JSON.parse(saved);
            const theme = config.theme || (config.config && config.config.theme);
            if (theme && theme.mode) {
                userMode = theme.mode;
            }
        }

        const html = document.documentElement;

        const prefersDark = (() => {
            try {
                return typeof window.matchMedia === 'function'
                    ? window.matchMedia('(prefers-color-scheme: dark)').matches
                    : false;
            } catch {
                return false;
            }
        })();

        const effectiveMode: 'light' | 'dark' =
            userMode === 'system' ? (prefersDark ? 'dark' : 'light') : userMode;

        // Tailwind（darkMode: 'class'） + CSS 变量（html.light 覆盖浅色变量）
        html.classList.toggle('dark', effectiveMode === 'dark');
        html.classList.toggle('light', effectiveMode === 'light');
        (html.style as any).colorScheme = effectiveMode;

    } catch (e) {
        console.error('Theme init failed', e);
    }
})();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');

// 2. 显示内容区域
requestAnimationFrame(() => {
    const appDiv = document.getElementById('app');
    if (appDiv) appDiv.classList.add('loaded');
});