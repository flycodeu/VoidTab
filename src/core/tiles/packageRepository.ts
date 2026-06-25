import {storage} from '../storage/index.ts';
import type {ExternalTileType, TileInstallRecord} from './contracts.ts';
import {normalizeDeclarativeTileInstallRecord} from './declarativePackage.ts';
import {auditTileInstallRecord, createTileInstallIntent, normalizePackageAuditRecord, normalizeTileInstallIntent} from './packageStore.ts';
import {normalizeSandboxTileInstallRecord} from './sandboxPackage.ts';
import {isExternalTileType} from './tileType.ts';

export const TILE_PACKAGE_REPOSITORY_KEY = 'voidtab.tile-package-repository.v1';

export interface TilePackageRepositoryRecord {
    tileType: ExternalTileType;
    packageId: string;
    version: string;
    runtime: 'declarative' | 'sandbox';
    sha256: string;
    installedAt: number;
    updatedAt: number;
    install: TileInstallRecord;
}

export interface TilePackageRepository {
    version: 1;
    packages: Record<string, TilePackageRepositoryRecord>;
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const emptyRepository = (): TilePackageRepository => ({version: 1, packages: {}});

function normalizeInstall(raw: unknown): TileInstallRecord | null {
    const normalized = normalizeDeclarativeTileInstallRecord(raw) || normalizeSandboxTileInstallRecord(raw);
    if (!normalized || !isRecord(raw)) return normalized;
    const installIntent = normalizeTileInstallIntent(raw.installIntent) || createTileInstallIntent(normalized);
    const audit = normalizePackageAuditRecord(raw.audit)
        || auditTileInstallRecord({...normalized, ...(installIntent ? {installIntent} : {})}, undefined, normalized.updatedAt);
    return {
        ...normalized,
        ...(installIntent ? {installIntent} : {}),
        audit,
    };
}

function normalizeRepositoryRecord(raw: unknown): TilePackageRepositoryRecord | null {
    if (!isRecord(raw) || !isExternalTileType(raw.tileType)) return null;
    const install = normalizeInstall(raw.install);
    if (!install || !isExternalTileType(install.tileType) || install.tileType !== raw.tileType) return null;
    const packageId = install.manifest?.id || install.installIntent?.packageId || install.tileType.slice('external:'.length);
    return {
        tileType: install.tileType,
        packageId,
        version: install.version,
        runtime: install.runtime,
        sha256: install.sha256,
        installedAt: Math.max(0, Math.round(Number(raw.installedAt ?? install.installedAt) || 0)),
        updatedAt: Math.max(0, Math.round(Number(raw.updatedAt ?? install.updatedAt) || 0)),
        install,
    };
}

export function createTilePackageRepositoryRecord(install: TileInstallRecord): TilePackageRepositoryRecord | null {
    if (!isExternalTileType(install.tileType)) return null;
    const normalized = normalizeInstall(install);
    if (!normalized || !isExternalTileType(normalized.tileType)) return null;
    const packageId = normalized.manifest?.id || normalized.installIntent?.packageId || normalized.tileType.slice('external:'.length);
    return {
        tileType: normalized.tileType,
        packageId,
        version: normalized.version,
        runtime: normalized.runtime,
        sha256: normalized.sha256,
        installedAt: normalized.installedAt,
        updatedAt: normalized.updatedAt,
        install: normalized,
    };
}

export function normalizeTilePackageRepository(raw: unknown): TilePackageRepository {
    if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.packages)) return emptyRepository();
    const repository = emptyRepository();
    for (const value of Object.values(raw.packages)) {
        const record = normalizeRepositoryRecord(value);
        if (record) repository.packages[record.tileType] = record;
    }
    return repository;
}

export async function loadTilePackageRepository(): Promise<TilePackageRepository> {
    const raw = await storage.get<unknown>(TILE_PACKAGE_REPOSITORY_KEY, emptyRepository(), 'local');
    return normalizeTilePackageRepository(raw);
}

export async function saveTilePackageRepository(repository: TilePackageRepository): Promise<void> {
    await storage.set(TILE_PACKAGE_REPOSITORY_KEY, normalizeTilePackageRepository(repository), 'local');
}

export async function upsertTilePackageRepositoryRecord(install: TileInstallRecord): Promise<TilePackageRepositoryRecord | null> {
    const record = createTilePackageRepositoryRecord(install);
    if (!record) return null;
    const repository = await loadTilePackageRepository();
    repository.packages[record.tileType] = record;
    await saveTilePackageRepository(repository);
    return cloneJson(record);
}

export async function removeTilePackageRepositoryRecord(tileType: ExternalTileType): Promise<void> {
    const repository = await loadTilePackageRepository();
    delete repository.packages[tileType];
    await saveTilePackageRepository(repository);
}

export async function hydrateTileInstallsFromRepository(
    installs: Record<string, TileInstallRecord>,
): Promise<Record<string, TileInstallRecord>> {
    const repository = await loadTilePackageRepository();
    const next = cloneJson(installs);
    for (const [tileType, record] of Object.entries(repository.packages)) {
        const current = next[tileType];
        if (!current || current.audit?.status === 'missing-package' || current.enabled === false) {
            next[tileType] = cloneJson(record.install);
        }
    }
    return next;
}
