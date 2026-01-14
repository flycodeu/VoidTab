import { watch } from 'vue';

type ThemeLike = {
    techFontFamily: string;
    neonGlow: boolean;
    breathingLight: boolean;
    breathingDuration: number;

    customCursor: boolean;
    cursorPreset: string;
    cursorUrl: string;
    cursorHotspotX: number;
    cursorHotspotY: number;
};

type StoreLike = {
    config: { theme: ThemeLike };
};

function getAccentColor(): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    return v || '#0A84FF';
}

function svgToCursor(svg: string, hotX: number, hotY: number): string {
    const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
    return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, auto`;
}

function buildPresetCursor(preset: string, hotX: number, hotY: number): string {
    const accent = getAccentColor();

    // 统一用 32x32，热点默认 (4,4) 或你传入的
    if (preset === 'dot') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <circle cx="8" cy="8" r="4" fill="${accent}" />
      <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
    </svg>`;
        return svgToCursor(svg, hotX, hotY);
    }

    if (preset === 'ring') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <circle cx="8" cy="8" r="6" fill="none" stroke="${accent}" stroke-width="2"/>
      <circle cx="8" cy="8" r="7" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>
    </svg>`;
        return svgToCursor(svg, hotX, hotY);
    }

    if (preset === 'cross') {
        // crosshair 用关键字即可（更稳）
        return 'crosshair';
    }

    return 'auto';
}

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

function applyCursor(theme: ThemeLike) {
    const html = document.documentElement;

    // 关闭自定义光标
    if (!theme.customCursor || theme.cursorPreset === 'system') {
        html.style.setProperty('--app-cursor', 'auto');
        html.style.setProperty('--app-cursor-pointer', 'pointer');
        return;
    }

    const hotX = Number.isFinite(theme.cursorHotspotX) ? theme.cursorHotspotX : 4;
    const hotY = Number.isFinite(theme.cursorHotspotY) ? theme.cursorHotspotY : 4;

    if (theme.cursorPreset === 'custom') {
        if (!theme.cursorUrl) {
            html.style.setProperty('--app-cursor', 'auto');
            html.style.setProperty('--app-cursor-pointer', 'pointer');
            return;
        }
        const cur = `url("${theme.cursorUrl}") ${hotX} ${hotY}, auto`;
        html.style.setProperty('--app-cursor', cur);
        html.style.setProperty('--app-cursor-pointer', cur);
        return;
    }

    const cur = buildPresetCursor(theme.cursorPreset, hotX, hotY);
    html.style.setProperty('--app-cursor', cur);
    html.style.setProperty('--app-cursor-pointer', cur);
}

export function useThemeRuntimeSync(store: StoreLike) {
    watch(
        () => store.config.theme,
        (theme) => {
            applyTechFont(theme);
            applyBreathing(theme);
            applyNeon(theme);
            applyCursor(theme);
        },
        { immediate: true, deep: true }
    );
}
