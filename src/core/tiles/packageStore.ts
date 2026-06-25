import type {
    ExternalTileType,
    PackageAuditRecord,
    PackageRevocationEntry,
    PackageSignature,
    PackageTrustIndex,
    PackageTrustIndexEntry,
    TileInstallIntent,
    TileInstallRecord,
} from './contracts.ts';
import {
    createDeclarativeTilePackageExport,
    parseDeclarativeTilePackage,
} from './declarativePackage.ts';
import {
    createSandboxTilePackageExport,
    parseSandboxTilePackage,
} from './sandboxPackage.ts';
import {isExternalTileType, toExternalTileType} from './tileType.ts';

export const EMPTY_PACKAGE_TRUST_INDEX: PackageTrustIndex = {
    version: 1,
    trustedPackages: [],
    revokedPackages: [],
};

export interface PackageInstallRollback {
    tileType: ExternalTileType;
    previous?: TileInstallRecord;
}

export type PackageInstallTransaction =
    | {
    ok: true;
    tileType: ExternalTileType;
    install: TileInstallRecord;
    audit: PackageAuditRecord;
    nextInstalls: Record<string, TileInstallRecord>;
    rollback: PackageInstallRollback;
}
    | {
    ok: false;
    message: string;
    audit?: PackageAuditRecord;
    nextInstalls: Record<string, TileInstallRecord>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const finiteTime = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value)
        : fallback;

function normalizeSignature(raw: unknown): PackageSignature | undefined {
    if (!isRecord(raw)) return undefined;
    if (raw.algorithm !== 'ed25519') return undefined;
    if (typeof raw.keyId !== 'string' || !raw.keyId.trim()) return undefined;
    if (typeof raw.value !== 'string' || !raw.value.trim()) return undefined;
    return {
        algorithm: 'ed25519',
        keyId: raw.keyId.trim(),
        value: raw.value.trim(),
    };
}

export function normalizeTileInstallIntent(raw: unknown): TileInstallIntent | null {
    if (!isRecord(raw) || !isExternalTileType(raw.tileType)) return null;
    const packageId = typeof raw.packageId === 'string' && raw.packageId.trim()
        ? raw.packageId.trim()
        : raw.tileType.slice('external:'.length);
    const runtime = raw.runtime === 'sandbox' ? 'sandbox' : 'declarative';
    const source = raw.source === 'official' ? 'official' : 'local';
    return {
        tileType: raw.tileType,
        packageId,
        version: typeof raw.version === 'string' ? raw.version : '',
        source,
        runtime,
        sha256: typeof raw.sha256 === 'string' ? raw.sha256 : '',
        ...(normalizeSignature(raw.signature) ? {signature: normalizeSignature(raw.signature)} : {}),
    };
}

export function normalizePackageAuditRecord(raw: unknown): PackageAuditRecord | null {
    if (!isRecord(raw) || !isExternalTileType(raw.tileType)) return null;
    if (
        raw.status !== 'trusted'
        && raw.status !== 'untrusted'
        && raw.status !== 'revoked'
        && raw.status !== 'hash-mismatch'
        && raw.status !== 'missing-package'
    ) return null;
    return {
        packageId: typeof raw.packageId === 'string' && raw.packageId.trim()
            ? raw.packageId.trim()
            : raw.tileType.slice('external:'.length),
        tileType: raw.tileType,
        version: typeof raw.version === 'string' ? raw.version : '',
        sha256: typeof raw.sha256 === 'string' ? raw.sha256 : '',
        status: raw.status,
        source: raw.source === 'official' ? 'official' : raw.source === 'builtin' ? 'builtin' : 'local',
        runtime: raw.runtime === 'sandbox' ? 'sandbox' : 'declarative',
        checkedAt: finiteTime(raw.checkedAt, 0),
        ...(normalizeSignature(raw.signature) ? {signature: normalizeSignature(raw.signature)} : {}),
        ...(typeof raw.trustedBy === 'string' && raw.trustedBy.trim() ? {trustedBy: raw.trustedBy.trim()} : {}),
        ...(typeof raw.reason === 'string' && raw.reason.trim() ? {reason: raw.reason.trim()} : {}),
    };
}

export function createTileInstallIntent(install: TileInstallRecord): TileInstallIntent | null {
    if (!isExternalTileType(install.tileType)) return null;
    const packageId = install.manifest?.id || install.installIntent?.packageId || install.tileType.slice('external:'.length);
    const source = install.source === 'official' ? 'official' : 'local';
    const signature = install.manifest?.integrity.signature || install.installIntent?.signature;
    return {
        tileType: install.tileType,
        packageId,
        version: install.version,
        source,
        runtime: install.runtime,
        sha256: install.sha256,
        ...(signature ? {signature: cloneJson(signature)} : {}),
    };
}

export function createTileInstallIntents(installs: Record<string, TileInstallRecord>): Record<string, TileInstallIntent> {
    const intents: Record<string, TileInstallIntent> = {};
    for (const install of Object.values(installs)) {
        const intent = createTileInstallIntent(install);
        if (intent) intents[intent.tileType] = intent;
    }
    return intents;
}

export function createTileInstallStubFromIntent(
    rawIntent: unknown,
    now = Date.now(),
): TileInstallRecord | null {
    const intent = normalizeTileInstallIntent(rawIntent);
    if (!intent) return null;
    return {
        tileType: intent.tileType,
        version: intent.version,
        source: intent.source,
        runtime: intent.runtime,
        sha256: intent.sha256,
        enabled: false,
        installedAt: 0,
        updatedAt: Math.round(now),
        installIntent: intent,
        audit: {
            packageId: intent.packageId,
            tileType: intent.tileType,
            version: intent.version,
            sha256: intent.sha256,
            status: 'missing-package',
            source: intent.source,
            runtime: intent.runtime,
            checkedAt: Math.round(now),
            ...(intent.signature ? {signature: cloneJson(intent.signature)} : {}),
            reason: '同步恢复仅包含安装意图；请在本机导入对应组件包',
        },
    };
}

const revocationMatches = (
    entry: PackageRevocationEntry,
    install: TileInstallRecord,
    packageId: string,
) =>
    (entry.tileType && entry.tileType === install.tileType)
    || (entry.packageId && entry.packageId === packageId)
    || (entry.sha256 && entry.sha256 === install.sha256);

const trustedEntryMatches = (entry: PackageTrustIndexEntry, packageId: string, install: TileInstallRecord) =>
    entry.packageId === packageId
    && (!entry.version || entry.version === install.version);

function signatureMatches(expected: PackageSignature | undefined, actual: PackageSignature | undefined) {
    if (!expected) return true;
    return !!actual
        && actual.algorithm === expected.algorithm
        && actual.keyId === expected.keyId
        && actual.value === expected.value;
}

export function auditTileInstallRecord(
    install: TileInstallRecord,
    trustIndex: PackageTrustIndex = EMPTY_PACKAGE_TRUST_INDEX,
    now = Date.now(),
): PackageAuditRecord {
    const tileType = isExternalTileType(install.tileType)
        ? install.tileType
        : toExternalTileType(install.manifest?.id || 'missing');
    const packageId = install.manifest?.id || install.installIntent?.packageId || tileType.slice('external:'.length);
    const signature = install.manifest?.integrity.signature || install.installIntent?.signature;
    const base: Omit<PackageAuditRecord, 'status'> = {
        packageId,
        tileType,
        version: install.version,
        sha256: install.sha256,
        source: install.source,
        runtime: install.runtime,
        checkedAt: Math.round(now),
        ...(signature ? {signature: cloneJson(signature)} : {}),
    };

    const hasPackageBody = install.runtime === 'sandbox'
        ? !!install.manifest && !!install.sandbox
        : !!install.manifest && !!install.views;
    if (!hasPackageBody || install.enabled === false) {
        return {
            ...base,
            status: 'missing-package',
            reason: '本机缺少可渲染的组件包，仅保留同步恢复的安装意图',
        };
    }

    const revoked = trustIndex.revokedPackages.find((entry) => revocationMatches(entry, install, packageId));
    if (revoked) {
        return {
            ...base,
            status: 'revoked',
            reason: revoked.reason || '组件包已被撤销',
        };
    }

    const trusted = trustIndex.trustedPackages.find((entry) => trustedEntryMatches(entry, packageId, install));
    if (!trusted) {
        return {
            ...base,
            status: 'untrusted',
            reason: '本地导入包未命中受信索引',
        };
    }
    if (trusted.sha256 !== install.sha256 || !signatureMatches(trusted.signature, signature)) {
        return {
            ...base,
            status: 'hash-mismatch',
            trustedBy: trusted.trustedBy,
            reason: '组件包 hash 或签名与受信索引不一致',
        };
    }
    return {
        ...base,
        status: 'trusted',
        trustedBy: trusted.trustedBy,
    };
}

export function installDeclarativePackageAtomically(
    currentInstalls: Record<string, TileInstallRecord>,
    rawPackage: unknown,
    options: {trustIndex?: PackageTrustIndex; now?: number} = {},
): PackageInstallTransaction {
    const now = Math.round(options.now ?? Date.now());
    const nextInstalls = cloneJson(currentInstalls);
    try {
        const parsed = parseDeclarativeTilePackage(rawPackage, now);
        const intent = createTileInstallIntent(parsed.install);
        const install: TileInstallRecord = {
            ...parsed.install,
            ...(intent ? {installIntent: intent} : {}),
        };
        const audit = auditTileInstallRecord(install, options.trustIndex || EMPTY_PACKAGE_TRUST_INDEX, now);
        if (audit.status === 'revoked' || audit.status === 'hash-mismatch') {
            return {
                ok: false,
                message: audit.reason || '组件包未通过仓库审核',
                audit,
                nextInstalls: currentInstalls,
            };
        }

        install.audit = audit;
        const rollback: PackageInstallRollback = {
            tileType: parsed.tileType,
            ...(currentInstalls[parsed.tileType] ? {previous: cloneJson(currentInstalls[parsed.tileType])} : {}),
        };
        nextInstalls[parsed.tileType] = install;
        return {
            ok: true,
            tileType: parsed.tileType,
            install,
            audit,
            nextInstalls,
            rollback,
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : '组件包安装失败',
            nextInstalls: currentInstalls,
        };
    }
}

export function installTilePackageAtomically(
    currentInstalls: Record<string, TileInstallRecord>,
    rawPackage: unknown,
    options: {trustIndex?: PackageTrustIndex; now?: number} = {},
): PackageInstallTransaction {
    const now = Math.round(options.now ?? Date.now());
    const nextInstalls = cloneJson(currentInstalls);
    try {
        const parsed = isRecord(rawPackage)
        && isRecord(rawPackage.manifest)
        && rawPackage.manifest.source === 'sandbox'
            ? parseSandboxTilePackage(rawPackage, now)
            : parseDeclarativeTilePackage(rawPackage, now);
        const intent = createTileInstallIntent(parsed.install);
        const install: TileInstallRecord = {
            ...parsed.install,
            ...(intent ? {installIntent: intent} : {}),
        };
        const audit = auditTileInstallRecord(install, options.trustIndex || EMPTY_PACKAGE_TRUST_INDEX, now);
        if (audit.status === 'revoked' || audit.status === 'hash-mismatch') {
            return {
                ok: false,
                message: audit.reason || '组件包未通过仓库审核',
                audit,
                nextInstalls: currentInstalls,
            };
        }

        install.audit = audit;
        const rollback: PackageInstallRollback = {
            tileType: parsed.tileType,
            ...(currentInstalls[parsed.tileType] ? {previous: cloneJson(currentInstalls[parsed.tileType])} : {}),
        };
        nextInstalls[parsed.tileType] = install;
        return {
            ok: true,
            tileType: parsed.tileType,
            install,
            audit,
            nextInstalls,
            rollback,
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : '组件包安装失败',
            nextInstalls: currentInstalls,
        };
    }
}

export function rollbackTilePackageInstall(
    currentInstalls: Record<string, TileInstallRecord>,
    rollback: PackageInstallRollback,
): Record<string, TileInstallRecord> {
    const next = cloneJson(currentInstalls);
    if (rollback.previous) next[rollback.tileType] = cloneJson(rollback.previous);
    else delete next[rollback.tileType];
    return next;
}

export function createRestoredTileInstallsFromIntents(
    rawIntents: unknown,
    existingInstalls: Record<string, TileInstallRecord> = {},
    now = Date.now(),
): Record<string, TileInstallRecord> {
    const next = cloneJson(existingInstalls);
    if (!isRecord(rawIntents)) return next;
    for (const intent of Object.values(rawIntents)) {
        const stub = createTileInstallStubFromIntent(intent, now);
        if (!stub) continue;
        if (!next[stub.tileType]) next[stub.tileType] = stub;
    }
    return next;
}

export function exportInstalledPackageForAudit(install: TileInstallRecord) {
    const pack = createDeclarativeTilePackageExport(install) || createSandboxTilePackageExport(install);
    if (!pack) return null;
    return {
        package: pack,
        audit: auditTileInstallRecord(install),
        intent: createTileInstallIntent(install),
    };
}
