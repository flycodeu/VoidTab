import type {
    Config,
    Group,
    SiteItem,
    WidgetType,
    RuntimeConfig,
    SiteIconCacheRecord,
    SiteIconProvider,
    SiteIconPathMissRecord,
    SiteIconProviderStatRecord,
    SidebarPosition,
    TerminalCommandMemo,
} from './types';
import type {SyncProfile} from '../sync/types';
import {defaultConfig} from './default';
import {CURRENT_CONFIG_VERSION} from './types';

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function clamp(n: any, min: number, max: number, fallback: number) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

function clampInt(n: any, min: number, max: number, fallback: number) {
    return Math.round(clamp(n, min, max, fallback));
}

function normalizeSiteCard(inputSiteCard: any, defSiteCard: any) {
    const siteCard = (inputSiteCard && typeof inputSiteCard === 'object') ? inputSiteCard : {};

    return {
        w: clampInt(siteCard.w, 1, 4, defSiteCard.w),
        h: clampInt(siteCard.h, 1, 4, defSiteCard.h),
        showRemark: typeof siteCard.showRemark === 'boolean' ? siteCard.showRemark : defSiteCard.showRemark,
        showDomain: typeof siteCard.showDomain === 'boolean' ? siteCard.showDomain : defSiteCard.showDomain,
    };
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

const SIDEBAR_POSITIONS = new Set<SidebarPosition>(['left', 'right', 'top', 'bottom']);

function normalizeSidebarPosition(value: any, fallback: SidebarPosition = 'left'): SidebarPosition {
    return SIDEBAR_POSITIONS.has(value as SidebarPosition) ? value as SidebarPosition : fallback;
}

function normalizeSync(inputSync: any, fallback: SyncProfile): SyncProfile {
    const input = (inputSync && typeof inputSync === 'object') ? inputSync : {};
    const provider = input.provider === 'none' || input.provider === 'webdav'
        ? input.provider
        : fallback.provider;

    const base: any = {
        ...fallback,
        ...input,
        provider,
        enabled: typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled,
        autoSync: typeof input.autoSync === 'boolean' ? input.autoSync : fallback.autoSync,
        lastSyncTime: Number.isFinite(Number(input.lastSyncTime)) ? Number(input.lastSyncTime) : fallback.lastSyncTime,
        lastRemoteEtag: typeof input.lastRemoteEtag === 'string' ? input.lastRemoteEtag : fallback.lastRemoteEtag,
        lastRemoteMtime: typeof input.lastRemoteMtime === 'string' ? input.lastRemoteMtime : fallback.lastRemoteMtime,
        intervalMinutes: clampInt(input.intervalMinutes, 1, 1440, fallback.intervalMinutes ?? 10),
    };

    if (provider === 'webdav') {
        base.url = typeof input.url === 'string' ? input.url : (fallback as any).url;
        base.username = typeof input.username === 'string' ? input.username : (fallback as any).username;
        base.password = typeof input.password === 'string' ? input.password : (fallback as any).password;
        base.folder = typeof input.folder === 'string' && input.folder.trim() ? input.folder : (fallback as any).folder;
        base.filename = typeof input.filename === 'string' && input.filename.trim() ? input.filename : (fallback as any).filename;
    }

    return base as SyncProfile;
}

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

const SITE_ICON_PROVIDER_SET = new Set<SiteIconProvider>([
    'browser_favicon',
    'first_party_proxy',
    'cn_favicon',
    'google_s2',
    'yandex',
    'duckduckgo',
    'icon_horse',
    'favicon_im',
    'unavatar',
    'site_manifest',
    'site_favicon',
    'preset',
    'unknown',
]);

function normalizeSiteIconProvider(provider: any, source: string): SiteIconProvider {
    if (typeof provider === 'string' && SITE_ICON_PROVIDER_SET.has(provider as SiteIconProvider)) {
        return provider as SiteIconProvider;
    }
    if (source.includes('/api/favicon')) return 'first_party_proxy';
    if (source.includes('api.iowen.cn/favicon/')) return 'cn_favicon';
    if (source.includes('t2.gstatic.com/faviconv2') || source.includes('google.com/s2/favicons')) return 'google_s2';
    if (source.includes('duckduckgo.com/ip3/')) return 'duckduckgo';
    if (source.includes('favicon.yandex.net/favicon/')) return 'yandex';
    if (source.includes('icon.horse/icon/')) return 'icon_horse';
    if (source.includes('favicon.im/')) return 'favicon_im';
    if (source.includes('unavatar.io/')) return 'unavatar';
    return 'unknown';
}

function normalizeOptionalSiteIconProvider(provider: any, source: string): SiteIconProvider | undefined {
    if (typeof provider !== 'string') return undefined;
    return normalizeSiteIconProvider(provider, source);
}

function normalizeProviderBackoffUntil(value: any): Partial<Record<SiteIconProvider, number>> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const out: Partial<Record<SiteIconProvider, number>> = {};
    for (const [provider, untilRaw] of Object.entries(value)) {
        if (!SITE_ICON_PROVIDER_SET.has(provider as SiteIconProvider)) continue;
        const until = Number(untilRaw);
        if (!Number.isFinite(until) || until <= 0) continue;
        out[provider as SiteIconProvider] = until;
    }
    return Object.keys(out).length ? out : undefined;
}

function normalizePathMisses(value: any): Record<string, SiteIconPathMissRecord> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const out: Record<string, SiteIconPathMissRecord> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!raw || typeof raw !== 'object') continue;
        const retryAfter = Number((raw as any).retryAfter);
        const failCount = Number((raw as any).failCount);
        const lastStatusRaw = Number((raw as any).lastStatus);
        if (!Number.isFinite(retryAfter) || retryAfter <= 0) continue;
        if (!Number.isFinite(failCount) || failCount <= 0) continue;
        out[String(key)] = {
            retryAfter,
            failCount,
            lastStatus: Number.isFinite(lastStatusRaw) ? lastStatusRaw : undefined,
        };
    }
    return Object.keys(out).length ? out : undefined;
}

function normalizeProviderStats(value: any): Partial<Record<SiteIconProvider, SiteIconProviderStatRecord>> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const out: Partial<Record<SiteIconProvider, SiteIconProviderStatRecord>> = {};
    for (const [provider, raw] of Object.entries(value)) {
        if (!SITE_ICON_PROVIDER_SET.has(provider as SiteIconProvider)) continue;
        if (!raw || typeof raw !== 'object') continue;
        const failCount = Number((raw as any).failCount);
        const lastFailAt = Number((raw as any).lastFailAt);
        const lastStatusRaw = Number((raw as any).lastStatus);
        if (!Number.isFinite(failCount) || failCount <= 0) continue;
        if (!Number.isFinite(lastFailAt) || lastFailAt <= 0) continue;
        out[provider as SiteIconProvider] = {
            failCount,
            lastFailAt,
            lastStatus: Number.isFinite(lastStatusRaw) ? lastStatusRaw : undefined,
        };
    }
    return Object.keys(out).length ? out : undefined;
}

function normalizeTerminalCommands(value: any, fallback: TerminalCommandMemo[]): TerminalCommandMemo[] {
    const source = Array.isArray(value) && value.length > 0 ? value : fallback;
    const now = Date.now();
    const seen = new Set<string>();

    return source
        .map((raw: any, index: number): TerminalCommandMemo => {
            const command = typeof raw?.command === 'string' ? raw.command.trim() : '';
            const title = typeof raw?.title === 'string' && raw.title.trim()
                ? raw.title.trim()
                : (command ? command.slice(0, 28) : `命令 ${index + 1}`);
            const category = typeof raw?.category === 'string' && raw.category.trim()
                ? raw.category.trim()
                : 'note';
            const idSeed = typeof raw?.id === 'string' && raw.id.trim()
                ? raw.id.trim()
                : `cmd_${category}_${index}`;
            let id = idSeed;
            let suffix = 1;
            while (seen.has(id)) {
                suffix += 1;
                id = `${idSeed}_${suffix}`;
            }
            seen.add(id);

            return {
                id,
                title,
                command,
                category,
                description: typeof raw?.description === 'string' ? raw.description : '',
                createdAt: Number.isFinite(Number(raw?.createdAt)) ? Number(raw.createdAt) : now,
                updatedAt: Number.isFinite(Number(raw?.updatedAt)) ? Number(raw.updatedAt) : now,
            };
        })
        .filter((item) => item.command.length > 0);
}

function normalizeTerminalBuffer(input: any, fallback: RuntimeConfig['terminal_buffer']): RuntimeConfig['terminal_buffer'] {
    const base = input && typeof input === 'object' ? input : {};
    return {
        buffer: typeof base.buffer === 'string' ? base.buffer : fallback.buffer,
        theme: typeof base.theme === 'string' && base.theme.trim() ? base.theme : fallback.theme,
        activeCategory: typeof base.activeCategory === 'string' && base.activeCategory.trim()
            ? base.activeCategory
            : fallback.activeCategory,
        commands: normalizeTerminalCommands(base.commands, fallback.commands),
    };
}

function normalizeItem(rawItem: any): SiteItem {
    const kind = (rawItem?.kind === 'widget' || rawItem?.kind === 'site') ? rawItem.kind : 'site';
    const w = kind === 'widget' ? clamp(rawItem?.w, 1, 4, 2) : 1;
    const h = kind === 'widget' ? clamp(rawItem?.h, 1, 4, 2) : 1;

    const item: SiteItem = {
        id: String(rawItem?.id ?? Date.now()),
        title: String(rawItem?.title ?? ''),
        url: String(rawItem?.url ?? ''),
        iconType: rawItem?.iconType,
        iconValue: rawItem?.iconValue,
        bgColor: rawItem?.bgColor,
        icon: rawItem?.icon,

        kind,
        w,
        h,

        remark: typeof rawItem?.remark === 'string' ? rawItem.remark : '',
        createdAt: typeof rawItem?.createdAt === 'number' ? rawItem.createdAt : undefined,
    };

    if (kind === 'widget') {
        if (rawItem?.widgetType) item.widgetType = rawItem.widgetType as WidgetType;
        if (!item.widgetType && item.title === 'clock') item.widgetType = 'clock';
        if (rawItem?.widgetConfig) item.widgetConfig = rawItem.widgetConfig;

        delete item.remark;
        delete item.createdAt;
    }

    if (!item.iconType) item.iconType = 'auto';
    if (item.iconType !== 'auto' && item.iconType !== 'text' && item.iconType !== 'icon') {
        item.iconType = 'auto';
    }

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

        sortKey: rawGroup?.sortKey || 'custom',

        iconColor: rawGroup?.iconColor || undefined,
        iconBgColor: rawGroup?.iconBgColor || undefined,

        items: Array.isArray(rawGroup?.items) ? rawGroup.items.map(normalizeItem) : []
    };
    return group;
}

function normalizeRuntime(input: any): RuntimeConfig {
    const base = input || {};
    const def = defaultConfig.runtime;
    const siteList = base.siteList || {groups: {}, widgets: {}};
    if (!siteList.groups) siteList.groups = {};
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
        const source = typeof rec.source === 'string' ? rec.source : 'unknown';
        const provider = normalizeSiteIconProvider(rec.provider, source.toLowerCase());

        const normalized: SiteIconCacheRecord = {
            cacheMode,
            updatedAt: Number.isFinite(Number(rec.updatedAt)) ? Number(rec.updatedAt) : 0,
            source,
            provider,
            dprAtFetch: Number.isFinite(Number(rec.dprAtFetch)) ? Number(rec.dprAtFetch) : undefined,
            qualityScore: Number.isFinite(Number(rec.qualityScore)) ? Number(rec.qualityScore) : undefined,
            width: Number.isFinite(Number(rec.width)) ? Number(rec.width) : undefined,
            height: Number.isFinite(Number(rec.height)) ? Number(rec.height) : undefined,
            blobKey: (typeof rec.blobKey === 'string' && rec.blobKey) ? rec.blobKey : undefined,
            fallbackUrl: typeof rec.fallbackUrl === 'string' ? rec.fallbackUrl : undefined,
            retryAfter: Number.isFinite(Number(rec.retryAfter)) ? Number(rec.retryAfter) : undefined,
            lastError: typeof rec.lastError === 'string' ? rec.lastError : undefined,
            providerBackoffUntil: normalizeProviderBackoffUntil(rec.providerBackoffUntil),
            lastTriedProvider: normalizeOptionalSiteIconProvider(rec.lastTriedProvider, source.toLowerCase()),
            lastSuccessProvider: normalizeOptionalSiteIconProvider(rec.lastSuccessProvider, source.toLowerCase()),
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
        pathMisses: normalizePathMisses(rawSiteIcons.pathMisses),
        providerStats: normalizeProviderStats(rawSiteIcons.providerStats),
        lastBatchRefreshAt: Number.isFinite(Number(rawSiteIcons.lastBatchRefreshAt))
            ? Number(rawSiteIcons.lastBatchRefreshAt)
            : 0,
    };

    return {
        cron: base.cron || def.cron,
        auth: base.auth || def.auth,
        terminal_buffer: normalizeTerminalBuffer(base.terminal_buffer, def.terminal_buffer),

        siteState: base.siteState || {},
        siteIcons,
        terminal: base.terminal || def.terminal,
        widgets: base.widgets || def.widgets,
        widgetState: base.widgetState || {},

        photo: base.photo || {widgets: {}},

        siteList: siteList
    };
}

export function normalizeConfig(raw: any): Config {
    const base = deepClone(defaultConfig);

    const input = (raw && typeof raw === 'object') ? raw : {};
    const out: any = base;

    out.version = CURRENT_CONFIG_VERSION;

    out.sync = normalizeSync(input.sync, base.sync);

    out.theme = {
        ...base.theme,
        ...(input.theme || {}),
        showWidgetName: base.theme.showWidgetName ?? true,
        sidebarPos: normalizeSidebarPosition(input.theme?.sidebarPos, base.theme.sidebarPos),
        showSidebar: typeof input.theme?.showSidebar === 'boolean'
            ? input.theme.showSidebar
            : base.theme.showSidebar,

        siteLayoutMode: (input.theme?.siteLayoutMode === 'card' ? 'card' : 'icon'),
        showAllGroupsInMain: typeof input.theme?.showAllGroupsInMain === 'boolean'
            ? input.theme.showAllGroupsInMain
            : base.theme.showAllGroupsInMain,
        siteCard: normalizeSiteCard(input.theme?.siteCard, base.theme.siteCard),
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


    out.focusMode = typeof input.focusMode === 'boolean'
        ? input.focusMode
        : base.focusMode;

    out.ai = {
        ...base.ai,
        ...(input.ai || {})
    };

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


    out.layout = Array.isArray(input.layout) ? input.layout.map(normalizeGroup) : deepClone(base.layout);

    out.runtime = normalizeRuntime(input.runtime);

    return out as Config;
}
