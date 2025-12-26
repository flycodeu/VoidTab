import {createApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';
import './style.css';

// 1. 初始化主题逻辑
(function initTheme() {
    try {
        const storageKey = 'voidtab-config';
        const saved = localStorage.getItem(storageKey);

        let userMode = 'system';

        if (saved) {
            const config = JSON.parse(saved);
            const theme = config.theme || (config.config && config.config.theme);
            if (theme && theme.mode) {
                userMode = theme.mode;
            }
        }

        const html = document.documentElement;

        // 只有当用户明确指定了模式，才添加 force 类
        if (userMode === 'light') {
            html.classList.add('light');
            html.classList.add('force-light');
        } else if (userMode === 'dark') {
            html.classList.remove('light');
            html.classList.add('force-dark');
        }

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