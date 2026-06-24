import type {Component} from 'vue';

/** JSON-safe values accepted by persisted tile settings and manifests. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | {[key: string]: JsonValue};

export type TileSize = {w: number; h: number};
export type GridPlacement = TileSize & {x: number; y: number};
export type LayoutProfileId = 'desktop' | 'tablet' | 'mobile';
export type RuntimeTarget = 'web' | 'extension';
export type TileSource = 'builtin' | 'declarative' | 'sandbox';
export type BuiltinTileType = `builtin:${string}`;
export type ExternalTileType = `external:${string}`;
export type TileType = 'site' | BuiltinTileType | ExternalTileType;
export type BuiltinTileId = 'site' | BuiltinTileType;

export interface TileSizeRules {
    default: TileSize;
    min: TileSize;
    max: TileSize;
    allowed?: TileSize[];
    mobileFallback?: TileSize;
}

export interface TileLayouts {
    desktop: GridPlacement;
    tablet?: GridPlacement;
    mobile?: GridPlacement;
}

export interface WorkspaceLayoutProfile {
    unit: number;
    gap: number;
    minCols: number;
    maxCols?: number;
}

export interface WorkspaceLayout {
    mode: 'flow' | 'canvas';
    profiles: Partial<Record<LayoutProfileId, WorkspaceLayoutProfile>>;
}

export interface RevisionStamp {
    updatedAt: number;
    deviceId: string;
    sequence: number;
}

export interface TileBase {
    id: string;
    tileType: TileType;
    title?: string;
    layouts: TileLayouts;
    styleOverride?: TileStyleOverride;
    createdAt: number;
    revision: RevisionStamp;
}

/**
 * Bookmarks deliberately keep their searchable and importable fields at the
 * top level. Component-specific parameters belong exclusively in settings.
 */
export interface SiteTile extends TileBase {
    tileType: 'site';
    url: string;
    icon?: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;
    remark?: string;
    tags?: string[];
}

export interface ComponentTile extends TileBase {
    tileType: BuiltinTileType | ExternalTileType;
    settings: Record<string, JsonValue>;
}

export type TileInstance = SiteTile | ComponentTile;

export interface TileStyleOverride {
    radius?: number;
    accent?: string;
    surface?: string;
    iconScale?: number;
    density?: 'compact' | 'normal' | 'comfortable';
    elevation?: 0 | 1 | 2 | 3;
}

export type TileStyleableToken = keyof TileStyleOverride;

export type TileCapability =
    | {type: 'storage'; scope: 'instance'}
    | {type: 'network'; hosts: string[]}
    | {type: 'openExternal'}
    | {type: 'clipboard.write'}
    | {type: 'notifications'};

export interface HostCapabilities {
    target: RuntimeTarget;
    hostVersion: string;
    browser: {family: 'chrome' | 'edge' | 'other'; version: number};
    features: {
        indexedStorage: boolean;
        syncStorage: boolean;
        networkProxy: boolean;
        clipboardWrite: boolean;
        notifications: boolean;
        openExternal: boolean;
        contextMenus: boolean;
        localFileImport: boolean;
        sandboxRuntime: boolean;
    };
}

export type HostFeature = keyof HostCapabilities['features'];

export interface CapabilityRequirement {
    feature: HostFeature;
    level: 'required' | 'optional';
    fallback?: 'hide-control' | 'read-only' | 'placeholder';
}

export interface TileCompatibility {
    targets: RuntimeTarget[];
    minHostVersion: string;
    minBrowserVersion?: Partial<Record<'chrome' | 'edge', number>>;
    capabilities?: CapabilityRequirement[];
    mobileSupport: 'full' | 'fallback-layout' | 'desktop-only';
}

export interface TileManifestWire {
    manifestVersion: 1;
    id: string;
    version: string;
    apiVersion: 1;
    source: 'declarative' | 'sandbox';
    metadata: {
        label: string;
        description?: string;
        icon: string;
        category: string;
    };
    sizes: TileSizeRules;
    renderer:
        | {kind: 'declarative'; coverView: string; dialogView?: string}
        | {kind: 'sandbox'; entry: string};
    settingsSchema?: JsonValue;
    styleable?: TileStyleableToken[];
    capabilities?: TileCapability[];
    compatibility: TileCompatibility;
    integrity: {sha256: string; assets: Record<string, string>};
}

export interface BuiltinTileRegistration {
    id: BuiltinTileId;
    apiVersion: 1;
    version: string;
    metadata: TileManifestWire['metadata'];
    sizes: TileSizeRules;
    settingsSchema?: JsonValue;
    styleable?: TileStyleableToken[];
    capabilities?: TileCapability[];
    compatibility: TileCompatibility;
    renderer: {kind: 'vue'; cover: Component; dialog?: Component};
}

/**
 * Runtime-neutral representation used by the P2 adapter. Built-in Vue
 * components stay in the registration layer; the host only needs this shape
 * to select a site or widget presentation.
 */
export interface BuiltinTileDefinition {
    id: BuiltinTileId;
    source: 'builtin';
    label: string;
    description?: string;
    icon: string;
    category: string;
    sizes: TileSizeRules;
    styleable?: TileStyleableToken[];
    compatibility: TileCompatibility;
    renderer: {kind: 'site'} | {kind: 'widget'; widgetType: string};
}

/**
 * A recoverable placeholder for packages whose renderer is intentionally not
 * available in this host. P3 reserves external ids but does not execute them.
 */
export interface UnsupportedTileDefinition {
    id: TileType;
    source: 'unsupported';
    label: string;
    description: string;
    styleable?: TileStyleableToken[];
    renderer: {kind: 'unsupported'; reason: 'external-runtime-disabled' | 'missing-builtin'};
}

export type TileDefinition = BuiltinTileDefinition | UnsupportedTileDefinition;

export type ResolvedTileDefinition =
    | (TileManifestWire & {packageRef: {id: string; version: string; hash: string}})
    | BuiltinTileRegistration;

export interface Workspace {
    id: string;
    title: string;
    icon: string;
    iconColor?: string;
    iconBgColor?: string;
    sortKey?: 'custom' | 'name' | 'lastVisited';
    workspaceLayout: WorkspaceLayout;
    tiles: TileInstance[];
    revision: RevisionStamp;
}

export interface TileInstallRecord {
    tileType: TileType;
    version: string;
    source: 'builtin' | 'official' | 'local';
    runtime: 'declarative' | 'sandbox';
    sha256: string;
    enabled: boolean;
    installedAt: number;
    updatedAt: number;
    pinnedVersion?: boolean;
}

/** The P0 target shape; not wired into the existing v5 store until P3. */
export interface TileConfigV6Draft {
    version: 6;
    layout: Workspace[];
    tileInstalls: Record<string, TileInstallRecord>;
}
