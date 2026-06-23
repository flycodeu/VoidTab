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

export interface TileInstance {
    id: string;
    tileType: string;
    title?: string;
    settings: Record<string, JsonValue>;
    layouts: TileLayouts;
    styleOverride?: TileStyleOverride;
    createdAt: number;
    revision: RevisionStamp;
}

export interface TileStyleOverride {
    radius?: number;
    accent?: string;
    surface?: string;
    iconScale?: number;
    density?: 'compact' | 'normal' | 'comfortable';
    elevation?: 0 | 1 | 2 | 3;
}

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
    styleable?: string[];
    capabilities?: TileCapability[];
    compatibility: TileCompatibility;
    integrity: {sha256: string; assets: Record<string, string>};
}

export interface BuiltinTileRegistration {
    id: string;
    apiVersion: 1;
    version: string;
    metadata: TileManifestWire['metadata'];
    sizes: TileSizeRules;
    settingsSchema?: JsonValue;
    styleable?: string[];
    capabilities?: TileCapability[];
    compatibility: TileCompatibility;
    renderer: {kind: 'vue'; cover: Component; dialog?: Component};
}

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
    tileType: string;
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

