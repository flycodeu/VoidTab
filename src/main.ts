import {createApp} from 'vue';
import {createPinia} from 'pinia';
import App from './App.vue';
import './style.css';

import {useConfigStore} from './stores/useConfigStore';
import {applyThemeToDom} from './shared/composables/theme/applyThemeToDom';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

(async () => {
    const store = useConfigStore();

    //  先加载配置
    await store.loadConfig();

    //  再把主题应用到 DOM（class + css vars）
    applyThemeToDom(store.config.theme);

    //  最后 mount（避免闪默认主题）
    app.mount('#app');

    //  loaded class
    requestAnimationFrame(() => {
        document.getElementById('app')?.classList.add('loaded');
    });
})();
