import { computed, watch, watchEffect } from 'vue';
import { storeToRefs } from 'pinia';
import { useConfigStore } from '../../../stores/useConfigStore.ts';
import { useSystemPrefersDark } from './systemColorScheme';

export function useTheme() {
    const store = useConfigStore();
    const { config } = storeToRefs(store);

    const { prefersDark: systemPrefersDark } = useSystemPrefersDark();

    const effectiveMode = computed<'light' | 'dark'>(() => {
        const mode = config.value.theme.mode;
        if (mode === 'system') return systemPrefersDark.value ? 'dark' : 'light';
        return mode;
    });

    // 统一应用主题 class：同时兼容 Tailwind（darkMode: 'class'）
    // 以及本项目的 CSS 变量体系（通过 html.light 覆盖浅色变量）。
    watch(
        effectiveMode,
        (mode) => {
            const root = document.documentElement;

            root.classList.toggle('dark', mode === 'dark');
            root.classList.toggle('light', mode === 'light');

            // 让表单控件/滚动条等跟随当前主题（浏览器原生渲染）
            (root.style as any).colorScheme = mode;
        },
        { immediate: true }
    );

    watchEffect(() => {
        const theme = config.value.theme;
        const root = document.documentElement;

        // 绑定壁纸
        root.style.setProperty('--bg-image', `url('${theme.wallpaper}')`);

        // 智能计算遮罩透明度：
        // 如果用户设置 opacity 为 0.5，在浅色模式下我们让它更透一点，深色模式下更实一点
        // 这样能保证不同模式下的最佳观感
        const dynamicOpacity = effectiveMode.value === 'light'
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