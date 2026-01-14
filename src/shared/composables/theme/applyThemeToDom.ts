// shared/composables/theme/applyThemeToDom.ts
function hexToRgb(hex: string) {
    const v = hex.replace('#', '').trim();
    const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `${r}, ${g}, ${b}`;
}

export function applyThemeToDom(theme: any) {
    const html = document.documentElement;

    //  system/light/dark -> 最终模式
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    const mode = theme.mode === 'system' ? (prefersDark ? 'dark' : 'light') : theme.mode;

    html.classList.toggle('light', mode === 'light');
    html.classList.toggle('dark', mode === 'dark');

    //  accent vars
    const accent = theme.accent || '#007AFF';
    html.style.setProperty('--accent-color', accent);
    html.style.setProperty('--accent-color-rgb', hexToRgb(accent));

    //  blur/opacity/wallpaper（你已有变量体系）
    html.style.setProperty('--glass-blur', `${theme.blur ?? 40}px`);
    html.style.setProperty('--overlay-alpha', `${theme.opacity ?? 0.55}`);

    const wp = (theme.wallpaper || '').trim();
    if (wp) html.style.setProperty('--user-wallpaper', `url("${wp}")`);
    else html.style.removeProperty('--user-wallpaper');
}
