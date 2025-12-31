// src/core/config/normalize.ts
import type {Config, Group, SiteItem, WidgetItem} from './types';
import {defaultConfig} from './default';
import {CURRENT_CONFIG_VERSION} from './types';

/** 深拷贝：避免引用 defaultConfig */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// 🎨 颜色生成器
function generateColor(str: string) {
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
}

function getSmartInitials(str: string) {
    const clean = (str || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (!clean) return (str || 'A').substring(0, 2).toUpperCase();

    if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
    return clean.substring(0, 4).toUpperCase();
}

function isInternalUrl(url: string) {
    return !!url && /^(https?:\/\/)?(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])|localhost|127\.)/.test(url);
}

function normalizeSiteItem(rawItem: any): SiteItem {
    const item: SiteItem = {
        id: String(rawItem?.id ?? Date.now()),
        title: String(rawItem?.title ?? ''),
        url: String(rawItem?.url ?? ''),
        iconType: rawItem?.iconType,
        iconValue: rawItem?.iconValue,
        bgColor: rawItem?.bgColor,
        icon: rawItem?.icon
    };

    if (!item.iconType) item.iconType = 'auto';

    const internal = isInternalUrl(item.url);
    if (internal && item.iconType !== 'text') {
        item.iconType = 'text';
    }

    if (item.iconType === 'text' || internal) {
        const isDefaultColor = !item.bgColor || item.bgColor === '#3b82f6' || item.bgColor === '#ffffff';
        if (isDefaultColor) {
            item.bgColor = generateColor(item.title || '');
        }

        if (!item.iconValue || item.iconValue.length < 2) {
            item.iconValue = getSmartInitials(item.title || 'A');
            if (!item.iconValue) item.iconValue = (item.title || 'A').substring(0, 2);
        }
    }

    return item;
}

// ✅ 核心修复：确保颜色字段和排序字段被保留
function normalizeGroup(rawGroup: any): Group {
    const group: Group = {
        id: String(rawGroup?.id ?? Date.now()),
        title: String(rawGroup?.title ?? '未命名'),
        icon: String(rawGroup?.icon ?? 'Folder'),

        // 1. 补回排序字段 (否则排序功能也会失效)
        sortKey: rawGroup?.sortKey || 'custom',

        // 2. 新增颜色字段透传
        iconColor: rawGroup?.iconColor || undefined,
        iconBgColor: rawGroup?.iconBgColor || undefined,

        items: Array.isArray(rawGroup?.items) ? rawGroup.items.map(normalizeSiteItem) : []
    };
    return group;
}

function normalizeWidgets(rawWidgets: any): WidgetItem[] {
    const defList = defaultConfig.widgets || [];
    const defMap = new Map(defList.map(w => [w.id, w]));

    const result: WidgetItem[] = [];
    const seen = new Set<string>();

    const input = Array.isArray(rawWidgets) ? rawWidgets : [];

    for (const w of input) {
        if (!w?.id) continue;
        const id = String(w.id);

        const def = defMap.get(id);
        if (def) {
            const merged: WidgetItem = {
                ...deepClone(def),
                ...w,
                config: {
                    ...(def as any).config,
                    ...(w as any).config
                }
            };
            if (merged.colSpan === undefined) merged.colSpan = (def as any).colSpan ?? 1;
            if (merged.order === undefined) merged.order = (def as any).order ?? 0;
            if (merged.visible === undefined) merged.visible = (def as any).visible ?? true;
            if (!merged.name) merged.name = (def as any).name ?? id;

            result.push(merged);
        } else {
            const custom: WidgetItem = {
                id,
                name: String(w.name ?? id),
                visible: Boolean(w.visible ?? true),
                order: Number(w.order ?? 999),
                colSpan: Number(w.colSpan ?? 1),
                config: (w as any).config ?? {}
            };
            result.push(custom);
        }
        seen.add(id);
    }

    for (const def of defList) {
        if (!seen.has(def.id)) {
            result.push(deepClone(def));
        }
    }

    return result;
}

export function normalizeConfig(raw: any): Config {
    const base = deepClone(defaultConfig);

    const input = (raw && typeof raw === 'object') ? raw : {};
    const out: any = base;

    // version
    out.version = CURRENT_CONFIG_VERSION;

    // sync
    out.sync = {
        ...base.sync,
        ...(input.sync || {})
    };

    // theme
    out.theme = {
        ...base.theme,
        ...(input.theme || {})
    };


    // 如果 input 里有布尔值就用，没有就用默认(false)
    out.focusMode = typeof input.focusMode === 'boolean'
        ? input.focusMode
        : base.focusMode;

    // ai
    out.ai = {
        ...base.ai,
        ...(input.ai || {})
    };

    // search engines
    out.searchEngines = Array.isArray(input.searchEngines) && input.searchEngines.length > 0
        ? input.searchEngines.map((e: any) => ({
            id: String(e?.id ?? Date.now()),
            name: String(e?.name ?? 'Engine'),
            url: String(e?.url ?? ''),
            icon: String(e?.icon ?? 'Globe')
        }))
        : deepClone(base.searchEngines);

    const curId = String(input.currentEngineId ?? base.currentEngineId);
    const exists = out.searchEngines.some((e: any) => e.id === curId);
    out.currentEngineId = exists ? curId : out.searchEngines[0]?.id ?? base.currentEngineId;

    // widgets
    out.widgets = normalizeWidgets(input.widgets);

    // layout
    out.layout = Array.isArray(input.layout) ? input.layout.map(normalizeGroup) : deepClone(base.layout);

    return out as Config;
}