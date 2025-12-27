// src/core/config/normalize.ts
import type {Config, Group, SiteItem, WidgetItem} from './types';
import {defaultConfig} from './default';
import {CURRENT_CONFIG_VERSION} from './types';

/** 深拷贝：避免引用 defaultConfig */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// 🎨 颜色生成器（从你 store 里搬过来）
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

    if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2); // 中文取前2
    return clean.substring(0, 4).toUpperCase(); // 英文取前4
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
        icon: rawItem?.icon // 旧字段保留（Step3/后续会 migrate 掉）
    };

    // iconType 默认值：没给就 auto
    if (!item.iconType) item.iconType = 'auto';

    // 内网地址：强制文字模式（你 repairData 的逻辑）
    const internal = isInternalUrl(item.url);
    if (internal && item.iconType !== 'text') {
        item.iconType = 'text';
    }

    // 文字模式（或内网）：修复颜色 + 修复文字
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

function normalizeGroup(rawGroup: any): Group {
    const group: Group = {
        id: String(rawGroup?.id ?? Date.now()),
        title: String(rawGroup?.title ?? '未命名'),
        icon: String(rawGroup?.icon ?? 'Folder'),
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

    // 先按用户当前保存的顺序塞进来（尽量不破坏用户排序）
    for (const w of input) {
        if (!w?.id) continue;
        const id = String(w.id);

        const def = defMap.get(id);
        if (def) {
            const merged: WidgetItem = {
                ...deepClone(def),
                ...w,
                // config 做浅合并（保留默认字段）
                config: {
                    ...(def as any).config,
                    ...(w as any).config
                }
            };
            // 补齐关键字段
            if (merged.colSpan === undefined) merged.colSpan = (def as any).colSpan ?? 1;
            if (merged.order === undefined) merged.order = (def as any).order ?? 0;
            if (merged.visible === undefined) merged.visible = (def as any).visible ?? true;
            if (!merged.name) merged.name = (def as any).name ?? id;

            result.push(merged);
        } else {
            // 未注册/自定义 widget：允许存在，但补齐字段，避免 WidgetPanel 报错
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

    // 再把默认里缺失的补上（避免你后续新增 widget 时老用户配置缺字段）
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
    out.version = typeof input.version === 'number' ? input.version : CURRENT_CONFIG_VERSION;
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

    // search engines
    out.searchEngines = Array.isArray(input.searchEngines) && input.searchEngines.length > 0
        ? input.searchEngines.map((e: any) => ({
            id: String(e?.id ?? Date.now()),
            name: String(e?.name ?? 'Engine'),
            url: String(e?.url ?? ''),
            icon: String(e?.icon ?? 'Globe')
        }))
        : deepClone(base.searchEngines);

    // currentEngineId 必须存在
    const curId = String(input.currentEngineId ?? base.currentEngineId);
    const exists = out.searchEngines.some((e: any) => e.id === curId);
    out.currentEngineId = exists ? curId : out.searchEngines[0]?.id ?? base.currentEngineId;

    // widgets（修复你原来“map完又被覆盖”的逻辑问题）
    out.widgets = normalizeWidgets(input.widgets);

    // layout / groups / items（包含你 repairData 的逻辑）
    out.layout = Array.isArray(input.layout) ? input.layout.map(normalizeGroup) : deepClone(base.layout);

    return out as Config;
}
