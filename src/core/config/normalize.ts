// src/core/config/normalize.ts
import type {Config, Group, SiteItem, WidgetType, RuntimeConfig, SiteIconCacheRecord} from './types';
import {defaultConfig} from './default';
import {CURRENT_CONFIG_VERSION} from './types';

/** 深拷贝：避免引用 defaultConfig */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function clamp(n: any, min: number, max: number, fallback: number) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

function normalizeReadability(inputRb: any, defRb: any) {
    const rb = (inputRb && typeof inputRb === 'object') ? inputRb : {};

    const mode = (rb.mode === 'darken' || rb.mode === 'lighten' || rb.mode === 'auto')
        ? rb.mode
        : defRb.mode;

    return {
        enabled: typeof rb.enabled === 'boolean' ? rb.enabled : defRb.enabled,
        mode,
        strength: clamp(rb.strength, 0, 100, defRb.strength),
        blur: clamp(rb.blur, 0, 12, defRb.blur),
        desaturate: clamp(rb.desaturate, 0, 100, defRb.desaturate),
        tint: typeof rb.tint === 'string' ? rb.tint : defRb.tint,
    };
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

function isInternalUrl(url: any) {
    return !!url && /^(https?:\/\/)?(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])|localhost|127\.)/.test(url);
}

// 核心修改：同时处理 Site 和 Widget 的清洗逻辑
function normalizeItem(rawItem: any): SiteItem {
    const kind = (rawItem?.kind === 'widget' || rawItem?.kind === 'site') ? rawItem.kind : 'site';

    const item: SiteItem = {
        id: String(rawItem?.id ?? Date.now()),
        title: String(rawItem?.title ?? ''),
        url: String(rawItem?.url ?? ''),
        iconType: rawItem?.iconType,
        iconValue: rawItem?.iconValue,
        bgColor: rawItem?.bgColor,
        icon: rawItem?.icon,

        kind,
        w: Number(rawItem?.w) || (kind === 'widget' ? 2 : 1),
        h: Number(rawItem?.h) || (kind === 'widget' ? 2 : 1),

        //  站点扩展字段要保留
        remark: typeof rawItem?.remark === 'string' ? rawItem.remark : '',
        createdAt: typeof rawItem?.createdAt === 'number' ? rawItem.createdAt : undefined,
    };

    if (kind === 'widget') {
        if (rawItem?.widgetType) item.widgetType = rawItem.widgetType as WidgetType;
        if (!item.widgetType && item.title === 'clock') item.widgetType = 'clock';
        if (rawItem?.widgetConfig) item.widgetConfig = rawItem.widgetConfig;

        //  widget 不需要 remark/tags，避免污染（可选）
        delete item.remark;
        delete item.createdAt;
    }

    //  iconType / internal / bgColor / iconValue 逻辑保持不变
    if (!item.iconType) item.iconType = 'auto';

    const internal = isInternalUrl(item.url);
    if (internal && item.iconType !== 'text') item.iconType = 'text';

    if (item.iconType === 'text' || internal) {
        const isDefaultColor = !item.bgColor || item.bgColor === '#3b82f6' || item.bgColor === '#ffffff';
        if (isDefaultColor) item.bgColor = generateColor(item.title || '');

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

        // 补回排序字段
        sortKey: rawGroup?.sortKey || 'custom',

        // 颜色字段透传
        iconColor: rawGroup?.iconColor || undefined,
        iconBgColor: rawGroup?.iconBgColor || undefined,

        items: Array.isArray(rawGroup?.items) ? rawGroup.items.map(normalizeItem) : []
    };
    return group;
}

// 新增：Runtime 数据清洗与合并
function normalizeRuntime(input: any): RuntimeConfig {
    // input 是从 LocalStorage 读出来的旧数据
    // def 是代码里最新的默认值
    const base = input || {};
    const def = defaultConfig.runtime;
    const siteList = base.siteList || {groups: {}, widgets: {}};
    // 兼容性处理：如果这里之前是旧结构（数据在 widgets 里），这里可以简单初始化 groups
    if (!siteList.groups) siteList.groups = {};
    // 初始化默认分组，防止用户进来是空的
    if (Object.keys(siteList.groups).length === 0) {
        const defId = 'default_group';
        siteList.groups[defId] = {id: defId, name: '默认清单', items: []};
    }
    const rawSiteIcons = (base.siteIcons && typeof base.siteIcons === 'object') ? base.siteIcons : {};
    const rawRecords = (rawSiteIcons.records && typeof rawSiteIcons.records === 'object') ? rawSiteIcons.records : {};
    const siteIconRecords: Record<string, SiteIconCacheRecord> = {};
    for (const [domain, value] of Object.entries(rawRecords)) {
        const rec = value as any;
        if (!rec || typeof rec !== 'object') continue;
        const cacheMode = (rec.cacheMode === 'blob' || rec.cacheMode === 'url' || rec.cacheMode === 'miss')
            ? rec.cacheMode
            : ((typeof rec.blobKey === 'string' && rec.blobKey) ? 'blob' : 'miss');

        const normalized: SiteIconCacheRecord = {
            cacheMode,
            updatedAt: Number.isFinite(Number(rec.updatedAt)) ? Number(rec.updatedAt) : 0,
            source: typeof rec.source === 'string' ? rec.source : 'unknown',
            provider: typeof rec.provider === 'string' ? rec.provider : 'unknown',
            dprAtFetch: Number.isFinite(Number(rec.dprAtFetch)) ? Number(rec.dprAtFetch) : undefined,
            qualityScore: Number.isFinite(Number(rec.qualityScore)) ? Number(rec.qualityScore) : undefined,
            width: Number.isFinite(Number(rec.width)) ? Number(rec.width) : undefined,
            height: Number.isFinite(Number(rec.height)) ? Number(rec.height) : undefined,
            blobKey: (typeof rec.blobKey === 'string' && rec.blobKey) ? rec.blobKey : undefined,
            fallbackUrl: typeof rec.fallbackUrl === 'string' ? rec.fallbackUrl : undefined,
            retryAfter: Number.isFinite(Number(rec.retryAfter)) ? Number(rec.retryAfter) : undefined,
            lastError: typeof rec.lastError === 'string' ? rec.lastError : undefined,
        };

        if (normalized.cacheMode === 'blob' && !normalized.blobKey) {
            normalized.cacheMode = 'miss';
        }
        if (normalized.cacheMode === 'url' && !normalized.fallbackUrl) {
            normalized.cacheMode = normalized.blobKey ? 'blob' : 'miss';
        }
        siteIconRecords[String(domain)] = normalized;
    }

    const siteIcons = {
        version: Number.isFinite(Number(rawSiteIcons.version)) ? Number(rawSiteIcons.version) : 1,
        records: siteIconRecords,
        lastBatchRefreshAt: Number.isFinite(Number(rawSiteIcons.lastBatchRefreshAt))
            ? Number(rawSiteIcons.lastBatchRefreshAt)
            : 0,
    };

    return {
        // 简单字段：优先用旧数据，没有则用默认
        cron: base.cron || def.cron,
        auth: base.auth || def.auth,
        terminal_buffer: base.terminal_buffer || def.terminal_buffer,

        // Map 类型：保留旧数据
        siteState: base.siteState || {},
        siteIcons,
        terminal: base.terminal || def.terminal,
        // Widget 状态
        widgets: base.widgets || def.widgets,
        widgetState: base.widgetState || {},

        // 如果 input 里有 photo 就用 input 的，否则初始化为空对象
        photo: base.photo || {widgets: {}},

        siteList: siteList
    };
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
        ...(input.theme || {}),
        showWidgetName: base.theme.showWidgetName ?? true,

        siteLayoutMode: (input.theme?.siteLayoutMode === 'card' ? 'card' : 'icon'),
        siteCard: {
            ...base.theme.siteCard,
            ...(input.theme?.siteCard || {}),
        },
        readability: normalizeReadability(
            (input.theme as any)?.readability,
            (base.theme as any)?.readability ?? {
                enabled: true,
                mode: 'auto',
                strength: 22,
                blur: 0,
                desaturate: 0,
                tint: undefined,
            }
        ),
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


    // layout
    out.layout = Array.isArray(input.layout) ? input.layout.map(normalizeGroup) : deepClone(base.layout);

    // 新增：显式调用 Runtime 清洗
    // 这一步之前是缺失的，导致 input.runtime 被忽略
    out.runtime = normalizeRuntime(input.runtime);

    return out as Config;
}
