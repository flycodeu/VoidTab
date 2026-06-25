import type {
    SandboxCrashRecord,
    SandboxGrantRecord,
    SandboxRuntimeLimits,
    SandboxRuntimePermission,
} from '../config/types.ts';
import type {ComponentTile, SandboxTileDefinition, TileCapability} from './contracts.ts';

export const SANDBOX_RUNTIME_REVIEW_POLICY_VERSION = 1 as const;

export const DEFAULT_SANDBOX_LIMITS: SandboxRuntimeLimits = {
    maxActiveInstances: 6,
    maxStorageBytes: 64_000,
    maxRequestsPerMinute: 30,
    maxNetworkBytesPerRequest: 128_000,
    maxCrashCount: 3,
    crashWindowMs: 10 * 60 * 1000,
    fuseDurationMs: 30 * 60 * 1000,
};

const permissionOrder: SandboxRuntimePermission[] = [
    'storage',
    'network',
    'openExternal',
    'clipboard.write',
    'notifications',
];

const activeInstances = new Set<string>();

export function getSandboxGrantKey(tileId: string) {
    return `tile:${tileId}`;
}

export function getSandboxCapabilityPermission(capability: TileCapability): SandboxRuntimePermission | null {
    if (capability.type === 'storage') return 'storage';
    if (capability.type === 'network') return 'network';
    if (capability.type === 'openExternal') return 'openExternal';
    if (capability.type === 'clipboard.write') return 'clipboard.write';
    if (capability.type === 'notifications') return 'notifications';
    return null;
}

export function listSandboxRequiredPermissions(definition: Pick<SandboxTileDefinition, 'capabilities'>): SandboxRuntimePermission[] {
    const permissions = new Set<SandboxRuntimePermission>();
    for (const capability of definition.capabilities || []) {
        const permission = getSandboxCapabilityPermission(capability);
        if (permission) permissions.add(permission);
    }
    return permissionOrder.filter((permission) => permissions.has(permission));
}

export function createSandboxGrantRecord(
    tile: Pick<ComponentTile, 'id' | 'tileType'>,
    definition: Pick<SandboxTileDefinition, 'id' | 'capabilities'>,
    permissions: SandboxRuntimePermission[],
    now = Date.now(),
): SandboxGrantRecord {
    const allowed = new Set(listSandboxRequiredPermissions(definition));
    return {
        tileId: tile.id,
        tileType: tile.tileType,
        packageId: definition.id,
        permissions: permissionOrder.filter((permission) => allowed.has(permission) && permissions.includes(permission)),
        grantedAt: Math.round(now),
        updatedAt: Math.round(now),
    };
}

export function getGrantedSandboxPermissions(
    grants: Record<string, SandboxGrantRecord> | undefined,
    tileId: string,
): Set<SandboxRuntimePermission> {
    return new Set(grants?.[getSandboxGrantKey(tileId)]?.permissions || []);
}

export function listMissingSandboxPermissions(
    definition: Pick<SandboxTileDefinition, 'capabilities'>,
    grants: Record<string, SandboxGrantRecord> | undefined,
    tileId: string,
): SandboxRuntimePermission[] {
    const granted = getGrantedSandboxPermissions(grants, tileId);
    return listSandboxRequiredPermissions(definition).filter((permission) => !granted.has(permission));
}

export function hasSandboxPermission(
    definition: Pick<SandboxTileDefinition, 'capabilities'>,
    grants: Record<string, SandboxGrantRecord> | undefined,
    tileId: string,
    permission: SandboxRuntimePermission,
) {
    if (!listSandboxRequiredPermissions(definition).includes(permission)) return false;
    return getGrantedSandboxPermissions(grants, tileId).has(permission);
}

export function registerSandboxInstance(tileId: string, limits: Partial<SandboxRuntimeLimits> = DEFAULT_SANDBOX_LIMITS) {
    const maxActive = Math.max(1, Math.round(Number(limits.maxActiveInstances || DEFAULT_SANDBOX_LIMITS.maxActiveInstances)));
    if (!activeInstances.has(tileId) && activeInstances.size >= maxActive) {
        return {ok: false, activeCount: activeInstances.size, message: `Sandbox 实例数量已达上限 ${maxActive}`};
    }
    activeInstances.add(tileId);
    return {ok: true, activeCount: activeInstances.size};
}

export function unregisterSandboxInstance(tileId: string) {
    activeInstances.delete(tileId);
}

export function getActiveSandboxInstanceCount() {
    return activeInstances.size;
}

export function getSandboxFuseState(
    crashes: Record<string, SandboxCrashRecord> | undefined,
    tileId: string,
    now = Date.now(),
) {
    const crash = crashes?.[getSandboxGrantKey(tileId)];
    if (!crash?.fusedUntil || crash.fusedUntil <= now) return {fused: false as const};
    return {
        fused: true as const,
        until: crash.fusedUntil,
        reason: crash.reason || 'Sandbox 重复崩溃，已临时熔断',
    };
}

export function recordSandboxCrash(
    crashes: Record<string, SandboxCrashRecord> | undefined,
    tile: Pick<ComponentTile, 'id'>,
    definition: Pick<SandboxTileDefinition, 'id'>,
    reason: string,
    limits: Partial<SandboxRuntimeLimits> = DEFAULT_SANDBOX_LIMITS,
    now = Date.now(),
): Record<string, SandboxCrashRecord> {
    const key = getSandboxGrantKey(tile.id);
    const current = crashes?.[key];
    const crashWindowMs = limits.crashWindowMs || DEFAULT_SANDBOX_LIMITS.crashWindowMs;
    const maxCrashCount = limits.maxCrashCount || DEFAULT_SANDBOX_LIMITS.maxCrashCount;
    const firstAt = current && now - current.firstAt <= crashWindowMs ? current.firstAt : now;
    const count = current && now - current.firstAt <= crashWindowMs ? current.count + 1 : 1;
    const fusedUntil = count >= maxCrashCount
        ? now + (limits.fuseDurationMs || DEFAULT_SANDBOX_LIMITS.fuseDurationMs)
        : undefined;
    return {
        ...(crashes || {}),
        [key]: {
            tileId: tile.id,
            packageId: definition.id,
            count,
            firstAt: Math.round(firstAt),
            lastAt: Math.round(now),
            ...(fusedUntil ? {fusedUntil: Math.round(fusedUntil)} : {}),
            reason: reason.slice(0, 240),
        },
    };
}

export function clearSandboxCrash(
    crashes: Record<string, SandboxCrashRecord> | undefined,
    tileId: string,
) {
    const next = {...(crashes || {})};
    delete next[getSandboxGrantKey(tileId)];
    return next;
}

export function isSandboxNetworkUrlAllowed(definition: Pick<SandboxTileDefinition, 'capabilities'>, rawUrl: string) {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const networkCaps = (definition.capabilities || []).filter((capability): capability is Extract<TileCapability, {type: 'network'}> =>
        capability.type === 'network',
    );
    if (!networkCaps.length) return false;
    const hosts = networkCaps.flatMap((capability) => capability.hosts || []);
    return hosts.some((host) => {
        const normalized = host.trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === '*') return true;
        if (normalized.startsWith('*.')) {
            const suffix = normalized.slice(1);
            return url.hostname.toLowerCase().endsWith(suffix);
        }
        return url.hostname.toLowerCase() === normalized;
    });
}

export function evaluateSandboxMarketReview(definition: Pick<SandboxTileDefinition, 'source' | 'audit' | 'capabilities'>) {
    const highRisk = listSandboxRequiredPermissions(definition as Pick<SandboxTileDefinition, 'capabilities'>)
        .filter((permission) => permission === 'network' || permission === 'notifications');
    if (definition.source !== 'sandbox') return {allowed: true, level: 'standard' as const, reasons: [] as string[]};
    if (definition.audit?.status !== 'trusted') {
        return {
            allowed: false,
            level: 'blocked' as const,
            reasons: ['Sandbox JS 必须通过受信审核后才能进入正式市场'],
        };
    }
    if (highRisk.length) {
        return {
            allowed: false,
            level: 'manual-review' as const,
            reasons: [`需要人工审核能力：${highRisk.join(', ')}`],
        };
    }
    return {
        allowed: false,
        level: 'local-experiment' as const,
        reasons: ['P7 仅允许本地高级实验，不进入默认组件市场'],
    };
}

