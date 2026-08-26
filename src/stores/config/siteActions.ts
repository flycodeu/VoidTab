import type {Ref} from 'vue';
import type {ConfigV6, SandboxRuntimeLimits, SandboxRuntimePermission, SiteItem} from '../../core/config/types';
import type {
    ComponentTile,
    DeclarativeTileDefinition,
    ExternalTileType,
    HostFeature,
    JsonValue,
    SandboxTileDefinition,
    SiteTile,
    TileInstance,
    TileStyleOverride,
    Workspace,
} from '../../core/tiles/contracts.ts';
import {parseBookmarkContent} from '../../shared/utils/bookmarkImporter';
import {createBookmarkUrlKey, dedupeImportedBookmarkGroups} from '../../shared/utils/bookmarkImportDedup';
import {clampInt, createTextIconValue, generateColor, MAX_WIDGET_H, MAX_WIDGET_W, normalizeSiteIconType} from './helpers';
import {exportTileInstance as createTileInstanceExport, importTileInstance} from '../../core/tiles/instanceSharing.ts';
import {resolveTileDefinition} from '../../core/tiles/registry.ts';
import {applyTileStyleOverride, resetTileStyleOverride as resetCanonicalTileStyleOverride} from '../../core/tiles/style.ts';
import {
    createDeclarativeTilePackageExport,
} from '../../core/tiles/declarativePackage.ts';
import {createSandboxTilePackageExport} from '../../core/tiles/sandboxPackage.ts';
import {
    disableTilePackageInstall,
    enableTilePackageInstall,
    installDeclarativePackageAtomically,
    installTilePackageAtomically,
    recoverMissingTilePackagesFromTrustIndex,
    uninstallTilePackageInstall,
} from '../../core/tiles/packageStore.ts';
import {fetchOfficialTileTrustIndex} from '../../core/tiles/officialSource.ts';
import {upsertTilePackageRepositoryRecord} from '../../core/tiles/packageRepository.ts';
import {createSyncRecoveryRecords} from '../../core/sync/recovery.ts';
import {migrateTileSettingsAcrossSchemaVersions, normalizeTileSettingsWithSchema} from '../../core/tiles/settingsSchema.ts';
import {
    createTileCapabilityGrantRecord,
    describeExpandedHostCapabilities,
    getTileCapabilityGrantKey,
    listRequiredTileHostFeatures,
    requestOptionalExtensionHostPermission,
} from '../../core/tiles/capabilityGrants.ts';
import {
    clearSandboxCrash as clearSandboxCrashRecord,
    createSandboxGrantRecord,
    DEFAULT_SANDBOX_LIMITS,
    getSandboxGrantKey,
    listSandboxRequiredPermissions,
    recordSandboxCrash as recordSandboxCrashRecord,
} from '../../core/tiles/sandboxRuntime.ts';
import {
    createExternalComponentTile,
    createSiteTile as createCanonicalSiteTile,
    createWorkspace,
    findTile,
    findWorkspace,
    isComponentTile,
    isSiteTile,
    removeTile as removeCanonicalTile,
    setWorkspaceTiles,
    setTileSize,
    touchRevision,
    updateTile as updateCanonicalTile,
} from '../../core/tiles/tileAccess.ts';

type GroupInput = Partial<Pick<Workspace, 'title' | 'icon' | 'iconColor' | 'iconBgColor' | 'sortKey' | 'workspaceLayout'>> & {
    title?: string;
    icon?: string;
};

type SiteInput = Partial<Omit<SiteTile, 'tileType' | 'layouts' | 'revision'>> & {w?: number; h?: number};

type SitePatch = Partial<Omit<SiteTile, 'tileType' | 'layouts' | 'revision'>> & {
    w?: number;
    h?: number;
    tags?: unknown;
};

export const createSiteActions = (
    config: Ref<ConfigV6>,
    saveConfig: () => Promise<void>
) => {
    const createUniqueTileId = () => {
        const existing = new Set(config.value.layout.flatMap((group) => group.tiles.map((tile) => tile.id)));
        let candidate = '';
        do {
            const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14);
            candidate = 'tile-' + Date.now() + '-' + randomId;
        } while (existing.has(candidate));
        return candidate;
    };

    const createUniqueWorkspaceId = () => {
        const existing = new Set(config.value.layout.map((group) => group.id));
        let candidate = '';
        do {
            const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14);
            candidate = 'workspace-' + Date.now() + '-' + randomId;
        } while (existing.has(candidate));
        return candidate;
    };

    const addGroup = (group: GroupInput) => {
        const nextGroup = createWorkspace({
            ...group,
            id: createUniqueWorkspaceId(),
            title: group.title || '新分组',
            icon: group.icon || 'SquaresFour',
        });
        config.value.layout.push(nextGroup);
        void saveConfig();
    };

    const removeGroup = (groupId: string) => {
        const index = config.value.layout.findIndex((group) => group.id === groupId);
        if (index >= 0) {
            const [removed] = config.value.layout.splice(index, 1);
            for (const tile of removed?.tiles || []) {
                if (isComponentTile(tile)) purgeSandboxInstanceState(tile.id);
            }
            void saveConfig();
        }
    };

    const updateGroup = (groupId: string, data: Partial<Workspace>) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (group) {
            Object.assign(group, data);
            void saveConfig();
        }
    };

    const addSite = (groupId: string, site: SiteInput) => {
        const group = findWorkspace(config.value, groupId);
        if (!group) return;

        const now = Date.now();
        const payload = createCanonicalSiteTile({
            id: createUniqueTileId(),
            title: site.title || '',
            url: site.url || '',
            bgColor: site.bgColor || '#3b82f6',
            iconType: normalizeSiteIconType(site.iconType),
            iconValue: site.iconValue || '',
            icon: site.icon || '',
            remark: typeof site.remark === 'string' ? site.remark : '',
            createdAt: typeof site.createdAt === 'number' ? site.createdAt : now,
            layouts: {desktop: {
                x: 0,
                y: 0,
                w: clampInt(site.w, 1, MAX_WIDGET_W, 1),
                h: clampInt(site.h, 1, MAX_WIDGET_H, 1),
            }},
        });

        group.tiles.push(payload);
        void saveConfig();
    };

    const updateSite = (groupId: string, siteId: string, data: SitePatch) => {
        const group = findWorkspace(config.value, groupId);
        if (!group) return;

        const site = findTile(group, siteId);
        if (!site) return;

        const patch: SitePatch = {...data};

        if ('remark' in patch && typeof patch.remark !== 'string') {
            patch.remark = '';
        }

        if ('iconType' in patch) {
            patch.iconType = normalizeSiteIconType(patch.iconType);
        }

        if ('tags' in patch) {
            if (Array.isArray(patch.tags)) {
                patch.tags = patch.tags
                    .filter((tag): tag is string => typeof tag === 'string')
                    .map((t: string) => t.trim())
                    .filter(Boolean)
                    .slice(0, 20);
            } else {
                patch.tags = [];
            }
        }

        if (!isSiteTile(site)) return;
        const w = clampInt(patch.w ?? site.layouts.desktop.w, 1, MAX_WIDGET_W, 1);
        const h = clampInt(patch.h ?? site.layouts.desktop.h, 1, MAX_WIDGET_H, 1);
        delete patch.w;
        delete patch.h;
        updateCanonicalTile(site, patch);
        setTileSize(site, w, h);
        void saveConfig();
    };

    // Remove the persisted localStorage written by a sandbox tile instance so a
    // deleted component does not keep occupying browser storage quota.
    const clearSandboxInstanceStorage = (tileId: string) => {
        if (typeof window === 'undefined' || !window.localStorage || !tileId) return;
        const prefix = 'voidtab:sandbox-storage:v1:';
        const marker = `:${tileId}:`;
        const stale: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key && key.startsWith(prefix) && key.includes(marker)) stale.push(key);
        }
        for (const key of stale) window.localStorage.removeItem(key);
    };

    // Drop every trace of one sandbox instance: granted/revoked permissions,
    // crash/fuse records and its local storage.
    const purgeSandboxInstanceState = (tileId: string) => {
        const runtime = config.value.runtime.sandbox;
        if (runtime) {
            const key = getSandboxGrantKey(tileId);
            const grants = {...(runtime.grants || {})};
            const revoked = {...(runtime.revoked || {})};
            const crashes = {...(runtime.crashes || {})};
            let changed = false;
            if (grants[key]) { delete grants[key]; changed = true; }
            if (revoked[key]) { delete revoked[key]; changed = true; }
            if (crashes[key]) { delete crashes[key]; changed = true; }
            if (changed) config.value.runtime.sandbox = {...runtime, grants, revoked, crashes};
        }
        clearSandboxInstanceStorage(tileId);
    };

    // Clean sandbox state for every instance of an uninstalled package.
    const purgeSandboxStateForTileType = (tileType: string, packageId?: string) => {
        const runtime = config.value.runtime.sandbox;
        const affected = new Set<string>();
        const match = (record?: {tileId?: string; tileType?: string; packageId?: string}) => {
            if (!record?.tileId) return;
            if (record.tileType === tileType || (packageId && record.packageId === packageId)) {
                affected.add(record.tileId);
            }
        };
        Object.values(runtime?.grants || {}).forEach(match);
        Object.values(runtime?.revoked || {}).forEach(match);
        Object.values(runtime?.crashes || {}).forEach(match);
        for (const group of config.value.layout) {
            for (const tile of group.tiles) {
                if (isComponentTile(tile) && tile.tileType === tileType) affected.add(tile.id);
            }
        }
        for (const tileId of affected) purgeSandboxInstanceState(tileId);
    };

    // One-shot sweep that removes grants/crashes/storage left behind by instances
    // that no longer exist in any group (e.g. historical leftovers). Returns the
    // number of distinct instances cleaned.
    const pruneOrphanSandboxGrants = () => {
        const runtime = config.value.runtime.sandbox;
        if (!runtime) return 0;
        const live = new Set<string>();
        for (const group of config.value.layout) {
            for (const tile of group.tiles) {
                if (isComponentTile(tile)) live.add(tile.id);
            }
        }
        const grants = {...(runtime.grants || {})};
        const revoked = {...(runtime.revoked || {})};
        const crashes = {...(runtime.crashes || {})};
        const removed = new Set<string>();
        const sweep = (map: Record<string, {tileId?: string}>) => {
            for (const [key, record] of Object.entries(map)) {
                if (record?.tileId && !live.has(record.tileId)) {
                    delete map[key];
                    removed.add(record.tileId);
                }
            }
        };
        sweep(grants);
        sweep(revoked);
        sweep(crashes);
        if (removed.size) {
            for (const tileId of removed) clearSandboxInstanceStorage(tileId);
            config.value.runtime.sandbox = {...runtime, grants, revoked, crashes};
            void saveConfig();
        }
        return removed.size;
    };

    const removeSite = (groupId: string, siteId: string) => {
        const group = findWorkspace(config.value, groupId);
        if (group) {
            removeCanonicalTile(group, siteId);
            purgeSandboxInstanceState(siteId);
            void saveConfig();
        }
    };

    const reorderItems = (groupId: string, newItems: TileInstance[]) => {
        const group = findWorkspace(config.value, groupId);
        if (group) {
            setWorkspaceTiles(group, newItems);
            void saveConfig();
        }
    };

    const moveSite = (fromGroupId: string, toGroupId: string, siteId: string) => {
        const fromGroup = findWorkspace(config.value, fromGroupId);
        const toGroup = findWorkspace(config.value, toGroupId);
        if (fromGroup && toGroup) {
            const site = removeCanonicalTile(fromGroup, siteId);
            if (site) {
                toGroup.tiles.push(site);
                void saveConfig();
            }
        }
    };

    const updateTileStyleOverride = (
        groupId: string,
        tileId: string,
        styleOverride: TileStyleOverride,
    ) => {
        const group = findWorkspace(config.value, groupId);
        const tile = findTile(group, tileId);
        if (!tile) return false;

        applyTileStyleOverride(tile, styleOverride, resolveTileDefinition(tile.tileType, config.value.tileInstalls));
        touchRevision(tile);
        void saveConfig();
        return true;
    };

    const resetTileStyleOverride = (groupId: string, tileId: string) => {
        const group = findWorkspace(config.value, groupId);
        const tile = findTile(group, tileId);
        if (!tile) return false;

        resetCanonicalTileStyleOverride(tile);
        touchRevision(tile);
        void saveConfig();
        return true;
    };

    const updateComponentTileSettings = (tileId: string, settings: Record<string, JsonValue>) => {
        for (const group of config.value.layout) {
            const tile = findTile(group, tileId);
            if (!tile || !isComponentTile(tile)) continue;

            const definition = resolveTileDefinition(tile.tileType, config.value.tileInstalls);
            const defaults = 'defaultSettings' in definition ? definition.defaultSettings : undefined;
            const schema = 'settingsSchema' in definition ? definition.settingsSchema : undefined;
            const normalized = normalizeTileSettingsWithSchema(settings, schema, {defaults});
            updateCanonicalTile(tile, {settings: normalized.settings} as Partial<ComponentTile>);
            void saveConfig();
            return {success: true, issues: normalized.issues, changed: normalized.changed};
        }

        return {
            success: false,
            issues: [{path: '', message: '未找到组件实例', severity: 'error' as const}],
            changed: false,
        };
    };

    const migrateComponentTileSettings = (tileId: string, previousSchema?: unknown) => {
        for (const group of config.value.layout) {
            const tile = findTile(group, tileId);
            if (!tile || !isComponentTile(tile)) continue;

            const definition = resolveTileDefinition(tile.tileType, config.value.tileInstalls);
            const defaults = 'defaultSettings' in definition ? definition.defaultSettings : undefined;
            const schema = 'settingsSchema' in definition ? definition.settingsSchema : undefined;
            const result = migrateTileSettingsAcrossSchemaVersions(tile.settings, previousSchema, schema, {defaults});
            if (result.migrated || result.changed) {
                updateCanonicalTile(tile, {settings: result.settings} as Partial<ComponentTile>);
                void saveConfig();
            }
            return {success: true, ...result};
        }

        return {
            success: false,
            settings: {},
            issues: [{path: '', message: '未找到组件实例', severity: 'error' as const}],
            changed: false,
            migrated: false,
            renamed: [],
            removed: [],
            added: [],
        };
    };

    const migrateSettingsForTileType = (tileType: string, previousSchema?: unknown) => {
        let migratedCount = 0;
        for (const group of config.value.layout) {
            for (const tile of group.tiles) {
                if (!isComponentTile(tile) || tile.tileType !== tileType) continue;
                const definition = resolveTileDefinition(tile.tileType, config.value.tileInstalls);
                const defaults = 'defaultSettings' in definition ? definition.defaultSettings : undefined;
                const schema = 'settingsSchema' in definition ? definition.settingsSchema : undefined;
                const result = migrateTileSettingsAcrossSchemaVersions(tile.settings, previousSchema, schema, {defaults});
                if (!result.migrated && !result.changed) continue;
                updateCanonicalTile(tile, {settings: result.settings} as Partial<ComponentTile>);
                migratedCount += 1;
            }
        }
        return migratedCount;
    };

    const resolveCapabilityTile = (tileId: string) => {
        for (const group of config.value.layout) {
            const tile = findTile(group, tileId);
            if (!tile || !isComponentTile(tile)) continue;
            const definition = resolveTileDefinition(tile.tileType, config.value.tileInstalls);
            if (definition.renderer.kind === 'unsupported') return null;
            return {tile, definition};
        }
        return null;
    };

    const grantTileCapabilities = (
        tileId: string,
        features?: HostFeature[],
    ) => {
        const resolved = resolveCapabilityTile(tileId);
        if (!resolved) return false;
        if (!('compatibility' in resolved.definition)) return false;
        if (resolved.definition.renderer.kind === 'sandbox') return false;

        const required = listRequiredTileHostFeatures(resolved.definition);
        const selected = features?.length ? features : required;
        if (!selected.length) return true;
        const runtime = config.value.runtime.tileGrants || {grants: {}, revoked: {}};
        const key = getTileCapabilityGrantKey(tileId);
        const revoked = {...(runtime.revoked || {})};
        delete revoked[key];
        config.value.runtime.tileGrants = {
            ...runtime,
            grants: {
                ...(runtime.grants || {}),
                [key]: createTileCapabilityGrantRecord(resolved.tile, resolved.definition, selected),
            },
            revoked,
        };
        void saveConfig();
        return true;
    };

    const revokeTileCapabilities = (tileId: string) => {
        const runtime = config.value.runtime.tileGrants || {grants: {}, revoked: {}};
        const key = getTileCapabilityGrantKey(tileId);
        const current = runtime.grants?.[key];
        if (!current) return false;

        const grants = {...(runtime.grants || {})};
        delete grants[key];
        config.value.runtime.tileGrants = {
            ...runtime,
            grants,
            revoked: {
                ...(runtime.revoked || {}),
                [key]: {
                    ...current,
                    updatedAt: Date.now(),
                },
            },
        };
        void saveConfig();
        return true;
    };

    const requestOptionalHostPermission = (origin: string) => requestOptionalExtensionHostPermission(origin);

    const invalidateTileCapabilityGrantsForTileType = (tileType: string) => {
        const runtime = config.value.runtime.tileGrants || {grants: {}, revoked: {}};
        const grants = {...(runtime.grants || {})};
        const revoked = {...(runtime.revoked || {})};
        let invalidated = 0;
        for (const group of config.value.layout) {
            for (const tile of group.tiles) {
                if (!isComponentTile(tile) || tile.tileType !== tileType) continue;
                const key = getTileCapabilityGrantKey(tile.id);
                const current = grants[key];
                if (!current) continue;
                delete grants[key];
                revoked[key] = {...current, updatedAt: Date.now()};
                invalidated += 1;
            }
        }
        if (invalidated > 0) config.value.runtime.tileGrants = {...runtime, grants, revoked};
        return invalidated;
    };

    const exportTileInstanceForShare = (groupId: string, tileId: string) => {
        const group = findWorkspace(config.value, groupId);
        const tile = findTile(group, tileId);
        return tile ? createTileInstanceExport(tile) : null;
    };

    const importTileInstanceToGroup = (groupId: string, raw: unknown) => {
        const group = findWorkspace(config.value, groupId);
        if (!group) return {success: false, message: '目标分组不存在'};

        try {
            const tile = importTileInstance(raw, {id: createUniqueTileId(), now: Date.now()});
            group.tiles.push(tile);
            void saveConfig();
            return {success: true, tile};
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : '导入卡片实例失败',
            };
        }
    };

    const importDeclarativeTilePackage = (raw: unknown) => {
        const previousInstall = (() => {
            const candidate = installDeclarativePackageAtomically(config.value.tileInstalls, raw);
            return candidate.ok ? config.value.tileInstalls[candidate.tileType] : undefined;
        })();
        const transaction = installDeclarativePackageAtomically(config.value.tileInstalls, raw);
        if (transaction.ok) {
            config.value.tileInstalls = transaction.nextInstalls;
            const reauthorization = previousInstall && transaction.install.manifest
                ? describeExpandedHostCapabilities(previousInstall, {manifest: transaction.install.manifest})
                : {needsReauthorization: false, expandedFeatures: [], expandedHosts: []};
            const invalidatedGrantCount = reauthorization.needsReauthorization
                ? invalidateTileCapabilityGrantsForTileType(transaction.tileType)
                : 0;
            const migratedSettingsCount = migrateSettingsForTileType(
                transaction.tileType,
                previousInstall?.manifest?.settingsSchema,
            );
            void upsertTilePackageRepositoryRecord(transaction.install);
            void saveConfig();
            return {
                success: true,
                tileType: transaction.tileType,
                label: transaction.install.manifest?.metadata.label || transaction.tileType,
                auditStatus: transaction.audit.status,
                reauthorization: {
                    ...reauthorization,
                    invalidatedGrantCount,
                },
                migratedSettingsCount,
            };
        }
        try {
            return {
                success: false,
                message: transaction.message,
            };
        } catch {
            return {success: false, message: '声明式组件导入失败'};
        }
    };

    const importTilePackage = (raw: unknown) => {
        const previousInstall = (() => {
            const candidate = installTilePackageAtomically(config.value.tileInstalls, raw);
            return candidate.ok ? config.value.tileInstalls[candidate.tileType] : undefined;
        })();
        const transaction = installTilePackageAtomically(config.value.tileInstalls, raw);
        if (transaction.ok) {
            config.value.tileInstalls = transaction.nextInstalls;
            const reauthorization = previousInstall && transaction.install.manifest
                ? describeExpandedHostCapabilities(previousInstall, {manifest: transaction.install.manifest})
                : {needsReauthorization: false, expandedFeatures: [], expandedHosts: []};
            const invalidatedGrantCount = reauthorization.needsReauthorization
                ? invalidateTileCapabilityGrantsForTileType(transaction.tileType)
                : 0;
            const migratedSettingsCount = migrateSettingsForTileType(
                transaction.tileType,
                previousInstall?.manifest?.settingsSchema,
            );
            void upsertTilePackageRepositoryRecord(transaction.install);
            void saveConfig();
            return {
                success: true,
                tileType: transaction.tileType,
                runtime: transaction.install.runtime,
                label: transaction.install.manifest?.metadata.label || transaction.tileType,
                auditStatus: transaction.audit.status,
                reauthorization: {
                    ...reauthorization,
                    invalidatedGrantCount,
                },
                migratedSettingsCount,
            };
        }
        return {
            success: false,
            message: transaction.message,
        };
    };

    const recoverOfficialTilePackages = async (trustIndexUrl?: string) => {
        try {
            const trustIndex = await fetchOfficialTileTrustIndex({url: trustIndexUrl});
            const recovery = await recoverMissingTilePackagesFromTrustIndex(config.value.tileInstalls, undefined, {
                trustIndex,
                now: Date.now(),
            });
            const recovered = recovery.attempts.filter((attempt) => attempt.status === 'recovered');
            if (!recovered.length) {
                return {
                    success: false,
                    recoveredCount: 0,
                    attempts: recovery.attempts,
                    message: '没有可从受信索引自动取回的缺失组件包',
                };
            }

            config.value.tileInstalls = recovery.nextInstalls;
            await Promise.all(recovered.map(async (attempt) => {
                const install = config.value.tileInstalls[attempt.tileType];
                if (install) await upsertTilePackageRepositoryRecord(install);
            }));
            config.value.sync.recoveryRecords = createSyncRecoveryRecords(config.value, {now: Date.now()});
            await saveConfig();
            return {
                success: true,
                recoveredCount: recovered.length,
                attempts: recovery.attempts,
                message: `已从受信索引取回 ${recovered.length} 个组件包`,
            };
        } catch (error) {
            return {
                success: false,
                recoveredCount: 0,
                attempts: [],
                message: error instanceof Error ? error.message : '可信源组件包恢复失败',
            };
        }
    };

    const exportDeclarativeTilePackage = (tileType: string) => {
        const install = config.value.tileInstalls[tileType];
        return install ? createDeclarativeTilePackageExport(install) : null;
    };

    const exportTilePackage = (tileType: string) => {
        const install = config.value.tileInstalls[tileType];
        return install
            ? createDeclarativeTilePackageExport(install) || createSandboxTilePackageExport(install)
            : null;
    };

    const disableTilePackage = (tileType: string) => {
        if (!config.value.tileInstalls[tileType]) return false;
        config.value.tileInstalls = disableTilePackageInstall(config.value.tileInstalls, tileType);
        void saveConfig();
        return true;
    };

    const enableTilePackage = (tileType: string) => {
        if (!config.value.tileInstalls[tileType]) return false;
        config.value.tileInstalls = enableTilePackageInstall(config.value.tileInstalls, tileType);
        void saveConfig();
        return true;
    };

    const uninstallTilePackage = (tileType: string) => {
        const install = config.value.tileInstalls[tileType];
        if (!install) return false;
        const packageId = install.manifest?.id;
        config.value.tileInstalls = uninstallTilePackageInstall(config.value.tileInstalls, tileType);
        invalidateTileCapabilityGrantsForTileType(tileType);
        purgeSandboxStateForTileType(tileType, packageId);
        void saveConfig();
        return true;
    };

    const downgradeTilePackage = (raw: unknown) => importTilePackage(raw);

    const addExternalTile = (groupId: string, tileType: ExternalTileType) => {
        const group = findWorkspace(config.value, groupId);
        const definition = resolveTileDefinition(tileType, config.value.tileInstalls);
        if (!group || (definition.renderer.kind !== 'declarative' && definition.renderer.kind !== 'sandbox')) {
            return {success: false, message: '外部组件未安装或不可用'};
        }
        const externalDefinition = definition as DeclarativeTileDefinition | SandboxTileDefinition;

        const now = Date.now();
        const desktop = externalDefinition.sizes.default;
        const mobile = externalDefinition.sizes.mobileFallback || {
            w: Math.min(desktop.w, 2),
            h: desktop.h,
        };
        const tile = createExternalComponentTile(tileType, {
            id: createUniqueTileId(),
            title: externalDefinition.label,
            settings: externalDefinition.defaultSettings,
            createdAt: now,
            layouts: {
                desktop: {x: 0, y: 0, w: desktop.w, h: desktop.h},
                tablet: {x: 0, y: 0, w: desktop.w, h: desktop.h},
                mobile: {x: 0, y: 0, w: mobile.w, h: mobile.h},
            },
        });
        group.tiles.push(tile);
        void saveConfig();
        return {success: true, tile};
    };

    const addDeclarativeTile = (groupId: string, tileType: ExternalTileType) => {
        const definition = resolveTileDefinition(tileType, config.value.tileInstalls);
        if (definition.renderer.kind !== 'declarative') {
            return {success: false, message: '声明式组件未安装或不可用'};
        }
        return addExternalTile(groupId, tileType);
    };

    const setSandboxRuntimeEnabled = (enabled: boolean) => {
        config.value.runtime.sandbox = {
            ...(config.value.runtime.sandbox || {enabled: false}),
            enabled,
        };
        void saveConfig();
    };

    const resolveSandboxRuntimeTile = (tileId: string) => {
        for (const group of config.value.layout) {
            const tile = findTile(group, tileId);
            if (!tile || !isComponentTile(tile)) continue;
            const definition = resolveTileDefinition(tile.tileType, config.value.tileInstalls);
            if (definition.renderer.kind !== 'sandbox') return null;
            return {tile, definition: definition as SandboxTileDefinition};
        }
        return null;
    };

    const clampSandboxLimit = (
        value: unknown,
        min: number,
        max: number,
        fallback: number,
    ) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(min, Math.min(max, Math.round(numeric)));
    };

    const normalizeSandboxLimits = (
        patch: Partial<SandboxRuntimeLimits>,
        current: Partial<SandboxRuntimeLimits> = {},
    ): SandboxRuntimeLimits => {
        const source = {...DEFAULT_SANDBOX_LIMITS, ...current, ...patch};
        return {
            maxActiveInstances: clampSandboxLimit(source.maxActiveInstances, 1, 24, DEFAULT_SANDBOX_LIMITS.maxActiveInstances),
            maxStorageBytes: clampSandboxLimit(source.maxStorageBytes, 4_096, 1_048_576, DEFAULT_SANDBOX_LIMITS.maxStorageBytes),
            maxRequestsPerMinute: clampSandboxLimit(source.maxRequestsPerMinute, 5, 240, DEFAULT_SANDBOX_LIMITS.maxRequestsPerMinute),
            maxNetworkBytesPerRequest: clampSandboxLimit(source.maxNetworkBytesPerRequest, 16_384, 1_048_576, DEFAULT_SANDBOX_LIMITS.maxNetworkBytesPerRequest),
            maxCrashCount: clampSandboxLimit(source.maxCrashCount, 1, 20, DEFAULT_SANDBOX_LIMITS.maxCrashCount),
            crashWindowMs: clampSandboxLimit(source.crashWindowMs, 60_000, 86_400_000, DEFAULT_SANDBOX_LIMITS.crashWindowMs),
            fuseDurationMs: clampSandboxLimit(source.fuseDurationMs, 60_000, 86_400_000, DEFAULT_SANDBOX_LIMITS.fuseDurationMs),
        };
    };

    const updateSandboxRuntimeLimits = (limits: Partial<SandboxRuntimeLimits>) => {
        const runtime = config.value.runtime.sandbox || {enabled: false};
        config.value.runtime.sandbox = {
            ...runtime,
            limits: normalizeSandboxLimits(limits, runtime.limits),
        };
        void saveConfig();
    };

    const grantSandboxPermissions = (
        tileId: string,
        permissions?: SandboxRuntimePermission[],
    ) => {
        const resolved = resolveSandboxRuntimeTile(tileId);
        if (!resolved) return false;

        const runtime = config.value.runtime.sandbox || {enabled: false};
        const required = listSandboxRequiredPermissions(resolved.definition);
        const selected = permissions?.length ? permissions : required;
        const record = createSandboxGrantRecord(resolved.tile, resolved.definition, selected);
        const key = getSandboxGrantKey(tileId);
        const revoked = {...(runtime.revoked || {})};
        delete revoked[key];

        config.value.runtime.sandbox = {
            ...runtime,
            grants: {
                ...(runtime.grants || {}),
                [key]: record,
            },
            revoked,
        };
        void saveConfig();
        return true;
    };

    const revokeSandboxPermissions = (tileId: string) => {
        const runtime = config.value.runtime.sandbox || {enabled: false};
        const key = getSandboxGrantKey(tileId);
        const current = runtime.grants?.[key];
        if (!current) return false;

        const grants = {...(runtime.grants || {})};
        delete grants[key];
        config.value.runtime.sandbox = {
            ...runtime,
            grants,
            revoked: {
                ...(runtime.revoked || {}),
                [key]: {
                    ...current,
                    updatedAt: Date.now(),
                },
            },
        };
        void saveConfig();
        return true;
    };

    const recordSandboxCrash = (tileId: string, reason: string) => {
        const resolved = resolveSandboxRuntimeTile(tileId);
        if (!resolved) return false;
        const runtime = config.value.runtime.sandbox || {enabled: false};
        config.value.runtime.sandbox = {
            ...runtime,
            crashes: recordSandboxCrashRecord(
                runtime.crashes,
                resolved.tile,
                resolved.definition,
                reason,
                runtime.limits || DEFAULT_SANDBOX_LIMITS,
            ),
        };
        void saveConfig();
        return true;
    };

    const clearSandboxCrash = (tileId: string) => {
        const runtime = config.value.runtime.sandbox || {enabled: false};
        config.value.runtime.sandbox = {
            ...runtime,
            crashes: clearSandboxCrashRecord(runtime.crashes, tileId),
        };
        void saveConfig();
        return true;
    };

    const importBookmarks = (htmlContent: string) => {
        const result = parseBookmarkContent(htmlContent);
        if (result.success && result.groups.length > 0) {
            const now = Date.now();
            const deduped = dedupeImportedBookmarkGroups(result.groups, config.value.layout);

            deduped.groups.forEach((group) => {
                group.items.forEach((item: SiteItem) => {
                    item.w = clampInt(item.w, 1, MAX_WIDGET_W, 1);
                    item.h = clampInt(item.h, 1, MAX_WIDGET_H, 1);

                    if (typeof item.remark !== 'string') item.remark = '';
                    if (!Array.isArray(item.tags)) item.tags = [];
                    if (typeof item.createdAt !== 'number') item.createdAt = now;
                });
            });

            const duplicateCount = deduped.duplicateStats.skippedExisting + deduped.duplicateStats.skippedWithinFile;

            if (deduped.importedCount > 0) {
                config.value.layout.push(...deduped.groups.map((group) => createWorkspace({
                    id: group.id,
                    title: group.title,
                    icon: group.icon,
                    sortKey: group.sortKey,
                    iconColor: group.iconColor,
                    iconBgColor: group.iconBgColor,
                    workspaceLayout: group.workspaceLayout,
                    tiles: group.items.map((item) => createCanonicalSiteTile({
                        id: item.id,
                        title: item.title || '',
                        url: item.url || '',
                        icon: item.icon || '',
                        iconType: normalizeSiteIconType(item.iconType),
                        iconValue: item.iconValue || '',
                        bgColor: item.bgColor || '#3b82f6',
                        remark: item.remark || '',
                        tags: item.tags,
                        createdAt: item.createdAt || now,
                        layouts: {desktop: {x: 0, y: 0, w: item.w || 1, h: item.h || 1}},
                    })),
                })));
                void saveConfig();
                return {
                    success: true,
                    groupCount: deduped.groups.length,
                    count: deduped.importedCount,
                    duplicateCount,
                    skippedExisting: deduped.duplicateStats.skippedExisting,
                    skippedWithinFile: deduped.duplicateStats.skippedWithinFile,
                    skippedInvalid: deduped.duplicateStats.skippedInvalid,
                    duplicateExamples: deduped.duplicateStats.examples,
                };
            }

            const skippedCount = duplicateCount + deduped.duplicateStats.skippedInvalid;
            return {
                success: true,
                groupCount: 0,
                count: 0,
                duplicateCount,
                skippedExisting: deduped.duplicateStats.skippedExisting,
                skippedWithinFile: deduped.duplicateStats.skippedWithinFile,
                skippedInvalid: deduped.duplicateStats.skippedInvalid,
                duplicateExamples: deduped.duplicateStats.examples,
                message: skippedCount > 0
                    ? `未新增书签，已跳过 ${skippedCount} 个重复或无效 URL`
                    : '未新增书签',
            };
        }
        return {success: false, message: result.message || '导入失败'};
    };

    // Merge live browser-bookmark groups into the layout: same-title groups are
    // merged (dedup by URL), missing groups are appended. Never overwrites.
    const mergeBrowserBookmarkGroups = (
        groups: {title: string; items: {title: string; url: string}[]}[],
    ) => {
        const now = Date.now();
        let added = 0;
        let mergedGroups = 0;
        let newGroups = 0;
        let skipped = 0;
        const existingKeys = new Set(
            config.value.layout
                .flatMap((group) => group.tiles)
                .filter(isSiteTile)
                .map((tile) => createBookmarkUrlKey(tile.url))
                .filter(Boolean),
        );

        const buildTile = (item: {title: string; url: string}) => createCanonicalSiteTile({
            id: createUniqueTileId(),
            title: (item.title || '').slice(0, 120) || item.url,
            url: item.url,
            icon: '',
            iconType: 'auto',
            iconValue: '',
            bgColor: '#3b82f6',
            remark: '',
            tags: [],
            createdAt: now,
            layouts: {desktop: {x: 0, y: 0, w: 1, h: 1}},
        });

        for (const incoming of groups) {
            const title = (incoming.title || '').trim() || '未命名分组';
            const items = (incoming.items || []).filter((item) => createBookmarkUrlKey(item.url));
            if (!items.length) continue;

            const existing = config.value.layout.find(
                (group) => group.title.trim().toLowerCase() === title.toLowerCase(),
            );

            if (existing) {
                let groupAdded = 0;
                for (const item of items) {
                    const key = createBookmarkUrlKey(item.url);
                    if (existingKeys.has(key)) { skipped += 1; continue; }
                    existingKeys.add(key);
                    existing.tiles.push(buildTile(item));
                    added += 1;
                    groupAdded += 1;
                }
                if (groupAdded) mergedGroups += 1;
            } else {
                const tiles = [];
                for (const item of items) {
                    const key = createBookmarkUrlKey(item.url);
                    if (existingKeys.has(key)) { skipped += 1; continue; }
                    existingKeys.add(key);
                    tiles.push(buildTile(item));
                    added += 1;
                }
                if (tiles.length) {
                    config.value.layout.push(createWorkspace({
                        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        title,
                        icon: 'Folder',
                        tiles,
                    }));
                    newGroups += 1;
                }
            }
        }

        if (added > 0) void saveConfig();
        return {added, mergedGroups, newGroups, skipped};
    };

    // Snapshot the current layout as {title, items[{title,url}]} for exporting to
    // the browser bookmark tree.
    const collectBookmarkGroupsForBrowser = () =>
        config.value.layout
            .map((group) => ({
                title: group.title,
                items: group.tiles
                    .filter(isSiteTile)
                    .map((tile) => ({title: tile.title || tile.url, url: tile.url}))
                    .filter((item) => !!item.url),
            }))
            .filter((group) => group.items.length > 0);

    const setIconFallback = (itemId: string) => {
        for (const group of config.value.layout) {
            const item = findTile(group, itemId);
            if (!item || !isSiteTile(item)) continue;

            if (
                item.iconType === 'text' &&
                item.iconValue &&
                item.iconValue.length >= 2 &&
                item.bgColor &&
                item.bgColor !== '#3b82f6'
            ) {
                return;
            }

            const patch: SitePatch = {
                iconType: 'text',
                iconValue: createTextIconValue(item.title || ''),
            };

            if (!item.bgColor || item.bgColor === '#ffffff' || item.bgColor === '#3b82f6') {
                patch.bgColor = generateColor(item.title || '');
            }
            updateCanonicalTile(item, patch);
            void saveConfig();
            break;
        }
    };

    const updateGroupSort = (groupId: string, sortKey: 'custom' | 'name' | 'lastVisited') => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (group) {
            group.sortKey = sortKey;
            void saveConfig();
        }
    };

    return {
        addGroup,
        removeGroup,
        updateGroup,
        addSite,
        updateSite,
        removeSite,
        reorderItems,
        moveSite,
        updateTileStyleOverride,
        resetTileStyleOverride,
        updateComponentTileSettings,
        migrateComponentTileSettings,
        exportTileInstanceForShare,
        importTileInstanceToGroup,
        importDeclarativeTilePackage,
        importTilePackage,
        recoverOfficialTilePackages,
        exportDeclarativeTilePackage,
        exportTilePackage,
        disableTilePackage,
        enableTilePackage,
        uninstallTilePackage,
        downgradeTilePackage,
        addDeclarativeTile,
        addExternalTile,
        grantTileCapabilities,
        revokeTileCapabilities,
        requestOptionalHostPermission,
        setSandboxRuntimeEnabled,
        updateSandboxRuntimeLimits,
        grantSandboxPermissions,
        revokeSandboxPermissions,
        pruneOrphanSandboxGrants,
        recordSandboxCrash,
        clearSandboxCrash,
        importBookmarks,
        mergeBrowserBookmarkGroups,
        collectBookmarkGroupsForBrowser,
        setIconFallback,
        updateGroupSort,
        createSiteTile: addSite,
        updateTile: updateSite,
        removeTile: removeSite,
    };
};
