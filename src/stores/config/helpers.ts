import type {SiteItem} from '../../core/config/types';

export const MAX_WIDGET_W = 16;
export const MAX_WIDGET_H = 16;

export const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export const generateColor = (str: string) => {
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
        '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
        '#f43f5e', '#0f172a', '#475569', '#059669', '#7c3aed'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export const toInt = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
    const n = toInt(v, fallback);
    return Math.max(min, Math.min(max, n));
};

export const normalizeSiteIconType = (v: unknown): NonNullable<SiteItem['iconType']> => {
    if (v === 'text' || v === 'icon') return v;
    return 'auto';
};

export const createTextIconValue = (title: string) => {
    const cleanTitle = (title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (/[\u4e00-\u9fa5]/.test(cleanTitle)) {
        return cleanTitle.substring(0, 2);
    }
    return cleanTitle.substring(0, 4).toUpperCase() || title.substring(0, 2) || 'A';
};
