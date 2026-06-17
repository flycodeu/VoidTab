// src/core/theme/themePackPresets.ts
// Four named theme pack presets for VoidTab.
// Each preset only overrides visual fields; layout/sites/searchEngines are never touched.

export type ThemePackId = 'clean' | 'glass' | 'office' | 'void-cyber';

export interface ThemePackReadability {
    enabled: boolean;
    mode: 'auto' | 'darken' | 'lighten';
    strength: number;
    blur: number;
    desaturate: number;
}

export interface ThemePackOverride {
    mode: 'light' | 'dark';
    accent: string;
    blur: number;
    opacity: number;
    neonGlow: boolean;
    breathingLight: boolean;
    techFont: boolean;
    techFontFamily: 'default' | 'JetBrains Mono' | 'Fira Code' | 'Orbitron' | 'Space Grotesk' | 'Roboto Mono' | 'IBM Plex Sans' | 'Noto Sans SC';
    readability: ThemePackReadability;
}

export interface ThemePackPreset {
    id: ThemePackId;
    name: string;
    nameZh: string;
    description: string;
    previewGradient: string;
    previewIsDark: boolean;
    tags: string[];
    themeOverride: ThemePackOverride;
    cssVars?: Record<string, string>;
    /** CSS class toggled on <html> when this pack is active — enables pack-specific CSS rules */
    htmlClass?: string;
}

export const themePackPresets: ThemePackPreset[] = [
    {
        id: 'clean',
        name: 'Clean',
        nameZh: '清爽',
        description: '清爽、可读、低噪声。专注内容，适合所有用户。',
        previewGradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        previewIsDark: false,
        tags: ['浅色', '极简', '默认'],
        themeOverride: {
            mode: 'light',
            accent: '#007AFF',
            blur: 0,
            opacity: 0.92,
            neonGlow: false,
            breathingLight: false,
            techFont: false,
            techFontFamily: 'default',
            readability: { enabled: true, mode: 'auto', strength: 15, blur: 0, desaturate: 0 },
        },
        htmlClass: 'tp-clean',
        cssVars: {
            '--page-fallback': '#f8faff',
            '--theme-pack-card-bg': 'rgba(255, 255, 255, 0.92)',
            '--theme-pack-card-border': 'rgba(0, 0, 0, 0.08)',
        },
    },
    {
        id: 'glass',
        name: 'Glass',
        nameZh: '毛玻璃',
        description: '壁纸友好，轻毛玻璃效果。搭配壁纸使用时视觉层次最佳。',
        previewGradient: 'linear-gradient(135deg, rgba(139,92,246,0.55) 0%, rgba(59,130,246,0.55) 100%)',
        previewIsDark: true,
        tags: ['深色', '毛玻璃', '壁纸友好'],
        themeOverride: {
            mode: 'dark',
            accent: '#8B5CF6',
            blur: 20,
            opacity: 0.15,
            neonGlow: false,
            breathingLight: false,
            techFont: false,
            techFontFamily: 'default',
            readability: { enabled: true, mode: 'darken', strength: 30, blur: 8, desaturate: 10 },
        },
        htmlClass: 'tp-glass',
        cssVars: {
            '--page-fallback': '#0e0a2e',
            '--theme-pack-card-bg': 'rgba(255, 255, 255, 0.10)',
            '--theme-pack-card-border': 'rgba(255, 255, 255, 0.20)',
            '--neon-glow-color': '#8B5CF6',
            '--neon-glow-strength': '0.5',
        },
    },
    {
        id: 'office',
        name: 'Office',
        nameZh: '专注办公',
        description: '低饱和、稳定、久看不累。适合工作日全天使用。',
        previewGradient: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
        previewIsDark: false,
        tags: ['浅色', '低饱和', '办公'],
        themeOverride: {
            mode: 'light',
            accent: '#0F766E',
            blur: 0,
            opacity: 0.95,
            neonGlow: false,
            breathingLight: false,
            techFont: false,
            techFontFamily: 'default',
            readability: { enabled: true, mode: 'auto', strength: 10, blur: 0, desaturate: 0 },
        },
        htmlClass: 'tp-office',
        cssVars: {
            '--page-fallback': '#e4edf5',
            '--widget-surface': '#f0f5fa',
            '--widget-surface-2': '#ffffff',
            '--widget-border': 'rgba(100, 116, 139, 0.18)',
            '--theme-pack-card-bg': 'rgba(255, 255, 255, 0.90)',
            '--theme-pack-card-border': 'rgba(148, 163, 184, 0.22)',
        },
    },
    {
        id: 'void-cyber',
        name: 'Void Cyber',
        nameZh: '赛博霓虹',
        description: 'VoidTab 标志性主题。霓虹、等宽字体、深邃黑底。',
        previewGradient: 'linear-gradient(135deg, #0f0f23 0%, #1a0a2e 60%, #0d1f1a 100%)',
        previewIsDark: true,
        tags: ['深色', '霓虹', '赛博朋克'],
        themeOverride: {
            mode: 'dark',
            accent: '#00FFD1',
            blur: 0,
            opacity: 0.65,
            neonGlow: true,
            breathingLight: true,
            techFont: true,
            techFontFamily: 'Fira Code',
            readability: { enabled: true, mode: 'darken', strength: 25, blur: 0, desaturate: 0 },
        },
        htmlClass: 'tp-void-cyber',
        cssVars: {
            '--page-fallback': '#060613',
            '--widget-surface': '#0a0a18',
            '--widget-surface-2': '#0d0d22',
            '--widget-border': 'rgba(0, 255, 209, 0.20)',
            '--theme-pack-card-bg': 'rgba(0, 0, 0, 0.65)',
            '--theme-pack-card-border': 'rgba(0, 255, 209, 0.22)',
            '--neon-glow-color': '#00FFD1',
            '--neon-glow-strength': '1',
        },
    },
];

export const themePackMap = new Map<ThemePackId, ThemePackPreset>(
    themePackPresets.map(p => [p.id, p])
);
