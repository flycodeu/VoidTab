import { watch } from 'vue';
import {applyThemeToDom} from "./applyThemeToDom.ts";

type ThemeLike = {
    techFontFamily: string;
    neonGlow: boolean;
    breathingLight: boolean;
    breathingDuration: number;
};

type StoreLike = {
    config: { theme: ThemeLike };
};


function applyTechFont(theme: ThemeLike) {
    const html = document.documentElement;
    const fam = theme.techFontFamily || 'default';

    if (fam === 'default') {
        html.classList.remove('theme-tech-font');
        html.style.removeProperty('--tech-font-family');
        return;
    }

    html.classList.add('theme-tech-font');
    html.style.setProperty(
        '--tech-font-family',
        `'${fam}', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`
    );
}

function applyBreathing(theme: ThemeLike) {
    const html = document.documentElement;
    html.classList.toggle('theme-breathing', !!theme.breathingLight);

    const d = Number(theme.breathingDuration || 3);
    const duration = Math.min(10, Math.max(1, d));
    html.style.setProperty('--sidebar-breath-duration', `${duration}s`);
}

function applyNeon(theme: ThemeLike) {
    document.documentElement.classList.toggle('theme-neon', !!theme.neonGlow);
}

export function useThemeRuntimeSync(store: StoreLike) {
    watch(
        () => store.config.theme,
        (theme) => {
            applyThemeToDom(theme);
            applyTechFont(theme);
            applyBreathing(theme);
            applyNeon(theme);
        },
        { immediate: true, deep: true }
    );
}
