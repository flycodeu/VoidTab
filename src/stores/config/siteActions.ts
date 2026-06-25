import type {Ref} from 'vue';
import type {ConfigV6, SiteItem} from '../../core/config/types';
import type {
    DeclarativeTileDefinition,
    ExternalTileType,
    SandboxTileDefinition,
    SiteTile,
    TileInstance,
    TileStyleOverride,
    Workspace,
} from '../../core/tiles/contracts.ts';
import {parseBookmarkContent} from '../../shared/utils/bookmarkImporter';
import {dedupeImportedBookmarkGroups} from '../../shared/utils/bookmarkImportDedup';
import {clampInt, createTextIconValue, generateColor, MAX_WIDGET_H, MAX_WIDGET_W, normalizeSiteIconType} from './helpers';
import {exportTileInstance as createTileInstanceExport, importTileInstance} from '../../core/tiles/instanceSharing.ts';
import {resolveTileDefinition} from '../../core/tiles/registry.ts';
import {applyTileStyleOverride, resetTileStyleOverride as resetCanonicalTileStyleOverride} from '../../core/tiles/style.ts';
import {
    createDeclarativeTilePackageExport,
} from '../../core/tiles/declarativePackage.ts';
import {createSandboxTilePackageExport} from '../../core/tiles/sandboxPackage.ts';
import {installDeclarativePackageAtomically, installTilePackageAtomically} from '../../core/tiles/packageStore.ts';
import {
    createExternalComponentTile,
    createSiteTile as createCanonicalSiteTile,
    createWorkspace,
    findTile,
    findWorkspace,
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
            candidate = 'tile-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        } while (existing.has(candidate));
        return candidate;
    };

    const addGroup = (group: GroupInput) => {
        const nextGroup = createWorkspace({
            ...group,
            id: Date.now().toString(),
            title: group.title || '新分组',
            icon: group.icon || 'SquaresFour',
        });
        config.value.layout.push(nextGroup);
        void saveConfig();
    };

    const removeGroup = (groupId: string) => {
        const index = config.value.layout.findIndex((group) => group.id === groupId);
        if (index >= 0) {
            config.value.layout.splice(index, 1);
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
            id: now.toString(),
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

    const removeSite = (groupId: string, siteId: string) => {
        const group = findWorkspace(config.value, groupId);
        if (group) {
            removeCanonicalTile(group, siteId);
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
        const transaction = installDeclarativePackageAtomically(config.value.tileInstalls, raw);
        if (transaction.ok) {
            config.value.tileInstalls = transaction.nextInstalls;
            void saveConfig();
            return {
                success: true,
                tileType: transaction.tileType,
                label: transaction.install.manifest?.metadata.label || transaction.tileType,
                auditStatus: transaction.audit.status,
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
        const transaction = installTilePackageAtomically(config.value.tileInstalls, raw);
        if (transaction.ok) {
            config.value.tileInstalls = transaction.nextInstalls;
            void saveConfig();
            return {
                success: true,
                tileType: transaction.tileType,
                runtime: transaction.install.runtime,
                label: transaction.install.manifest?.metadata.label || transaction.tileType,
                auditStatus: transaction.audit.status,
            };
        }
        return {
            success: false,
            message: transaction.message,
        };
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
        exportTileInstanceForShare,
        importTileInstanceToGroup,
        importDeclarativeTilePackage,
        importTilePackage,
        exportDeclarativeTilePackage,
        exportTilePackage,
        addDeclarativeTile,
        addExternalTile,
        setSandboxRuntimeEnabled,
        importBookmarks,
        setIconFallback,
        updateGroupSort,
        createSiteTile: addSite,
        updateTile: updateSite,
        removeTile: removeSite,
    };
};
