import type {TileCapabilityGrantRecord} from '../config/types.ts';
import type {
    ComponentTile,
    HostFeature,
    TileCapability,
    TileCompatibility,
    TileInstallRecord,
} from './contracts.ts';

export type ExtensionHostPermissionStatus =
    | {ok: true; granted: boolean; origin: string}
    | {ok: false; granted: false; origin: string; reason: string};

type TileCapabilityDefinitionLike = {
    id: string;
    compatibility: TileCompatibility;
    capabilities?: readonly TileCapability[];
};

const hostFeatureOrder: HostFeature[] = [
    'indexedStorage',
    'syncStorage',
    'networkProxy',
    'clipboardWrite',
    'notifications',
    'openExternal',
    'contextMenus',
    'localFileImport',
    'sandboxRuntime',
];

const capabilityFeatureMap: Record<TileCapability['type'], HostFeature> = {
    storage: 'indexedStorage',
    network: 'networkProxy',
    openExternal: 'openExternal',
    'clipboard.write': 'clipboardWrite',
    notifications: 'notifications',
};

export function getTileCapabilityGrantKey(tileId: string) {
    return `tile:${tileId}`;
}

export function getTileCapabilityHostFeature(capability: TileCapability): HostFeature | null {
    return capabilityFeatureMap[capability.type] || null;
}

export function listRequiredTileHostFeatures(definition: Pick<TileCapabilityDefinitionLike, 'compatibility'>): HostFeature[] {
    const features = new Set<HostFeature>();
    for (const requirement of definition.compatibility.capabilities || []) {
        if (requirement.level === 'required') features.add(requirement.feature);
    }
    return hostFeatureOrder.filter((feature) => features.has(feature));
}

export function listDeclaredTileHostFeatures(definition: Pick<TileCapabilityDefinitionLike, 'capabilities' | 'compatibility'>): HostFeature[] {
    const features = new Set<HostFeature>();
    for (const requirement of definition.compatibility.capabilities || []) features.add(requirement.feature);
    for (const capability of definition.capabilities || []) {
        const feature = getTileCapabilityHostFeature(capability);
        if (feature) features.add(feature);
    }
    return hostFeatureOrder.filter((feature) => features.has(feature));
}

export function createTileCapabilityGrantRecord(
    tile: Pick<ComponentTile, 'id' | 'tileType'>,
    definition: Pick<TileCapabilityDefinitionLike, 'id' | 'compatibility'>,
    features: HostFeature[],
    now = Date.now(),
): TileCapabilityGrantRecord {
    const required = new Set(listRequiredTileHostFeatures(definition));
    const selected = new Set(features);
    const grantedFeatures = hostFeatureOrder.filter((feature) => required.has(feature) && selected.has(feature));
    return {
        tileId: tile.id,
        tileType: tile.tileType,
        packageId: definition.id,
        features: grantedFeatures,
        grantedAt: Math.round(now),
        updatedAt: Math.round(now),
    };
}

export function getGrantedTileHostFeatures(
    grants: Record<string, TileCapabilityGrantRecord> | undefined,
    tileId: string,
): HostFeature[] {
    const record = grants?.[getTileCapabilityGrantKey(tileId)];
    const allowed = new Set(record?.features || []);
    return hostFeatureOrder.filter((feature) => allowed.has(feature));
}

export function listMissingTileCapabilityGrants(
    definition: Pick<TileCapabilityDefinitionLike, 'compatibility'>,
    grants: Record<string, TileCapabilityGrantRecord> | undefined,
    tileId: string,
): HostFeature[] {
    const granted = new Set(getGrantedTileHostFeatures(grants, tileId));
    return listRequiredTileHostFeatures(definition).filter((feature) => !granted.has(feature));
}

export function describeExpandedHostCapabilities(
    previous: Pick<TileInstallRecord, 'manifest'> | undefined,
    next: {manifest: NonNullable<TileInstallRecord['manifest']>},
) {
    const previousFeatures = new Set(previous?.manifest ? listDeclaredTileHostFeatures(previous.manifest) : []);
    const nextFeatures = listDeclaredTileHostFeatures(next.manifest);
    const expandedFeatures = nextFeatures.filter((feature) => !previousFeatures.has(feature));
    const previousHosts = new Set(listNetworkHosts(previous?.manifest?.capabilities));
    const nextHosts = listNetworkHosts(next.manifest?.capabilities);
    const expandedHosts = nextHosts.filter((host) => !previousHosts.has(host));
    return {
        needsReauthorization: expandedFeatures.length > 0 || expandedHosts.length > 0,
        expandedFeatures,
        expandedHosts,
    };
}

export async function requestOptionalExtensionHostPermission(origin: string): Promise<ExtensionHostPermissionStatus> {
    const normalized = normalizeExtensionOrigin(origin);
    if (!normalized) return {ok: false, granted: false, origin, reason: 'Host 权限地址无效'};
    const chromeApi = (globalThis as typeof globalThis & {
        chrome?: {
        permissions?: {
            request?: (permissions: {origins: string[]}, callback: (granted: boolean) => void) => void;
            lastError?: {message?: string};
        };
        runtime?: {lastError?: {message?: string}};
    };
    }).chrome;
    if (!chromeApi?.permissions?.request) {
        return {ok: false, granted: false, origin: normalized, reason: '当前环境不支持动态 Host 权限申请'};
    }
    return new Promise((resolve) => {
        chromeApi.permissions!.request!({origins: [normalized]}, (granted) => {
            const message = chromeApi.runtime?.lastError?.message || chromeApi.permissions?.lastError?.message;
            if (message) resolve({ok: false, granted: false, origin: normalized, reason: message});
            else resolve({ok: true, granted: granted === true, origin: normalized});
        });
    });
}

function listNetworkHosts(capabilities: readonly TileCapability[] | undefined) {
    const hosts = new Set<string>();
    for (const capability of capabilities || []) {
        if (capability.type !== 'network') continue;
        for (const host of capability.hosts || []) {
            const normalized = normalizeExtensionOrigin(host) || host.trim().toLowerCase();
            if (normalized) hosts.add(normalized);
        }
    }
    return [...hosts].sort();
}

function normalizeExtensionOrigin(origin: string) {
    if (typeof origin !== 'string' || !origin.trim()) return '';
    const raw = origin.trim();
    if (raw === '<all_urls>') return raw;
    try {
        const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
        const pathname = url.pathname.endsWith('*') ? url.pathname : '/*';
        return `${url.protocol}//${url.host}${pathname}`;
    } catch {
        return '';
    }
}
