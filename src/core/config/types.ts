import type {SyncProfile} from '../sync/types';

export const CURRENT_CONFIG_VERSION = 4 as const;
export type BookmarkDensity = 'compact' | 'normal' | 'comfortable';
export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom';
export type GroupSortKey = 'custom' | 'name' | 'lastVisited';
export type WidgetType = 'todo' | 'clock' | 'calendar' | 'weather' | 'system_monitor' | string;

export interface SiteItem {
    id: string;
    kind?: 'site' | 'widget';
    w?: number;
    h?: number;

    title?: string;
    url?: string;
    icon?: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;


    remark?: string;
    tags?: string[];
    createdAt?: number;

    widgetType?: WidgetType;
    widgetConfig?: Record<string, any>;
}

export interface Group {
    id: string;
    title: string;
    icon: string;
    items: SiteItem[];
    sortKey?: GroupSortKey;
    iconColor?: string;
    iconBgColor?: string;
}

export interface WidgetItem {
    id: string;
    name: string;
    visible: boolean;
    order: number;
    colSpan: number;
    config?: any;
}

export type SiteLayoutMode = 'icon' | 'card';

export interface ThemeConfig {
    mode: 'light' | 'dark' | 'system';
    accent: string;
    sidebarPos: SidebarPosition;
    showSidebar: boolean;
    showTime: boolean;
    gridMaxWidth: number;

    blur: number;
    opacity: number;
    wallpaper: string;

    techFont: boolean;
    breathingLight: boolean;
    neonGlow: boolean;

    iconSize: number;
    radius: number;
    gap: number;

    showIconName: boolean;
    showWidgetName: boolean;
    iconTextSize: number;

    icon: 'Folder';

    density: BookmarkDensity;

    showLogoText: boolean;
    customLogoText: string;

    showGroupCount: boolean;

    enableHistory: boolean;

    enableTerminal: boolean;


    techFontFamily: 'default' | 'JetBrains Mono' | 'Fira Code' | 'Orbitron' | 'Space Grotesk' | 'Roboto Mono' | 'IBM Plex Sans' | 'Noto Sans SC';

    breathingDuration: number;

    siteLayoutMode: SiteLayoutMode;
    showAllGroupsInMain: boolean;

    siteCard: {
        w: number;
        h: number;
        showRemark: boolean;
        showDomain: boolean;
    };

    readability: {
        enabled: boolean;
        mode: 'auto' | 'darken' | 'lighten';
        strength: number;
        blur: number;
        desaturate: number;
        tint?: string;
    };

    /** Currently active theme pack. null / undefined = user custom. */
    activeThemePack?: 'clean' | 'glass' | 'office' | 'void-cyber' | null;
}

export interface SearchEngine {
    id: string;
    name: string;
    url: string;
    icon: string;
}

export interface AiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxHistory: number;
}


export interface Config {
    version: number;
    sync: SyncProfile;

    layout: Group[];
    theme: ThemeConfig;

    searchEngines: SearchEngine[];
    currentEngineId: string;

    ai: AiConfig,
    focusMode: boolean;


    runtime: RuntimeConfig;

}


export type SiteStateMap = Record<string, { lastVisited: number; count: number }>;

export type SiteIconProvider =
    | 'browser_favicon'
    | 'first_party_proxy'
    | 'cn_favicon'
    | 'google_s2'
    | 'yandex'
    | 'duckduckgo'
    | 'icon_horse'
    | 'favicon_im'
    | 'unavatar'
    | 'site_manifest'
    | 'site_favicon'
    | 'preset'
    | 'unknown';

export type SiteIconCacheMode = 'blob' | 'url' | 'miss';

export type SiteIconCacheRecord = {
    cacheMode?: SiteIconCacheMode;
    blobKey?: string;
    fallbackUrl?: string;
    retryAfter?: number;
    lastError?: string;
    providerBackoffUntil?: Partial<Record<SiteIconProvider, number>>;
    lastTriedProvider?: SiteIconProvider;
    lastSuccessProvider?: SiteIconProvider;
    updatedAt: number;
    source: string;
    provider?: SiteIconProvider;
    dprAtFetch?: number;
    qualityScore?: number;
    width?: number;
    height?: number;
};

export type SiteIconPathMissRecord = {
    retryAfter: number;
    failCount: number;
    lastStatus?: number;
};

export type SiteIconProviderStatRecord = {
    failCount: number;
    lastFailAt: number;
    lastStatus?: number;
};

export type MemoNoteCategory = 'inbox' | 'todo' | 'work' | 'study' | 'idea' | 'snippet' | 'note' | string;

export type MemoCategory = {
    id: string;
    label: string;
};

export type MemoNote = {
    id: string;
    title: string;
    content: string;
    category: MemoNoteCategory;
    summary?: string;
    pinned?: boolean;
    createdAt: number;
    updatedAt: number;
};

export type TerminalCommandCategory = MemoNoteCategory;
export type TerminalCommandMemo = MemoNote & {
    command?: string;
    description?: string;
};

export type PhotoRef =
    | { id: string; source: 'url'; url: string; createdAt: number }
    | { id: string; source: 'idb'; blobKey: string; createdAt: number };

export type PhotoWidgetState = {
    defaultId?: string;
    items: PhotoRef[];
};

export type WeatherCacheEntry = {
    timestamp: number;
    payload: any;
    location?: string;
};

export type RuntimeConfig = {
    cron: {
        expr: string;
        theme: string;
    };
    auth: {
        jwtToken: string;
    };
    terminal_buffer: {
        buffer: string;
        theme: string;
        activeCategory: string;
        categories: MemoCategory[];
        notes: MemoNote[];
        commands?: TerminalCommandMemo[];
    };
    siteState: SiteStateMap;
    siteIcons: {
        version: number;
        records: Record<string, SiteIconCacheRecord>;
        pathMisses?: Record<string, SiteIconPathMissRecord>;
        providerStats?: Partial<Record<SiteIconProvider, SiteIconProviderStatRecord>>;
        lastBatchRefreshAt?: number;
    };

    widgets: {
        merit: {
            value: Record<string, number>;
            sound: Record<string, boolean>;
        };
    };

    widgetState: Record<string, { meritCount: number; soundEnabled: boolean }>;
    photo: {
        widgets: Record<string, PhotoWidgetState>;
    };
    siteList: {
        groups: Record<string, SiteListGroup>;
        widgets: Record<string, SiteListWidgetRef>;
    };
    terminal: {
        history: string[];
        theme: 'dark' | 'light' | 'hacker';
        isOpen: boolean;
    };
};


export interface SiteListEntry {
    id: string;
    title: string;
    desc?: string;
    url: string;
    iconType?: 'auto' | 'text' | 'icon' | 'upload' | 'image';
    iconValue: string;
    enableFx: boolean;
    fxType?: 'ripple' | 'confetti' | 'shake' | string;
}

export interface SiteListGroup {
    id: string;
    name: string;
    style: string;
    viewConfig: GroupViewConfig;
    items: SiteListEntry[];
}

export interface GroupViewConfig {
    showIcon: boolean;
    showTitle: boolean;
    showDesc: boolean;
}

export interface SiteListWidgetRef {
    groupId: string;
    defaultSiteId?: string;
}

export interface SiteListWidgetState {
    defaultId?: string;
    items: SiteListEntry[];
}
