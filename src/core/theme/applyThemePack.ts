// src/core/theme/applyThemePack.ts
// Apply / clear theme pack overrides onto a Config object and the DOM CSS variables.

import type { ThemePackPreset } from './themePackPresets';

// Fields that a theme pack is NEVER allowed to touch.
const PRESERVED_KEYS = new Set([
    'wallpaper',
    'wallpaperType',
    'customLogoUrl',
    'sidebarPos',
    'showSidebar',
    'showTime',
    'gridMaxWidth',
    'iconSize',
    'radius',
    'gap',
    'showIconName',
    'showWidgetName',
    'iconTextSize',
    'density',
    'siteLayoutMode',
    'showAllGroupsInMain',
    'siteCard',
    'showLogoText',
    'customLogoText',
    'showGroupCount',
    'enableHistory',
    'enableTerminal',
    'breathingDuration',
    'icon',
]);

/**
 * Merge a theme pack's overrides into the given theme object in-place.
 * Preserved keys are not modified. Returns the modified theme for chaining.
 */
export function applyThemePackToTheme(
    theme: Record<string, unknown>,
    preset: ThemePackPreset
): void {
    const overrides = preset.themeOverride as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(overrides)) {
        if (!PRESERVED_KEYS.has(key)) {
            if (key === 'readability' && value && typeof value === 'object') {
                theme.readability = { ...(theme.readability as object ?? {}), ...(value as object) };
            } else {
                theme[key] = value;
            }
        }
    }
    theme.activeThemePack = preset.id;
}

const PACK_CSS_VAR_KEYS = [
    '--theme-pack-card-bg',
    '--theme-pack-card-border',
    '--neon-glow-color',
    '--neon-glow-strength',
    '--page-fallback',
    '--widget-surface',
    '--widget-surface-2',
    '--widget-border',
];

const PACK_HTML_CLASSES = ['tp-clean', 'tp-glass', 'tp-office', 'tp-void-cyber'];

/**
 * Write theme pack CSS variables and HTML class onto :root/<html>.
 * Call after applyThemePackToTheme and after the normal applyCssVars pass.
 */
export function applyThemePackCssVars(preset: ThemePackPreset): void {
    const el = document.documentElement;
    PACK_CSS_VAR_KEYS.forEach(k => el.style.removeProperty(k));
    PACK_HTML_CLASSES.forEach(c => el.classList.remove(c));
    if (preset.cssVars) {
        for (const [k, v] of Object.entries(preset.cssVars)) {
            el.style.setProperty(k, v);
        }
    }
    if (preset.htmlClass) {
        el.classList.add(preset.htmlClass);
    }
}

/**
 * Remove all theme pack CSS variables and HTML classes (called when switching
 * packs or when the user clears the active pack).
 */
export function clearThemePackCssVars(): void {
    const el = document.documentElement;
    PACK_CSS_VAR_KEYS.forEach(k => el.style.removeProperty(k));
    PACK_HTML_CLASSES.forEach(c => el.classList.remove(c));
}
