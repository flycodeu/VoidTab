import { watchEffect } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '../stores/useConfigStore';

export function useTheme() {
    const store = useConfigStore();
    const { config } = storeToRefs(store);

    watchEffect(() => {
        const theme = config.value.theme;
        const root = document.documentElement;

        // 绑定壁纸
        root.style.setProperty('--bg-image', `url('${theme.wallpaper}')`);

        // 智能计算遮罩透明度：
        // 如果用户设置 opacity 为 0.5，在浅色模式下我们让它更透一点，深色模式下更实一点
        // 这样能保证不同模式下的最佳观感
        const dynamicOpacity = theme.mode === 'light'
            ? theme.opacity * 0.8  // 浅色模式稍微透一点
            : theme.opacity;       // 深色模式保持原样

        root.style.setProperty('--bg-overlay-opacity', `${dynamicOpacity}`);

        // 绑定其他视觉变量
        root.style.setProperty('--glass-backdrop-blur', `${theme.blur}px`);
        root.style.setProperty('--icon-size', `${theme.iconSize}px`);
        root.style.setProperty('--glass-radius', `${theme.radius}px`);
        root.style.setProperty('--grid-gap', `${theme.gap}px`);

        // 文字阴影控制
        document.body.style.textShadow = 'var(--text-shadow)';
    });
}