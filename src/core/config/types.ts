import type {SyncProfile} from '../sync/types';
import type {TileInstallRecord, TileInstance, TileLayouts, Workspace, WorkspaceLayout} from '../tiles/contracts';

/** The canonical persisted/runtime configuration schema. */
export const CURRENT_CONFIG_VERSION = 6 as const;
/** Only used by the v5 reader and the one-way v5 -> v6 migration boundary. */
export const LEGACY_CONFIG_VERSION = 5 as const;
export const MAX_SUPPORTED_CONFIG_VERSION = 6 as const;
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

    /** P1 bridge field. P3 migrates this into the canonical TileInstance shape. */
    layouts?: TileLayouts;
}

export interface Group {
    id: string;
    title: string;
    icon: string;
    items: SiteItem[];
    sortKey?: GroupSortKey;
    iconColor?: string;
    iconBgColor?: string;
    /** P1 bridge field. Existing groups default to flow and remain order-compatible. */
    workspaceLayout?: WorkspaceLayout;
}

export type PrivacyVaultKdf =
    | {
    name: 'PBKDF2-SHA256';
    iterations: number;
    salt: string;
}
    | {
    name: 'Argon2id';
    memoryKiB: number;
    iterations: number;
    parallelism: number;
    salt: string;
};

export interface PrivacyVaultEnvelope {
    version: 1;
    alg: 'AES-256-GCM';
    kdf: PrivacyVaultKdf;
    verifier: string;
    ciphertext: string;
    updatedAt: number;
}

export interface PrivacyConfig {
    enabled: boolean;
    vault: PrivacyVaultEnvelope | null;
    entry: {
        trigger: 'keyboard';
        phrase: string;
        autoLockMinutes: number;
        hideWhenLocked: boolean;
        syncEnabled: boolean;
    };
}

export interface PrivacyVaultGroupEntry {
    group: Group;
    originalIndex: number;
    movedAt: number;
}

export interface PrivacyVaultSiteEntry {
    site: SiteItem;
    originalGroupId: string;
    originalGroupTitle?: string;
    originalIndex: number;
    movedAt: number;
}

/** Legacy encrypted payload. It is read only to support lazy migration at unlock. */
export interface PrivacyVaultPayloadV1 {
    version: 1;
    groups: PrivacyVaultGroupEntry[];
    sites: PrivacyVaultSiteEntry[];
}

export interface PrivacyVaultWorkspaceEntryV2 {
    workspace: Workspace;
    originalIndex: number;
    movedAt: number;
}

export interface PrivacyVaultTileEntryV2 {
    tile: TileInstance;
    originalWorkspaceId: string;
    originalWorkspaceTitle?: string;
    originalIndex: number;
    movedAt: number;
}

/** Canonical encrypted payload introduced by P3.5. */
export interface PrivacyVaultPayloadV2 {
    version: 2;
    workspaces: PrivacyVaultWorkspaceEntryV2[];
    tiles: PrivacyVaultTileEntryV2[];
}

export type PrivacyVaultPayload = PrivacyVaultPayloadV1 | PrivacyVaultPayloadV2;

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

export interface AiPromptTemplate {
    id: string;
    title: string;
    category: string;
    content: string;
    description?: string;
    systemPrompt?: string;
    createdAt: number;
    updatedAt: number;
}

export interface AiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxHistory: number;
    systemPrompt: string;
    templates: AiPromptTemplate[];
}

/** 内置氛围音全局配置（轻状态，可进 config / sync；音频本身是随包静态资源或程序生成，不入库） */
export interface AudioConfig {
    ambient: {
        enabled: boolean;
        /** 当前选中的氛围音 id，对应 AMBIENT_SOUNDS 中的条目 */
        currentId: string;
        /** 0 ~ 1 */
        volume: number;
    };
}


/** Fields that remain unchanged while P3 replaces the layout payload. */
export interface ConfigBase {
    sync: SyncProfile;

    theme: ThemeConfig;

    searchEngines: SearchEngine[];
    currentEngineId: string;

    ai: AiConfig,
    focusMode: boolean;
    privacy: PrivacyConfig;

    audio: AudioConfig;

    runtime: RuntimeConfig;

}

/** Current persisted shape. P3.3 is the only phase allowed to replace it. */
export interface ConfigV5 extends ConfigBase {
    version: typeof LEGACY_CONFIG_VERSION;
    layout: Group[];
}

/** P3.2 target shape; declared now but not persisted until the P3.3 transaction. */
export interface ConfigV6 extends ConfigBase {
    version: 6;
    layout: Workspace[];
    tileInstalls: Record<string, TileInstallRecord>;
}

/** Live runtime accepts restored v5 until the explicit P3 transaction commits v6. */
export type Config = ConfigV5 | ConfigV6;


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

export type MusicEmbedProviderId = 'audio' | 'netease' | 'tencent' | 'spotify' | 'youtube' | 'custom';

/** 音乐嵌入组件的单实例配置（仅轻文本：服务 + 资源 id，无任何音频二进制） */
export type MusicEmbedWidgetState = {
    provider: MusicEmbedProviderId;
    /** song | playlist | album | radio 等，含义随服务而定 */
    kind: string;
    resourceId: string;
    /** audio/custom 服务下直接保存完整资源 URL */
    customUrl?: string;
    autoplay: boolean;
    height: number;
    title?: string;
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
    musicEmbed: {
        widgets: Record<string, MusicEmbedWidgetState>;
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
