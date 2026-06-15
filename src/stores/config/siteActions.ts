import type {Ref} from 'vue';
import type {Config, Group, SiteItem} from '../../core/config/types';
import {parseBookmarkContent} from '../../shared/utils/bookmarkImporter';
import {dedupeImportedBookmarkGroups} from '../../shared/utils/bookmarkImportDedup';
import {createTextIconValue, generateColor, normalizeSiteIconType} from './helpers';

type GroupInput = Partial<Omit<Group, 'id' | 'items'>> & {
    title?: string;
    icon?: string;
    items?: SiteItem[];
};

type SiteInput = Partial<SiteItem>;

type SitePatch = Partial<SiteItem> & {
    tags?: unknown;
};

export const createSiteActions = (
    config: Ref<Config>,
    saveConfig: () => Promise<void>
) => {
    const addGroup = (group: GroupInput) => {
        const nextGroup: Group = {
            id: Date.now().toString(),
            title: group.title || '新分组',
            icon: group.icon || 'SquaresFour',
            items: [],
            sortKey: group.sortKey,
            iconColor: group.iconColor,
            iconBgColor: group.iconBgColor,
        };
        config.value.layout.push(nextGroup);
        void saveConfig();
    };

    const removeGroup = (groupId: string) => {
        config.value.layout = config.value.layout.filter((group) => group.id !== groupId);
        void saveConfig();
    };

    const updateGroup = (groupId: string, data: Partial<Group>) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (group) {
            Object.assign(group, data);
            void saveConfig();
        }
    };

    const addSite = (groupId: string, site: SiteInput) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (!group) return;

        const now = Date.now();
        const payload: SiteItem = {
            id: now.toString(),
            kind: 'site',
            w: 1,
            h: 1,
            title: site.title || '',
            url: site.url || '',
            bgColor: site.bgColor || '#3b82f6',
            iconType: normalizeSiteIconType(site.iconType),
            iconValue: site.iconValue || '',
            icon: site.icon || '',
            remark: typeof site.remark === 'string' ? site.remark : '',
            createdAt: typeof site.createdAt === 'number' ? site.createdAt : now,
        };

        group.items.push(payload);
        void saveConfig();
    };

    const updateSite = (groupId: string, siteId: string, data: SitePatch) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (!group) return;

        const site = group.items.find((item) => item.id === siteId);
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

        patch.kind = 'site';
        patch.w = 1;
        patch.h = 1;

        Object.assign(site, patch);
        void saveConfig();
    };

    const removeSite = (groupId: string, siteId: string) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (group) {
            group.items = group.items.filter((item) => item.id !== siteId);
            void saveConfig();
        }
    };

    const reorderItems = (groupId: string, newItems: SiteItem[]) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (group) {
            group.items = newItems;
            void saveConfig();
        }
    };

    const moveSite = (fromGroupId: string, toGroupId: string, siteId: string) => {
        const fromGroup = config.value.layout.find((group) => group.id === fromGroupId);
        const toGroup = config.value.layout.find((group) => group.id === toGroupId);
        if (fromGroup && toGroup) {
            const siteIndex = fromGroup.items.findIndex((site) => site.id === siteId);
            if (siteIndex > -1) {
                const [site] = fromGroup.items.splice(siteIndex, 1);
                toGroup.items.push(site);
                void saveConfig();
            }
        }
    };

    const importBookmarks = (htmlContent: string) => {
        const result = parseBookmarkContent(htmlContent);
        if (result.success && result.groups.length > 0) {
            const now = Date.now();
            const deduped = dedupeImportedBookmarkGroups(result.groups, config.value.layout);

            deduped.groups.forEach((group) => {
                group.items.forEach((item: SiteItem) => {
                    item.kind = 'site';
                    item.w = 1;
                    item.h = 1;

                    if (typeof item.remark !== 'string') item.remark = '';
                    if (!Array.isArray(item.tags)) item.tags = [];
                    if (typeof item.createdAt !== 'number') item.createdAt = now;
                });
            });

            const duplicateCount = deduped.duplicateStats.skippedExisting + deduped.duplicateStats.skippedWithinFile;

            if (deduped.importedCount > 0) {
                config.value.layout.push(...deduped.groups);
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
            const item = group.items.find((site) => site.id === itemId);
            if (!item) continue;

            if (
                item.iconType === 'text' &&
                item.iconValue &&
                item.iconValue.length >= 2 &&
                item.bgColor &&
                item.bgColor !== '#3b82f6'
            ) {
                return;
            }

            item.iconType = 'text';
            item.iconValue = createTextIconValue(item.title || '');

            if (!item.bgColor || item.bgColor === '#ffffff' || item.bgColor === '#3b82f6') {
                item.bgColor = generateColor(item.title || '');
            }
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
        importBookmarks,
        setIconFallback,
        updateGroupSort,
    };
};
