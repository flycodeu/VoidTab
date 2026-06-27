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

export interface TrustedPackageRecoveryAttempt {
    tileType: ExternalTileType;
    packageId: string;
    status: 'recovered' | 'skipped' | 'failed';
    message: string;
    packageUrl?: string;
    audit?: PackageAuditRecord;
}

export interface TrustedPackageRecoveryResult {
    nextInstalls: Record<string, TileInstallRecord>;
    attempts: TrustedPackageRecoveryAttempt[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const finiteTime = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value)
        : fallback;

function normalizeHttpsUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim()) return undefined;
    try {
        const url = new URL(raw.trim());
        if (url.protocol !== 'https:') return undefined;
        url.username = '';
        url.password = '';
        url.hash = '';
        return url.toString();
    } catch {
        return undefined;
    }
}

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

function normalizeTrustedPublicKey(raw: unknown): PackageTrustIndexEntry['publicKey'] | undefined {
    if (!isRecord(raw)) return undefined;
    if (raw.algorithm !== 'ed25519') return undefined;
    if (typeof raw.keyId !== 'string' || !raw.keyId.trim()) return undefined;
    if (typeof raw.spki !== 'string' || !raw.spki.trim()) return undefined;
    return {
        algorithm: 'ed25519',
        keyId: raw.keyId.trim(),
        spki: raw.spki.trim(),
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

export function normalizePackageTrustIndex(raw: unknown): PackageTrustIndex {
    if (!isRecord(raw) || raw.version !== 1) return EMPTY_PACKAGE_TRUST_INDEX;
    const trustedPackages = Array.isArray(raw.trustedPackages)
        ? raw.trustedPackages
            .filter(isRecord)
            .map((entry): PackageTrustIndexEntry | null => {
                if (typeof entry.packageId !== 'string' || !entry.packageId.trim()) return null;
                if (typeof entry.sha256 !== 'string' || !entry.sha256.trim()) return null;
                if (typeof entry.trustedBy !== 'string' || !entry.trustedBy.trim()) return null;
                const signature = normalizeSignature(entry.signature);
                const publicKey = normalizeTrustedPublicKey(entry.publicKey);
                return {
                    packageId: entry.packageId.trim(),
                    ...(typeof entry.version === 'string' && entry.version.trim() ? {version: entry.version.trim()} : {}),
                    sha256: entry.sha256.trim(),
                    trustedBy: entry.trustedBy.trim(),
                    ...(normalizeHttpsUrl(entry.packageUrl) ? {packageUrl: normalizeHttpsUrl(entry.packageUrl)} : {}),
                    ...(signature ? {signature} : {}),
                    ...(publicKey ? {publicKey} : {}),
                };
            })
            .filter((entry): entry is PackageTrustIndexEntry => !!entry)
        : [];
    const revokedPackages = Array.isArray(raw.revokedPackages)
        ? raw.revokedPackages
            .filter(isRecord)
            .map((entry): PackageRevocationEntry | null => {
                if (typeof entry.reason !== 'string' || !entry.reason.trim()) return null;
                const tileType = typeof entry.tileType === 'string' && isExternalTileType(entry.tileType) ? entry.tileType : undefined;
                const packageId = typeof entry.packageId === 'string' && entry.packageId.trim() ? entry.packageId.trim() : undefined;
                const sha256 = typeof entry.sha256 === 'string' && entry.sha256.trim() ? entry.sha256.trim() : undefined;
                if (!tileType && !packageId && !sha256) return null;
                return {
                    ...(packageId ? {packageId} : {}),
                    ...(tileType ? {tileType} : {}),
                    ...(sha256 ? {sha256} : {}),
                    reason: entry.reason.trim(),
                    revokedAt: finiteTime(entry.revokedAt, 0),
                };
            })
            .filter((entry): entry is PackageRevocationEntry => !!entry)
        : [];

    return {version: 1, trustedPackages, revokedPackages};
}

export async function fetchPackageTrustIndex(url: string, options: {signal?: AbortSignal} = {}): Promise<PackageTrustIndex> {
    const endpoint = url.trim();
    if (!/^https:\/\//i.test(endpoint)) throw new TypeError('信任索引必须通过 HTTPS 获取');
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {'Accept': 'application/json'},
        signal: options.signal,
    });
    if (!response.ok) throw new TypeError(`信任索引获取失败：${response.status}`);
    return normalizePackageTrustIndex(await response.json());
}

export async function fetchTrustedTilePackage(
    url: string,
    options: {signal?: AbortSignal; maxBytes?: number} = {},
): Promise<unknown> {
    const endpoint = normalizeHttpsUrl(url);
    if (!endpoint) throw new TypeError('组件包必须通过 HTTPS 获取');
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {'Accept': 'application/json'},
        credentials: 'omit',
        signal: options.signal,
    });
    if (!response.ok) throw new TypeError(`组件包获取失败：${response.status}`);
    const text = await response.text();
    const maxBytes = Math.max(1024, Math.min(2_000_000, options.maxBytes || 512_000));
    if (textEncoder().encode(text).byteLength > maxBytes) {
        throw new TypeError('组件包超过可信源自动恢复大小上限');
    }
    return JSON.parse(text) as unknown;
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

function intentMatchesTrustedEntry(intent: TileInstallIntent, entry: PackageTrustIndexEntry) {
    return entry.packageId === intent.packageId
        && (!entry.version || entry.version === intent.version)
        && entry.sha256 === intent.sha256
        && signatureMatches(entry.signature, intent.signature);
}

function hasRenderablePackageBody(install: TileInstallRecord | undefined) {
    if (!install || install.enabled === false) return false;
    return install.runtime === 'sandbox'
        ? !!install.manifest && !!install.sandbox
        : !!install.manifest && !!install.views;
}

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, canonicalize(value[key])]),
    );
};

const textEncoder = () => new TextEncoder();

function base64ToBytes(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob !== 'function') throw new TypeError('当前环境不支持 base64 解码');
    return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

export function createPackageSignaturePayload(install: TileInstallRecord): string {
    return JSON.stringify(canonicalize({
        manifest: install.manifest,
        runtime: install.runtime,
        resources: install.resources,
        sha256: install.sha256,
        sandbox: install.sandbox,
        views: install.views,
    }));
}

export async function verifyEd25519PackageSignature(
    install: TileInstallRecord,
    trustedEntry: PackageTrustIndexEntry,
): Promise<boolean> {
    const publicKey = trustedEntry.publicKey;
    const signature = install.manifest?.integrity.signature || install.installIntent?.signature;
    if (!publicKey || !signature || signature.algorithm !== 'ed25519') return false;
    if (publicKey.keyId !== signature.keyId) return false;
    if (!globalThis.crypto?.subtle) return false;
    const key = await globalThis.crypto.subtle.importKey(
        'spki',
        bytesToArrayBuffer(base64ToBytes(publicKey.spki)),
        'Ed25519',
        false,
        ['verify'],
    );
    return globalThis.crypto.subtle.verify(
        'Ed25519',
        key,
        bytesToArrayBuffer(base64ToBytes(signature.value)),
        textEncoder().encode(createPackageSignaturePayload(install)),
    );
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

export async function auditTileInstallRecordWithSignature(
    install: TileInstallRecord,
    trustIndex: PackageTrustIndex = EMPTY_PACKAGE_TRUST_INDEX,
    now = Date.now(),
): Promise<PackageAuditRecord> {
    const normalizedIndex = normalizePackageTrustIndex(trustIndex);
    const audit = auditTileInstallRecord(install, normalizedIndex, now);
    if (audit.status !== 'trusted') return audit;
    const packageId = install.manifest?.id || install.installIntent?.packageId || audit.packageId;
    const trusted = normalizedIndex.trustedPackages.find((entry) => trustedEntryMatches(entry, packageId, install));
    if (!trusted?.publicKey) return audit;
    const verified = await verifyEd25519PackageSignature(install, trusted);
    if (verified) return audit;
    return {
        ...audit,
        status: 'hash-mismatch',
        reason: '组件包 Ed25519 签名验证失败',
    };
}

export function installDeclarativePackageAtomically(
    currentInstalls: Record<string, TileInstallRecord>,
    rawPackage: unknown,
    options: {trustIndex?: PackageTrustIndex; now?: number; source?: 'official' | 'local'} = {},
): PackageInstallTransaction {
    const now = Math.round(options.now ?? Date.now());
    const nextInstalls = cloneJson(currentInstalls);
    try {
        const parsed = parseDeclarativeTilePackage(rawPackage, now);
        const install: TileInstallRecord = {
            ...parsed.install,
            source: options.source === 'official' ? 'official' : parsed.install.source,
        };
        const intent = createTileInstallIntent(install);
        const installWithIntent: TileInstallRecord = {
            ...install,
            ...(intent ? {installIntent: intent} : {}),
        };
        const audit = auditTileInstallRecord(installWithIntent, options.trustIndex || EMPTY_PACKAGE_TRUST_INDEX, now);
        if (audit.status === 'revoked' || audit.status === 'hash-mismatch') {
            return {
                ok: false,
                message: audit.reason || '组件包未通过仓库审核',
                audit,
                nextInstalls: currentInstalls,
            };
        }

        installWithIntent.audit = audit;
        const rollback: PackageInstallRollback = {
            tileType: parsed.tileType,
            ...(currentInstalls[parsed.tileType] ? {previous: cloneJson(currentInstalls[parsed.tileType])} : {}),
        };
        nextInstalls[parsed.tileType] = installWithIntent;
        return {
            ok: true,
            tileType: parsed.tileType,
            install: installWithIntent,
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
    options: {trustIndex?: PackageTrustIndex; now?: number; source?: 'official' | 'local'} = {},
): PackageInstallTransaction {
    const now = Math.round(options.now ?? Date.now());
    const nextInstalls = cloneJson(currentInstalls);
    try {
        const parsed = isRecord(rawPackage)
        && isRecord(rawPackage.manifest)
        && rawPackage.manifest.source === 'sandbox'
            ? parseSandboxTilePackage(rawPackage, now)
            : parseDeclarativeTilePackage(rawPackage, now);
        const install: TileInstallRecord = {
            ...parsed.install,
            source: options.source === 'official' ? 'official' : parsed.install.source,
        };
        const intent = createTileInstallIntent(install);
        const installWithIntent: TileInstallRecord = {
            ...install,
            ...(intent ? {installIntent: intent} : {}),
        };
        const audit = auditTileInstallRecord(installWithIntent, options.trustIndex || EMPTY_PACKAGE_TRUST_INDEX, now);
        if (audit.status === 'revoked' || audit.status === 'hash-mismatch') {
            return {
                ok: false,
                message: audit.reason || '组件包未通过仓库审核',
                audit,
                nextInstalls: currentInstalls,
            };
        }

        installWithIntent.audit = audit;
        const rollback: PackageInstallRollback = {
            tileType: parsed.tileType,
            ...(currentInstalls[parsed.tileType] ? {previous: cloneJson(currentInstalls[parsed.tileType])} : {}),
        };
        nextInstalls[parsed.tileType] = installWithIntent;
        return {
            ok: true,
            tileType: parsed.tileType,
            install: installWithIntent,
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

export function disableTilePackageInstall(
    currentInstalls: Record<string, TileInstallRecord>,
    tileType: string,
    now = Date.now(),
): Record<string, TileInstallRecord> {
    const next = cloneJson(currentInstalls);
    const install = next[tileType];
    if (!install) return next;
    next[tileType] = {
        ...install,
        enabled: false,
        updatedAt: Math.round(now),
    };
    return next;
}

export function enableTilePackageInstall(
    currentInstalls: Record<string, TileInstallRecord>,
    tileType: string,
    now = Date.now(),
): Record<string, TileInstallRecord> {
    const next = cloneJson(currentInstalls);
    const install = next[tileType];
    if (!install) return next;
    next[tileType] = {
        ...install,
        enabled: true,
        updatedAt: Math.round(now),
    };
    return next;
}

export function uninstallTilePackageInstall(
    currentInstalls: Record<string, TileInstallRecord>,
    tileType: string,
): Record<string, TileInstallRecord> {
    const next = cloneJson(currentInstalls);
    delete next[tileType];
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

export async function recoverMissingTilePackagesFromTrustIndex(
    currentInstalls: Record<string, TileInstallRecord>,
    rawIntents: unknown,
    options: {
        trustIndex: PackageTrustIndex;
        now?: number;
        signal?: AbortSignal;
        fetchPackage?: (url: string, options: {signal?: AbortSignal}) => Promise<unknown>;
    },
): Promise<TrustedPackageRecoveryResult> {
    const now = Math.round(options.now ?? Date.now());
    const trustIndex = normalizePackageTrustIndex(options.trustIndex);
    const fetchPackage = options.fetchPackage || ((url: string, fetchOptions: {signal?: AbortSignal}) =>
        fetchTrustedTilePackage(url, fetchOptions));
    const nextInstalls = cloneJson(currentInstalls);
    const attempts: TrustedPackageRecoveryAttempt[] = [];
    const pushAttempt = (intent: TileInstallIntent, attempt: Omit<TrustedPackageRecoveryAttempt, 'tileType' | 'packageId'>) => {
        attempts.push({
            tileType: intent.tileType,
            packageId: intent.packageId,
            ...attempt,
        });
    };

    const intentValues = isRecord(rawIntents)
        ? Object.values(rawIntents)
        : Object.values(currentInstalls)
            .map((install) => install.installIntent)
            .filter(Boolean);

    for (const rawIntent of intentValues) {
        const intent = normalizeTileInstallIntent(rawIntent);
        if (!intent) continue;
        const current = nextInstalls[intent.tileType];
        if (hasRenderablePackageBody(current)) {
            pushAttempt(intent, {status: 'skipped', message: '本机已存在可渲染组件包'});
            continue;
        }
        if (intent.source !== 'official') {
            pushAttempt(intent, {status: 'skipped', message: '非官方来源安装意图不自动联网取回'});
            continue;
        }
        const trusted = trustIndex.trustedPackages.find((entry) => intentMatchesTrustedEntry(intent, entry));
        if (!trusted?.packageUrl) {
            pushAttempt(intent, {status: 'skipped', message: '受信索引未提供 HTTPS 组件包地址'});
            continue;
        }

        try {
            const rawPackage = await fetchPackage(trusted.packageUrl, {signal: options.signal});
            const transaction = installTilePackageAtomically(nextInstalls, rawPackage, {
                trustIndex,
                now,
                source: 'official',
            });
            if (!transaction.ok) {
                pushAttempt(intent, {
                    status: 'failed',
                    message: transaction.message,
                    packageUrl: trusted.packageUrl,
                    ...(transaction.audit ? {audit: transaction.audit} : {}),
                });
                continue;
            }
            if (transaction.tileType !== intent.tileType) {
                pushAttempt(intent, {
                    status: 'failed',
                    message: '可信源返回的组件类型与同步安装意图不一致',
                    packageUrl: trusted.packageUrl,
                    audit: transaction.audit,
                });
                continue;
            }
            if (transaction.install.sha256 !== intent.sha256 || transaction.install.version !== intent.version) {
                pushAttempt(intent, {
                    status: 'failed',
                    message: '可信源返回的组件版本或 hash 与同步安装意图不一致',
                    packageUrl: trusted.packageUrl,
                    audit: transaction.audit,
                });
                continue;
            }
            nextInstalls[transaction.tileType] = transaction.install;
            pushAttempt(intent, {
                status: 'recovered',
                message: '已从受信索引自动取回组件包',
                packageUrl: trusted.packageUrl,
                audit: transaction.audit,
            });
        } catch (error) {
            pushAttempt(intent, {
                status: 'failed',
                message: error instanceof Error ? error.message : '可信源组件包取回失败',
                packageUrl: trusted.packageUrl,
            });
        }
    }

    return {nextInstalls, attempts};
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
