import {watch} from 'vue';
import {applyThemeToDom} from './applyThemeToDom.ts';

type ReadabilityMode = 'auto' | 'darken' | 'lighten';

type ReadabilityLike = {
    enabled: boolean;
    mode: ReadabilityMode;
    strength: number;      // 0~100
    blur: number;          // 0~12
    desaturate: number;    // 0~100
    tint?: string;         // optional: '#000000' | '#ffffff' | 'rgba(...)'
};

type ThemeLike = {
    mode: 'light' | 'dark' | 'system';

    techFontFamily: string;
    neonGlow: boolean;
    breathingLight: boolean;
    breathingDuration: number;

    //  新增：readability
    readability?: ReadabilityLike;
};

type StoreLike = {
    config: { theme: ThemeLike };
};

function clamp(n: any, min: number, max: number, fallback: number) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

/**
 * strength(0~100) -> opacity(0~0.35)
 * 用平方曲线让低强度更细腻，高强度可控
 */
function strengthToOpacity(strength01: number) {
    const x = Math.max(0, Math.min(1, strength01));
    return (x * x) * 0.35;
}

function resolveThemeMode(mode: ThemeLike['mode']) {
    if (mode === 'light' || mode === 'dark') return mode;
    // system：读系统偏好（若不可用默认 dark）
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
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
        `'${fam}', 'Fira Sans', 'Noto Sans SC', system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`
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

/**
 *  新增：Readability Layer 运行时同步
 * 输出变量供遮罩层使用：
 *  - --readability-enabled: 0/1
 *  - --readability-opacity: 0~1
 *  - --readability-color: '0,0,0' 或 '255,255,255'（给 rgba 拼接用）
 *  - --readability-blur: '0px'~'12px'
 *  - --readability-desaturate: 0~1（saturate 用）
 */
function applyReadability(theme: ThemeLike) {
    const html = document.documentElement;

    const def: ReadabilityLike = {
        enabled: true,
        mode: 'auto',
        strength: 22,
        blur: 0,
        desaturate: 0,
        tint: undefined,
    };

    const rb = (theme.readability && typeof theme.readability === 'object')
        ? theme.readability
        : def;

    const enabled = typeof rb.enabled === 'boolean' ? rb.enabled : def.enabled;
    const strength = clamp((rb as any).strength, 0, 100, def.strength);
    const blur = clamp((rb as any).blur, 0, 12, def.blur);
    const desaturate = clamp((rb as any).desaturate, 0, 100, def.desaturate);

    const mode: ReadabilityMode =
        (rb.mode === 'darken' || rb.mode === 'lighten' || rb.mode === 'auto')
            ? rb.mode
            : def.mode;

    const resolvedTheme = resolveThemeMode(theme.mode);
    const effectiveMode: Exclude<ReadabilityMode, 'auto'> =
        mode === 'auto'
            ? (resolvedTheme === 'dark' ? 'darken' : 'lighten')
            : mode;

    // opacity 曲线
    const opacity = enabled ? strengthToOpacity(strength / 100) : 0;

    // 遮罩色：默认黑/白；若 tint 给了，可覆盖（这里先支持 '#000/#fff/#RRGGBB' 的简单形式）
    let rgb = effectiveMode === 'darken' ? '0,0,0' : '255,255,255';

    const tint = typeof (rb as any).tint === 'string' ? (rb as any).tint.trim() : '';
    if (tint) {
        // 支持 #RGB / #RRGGBB
        const hex = tint.startsWith('#') ? tint.slice(1) : '';
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) rgb = `${r},${g},${b}`;
        } else if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) rgb = `${r},${g},${b}`;
        }
        // rgba(...) 等复杂格式你也可以后续扩展（建议在遮罩层直接使用 --readability-tint）
    }

    html.style.setProperty('--readability-enabled', enabled ? '1' : '0');
    html.style.setProperty('--readability-opacity', String(opacity));
    html.style.setProperty('--readability-color', rgb);
    html.style.setProperty('--readability-blur', `${blur}px`);
    // desaturate 0~100 -> saturate 1~0
    html.style.setProperty('--readability-saturate', String(1 - (desaturate / 100)));
}

export function useThemeRuntimeSync(store: StoreLike) {
    watch(
        () => store.config.theme,
        (theme) => {
            applyThemeToDom(theme);
            applyTechFont(theme);
            applyBreathing(theme);
            applyNeon(theme);

            //  新增
            applyReadability(theme);
        },
        {immediate: true, deep: true}
    );
}
