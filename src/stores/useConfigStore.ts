import {defineStore} from 'pinia';
import { ref, watch} from 'vue';
import {parseBookmarkContent} from '../utils/bookmarkImporter';
import {SyncScheduler, syncService} from '../core/sync';

import type {Config} from '../core/config/types';
import {defaultConfig} from '../core/config/default';
import {migrateConfig} from '../core/config/migrate';
import {normalizeConfig} from '../core/config/normalize';
import {configRepository} from '../core/config/repository';

// 🎨 颜色生成器（仍保留在 store：给 setIconFallback 用）
const generateColor = (str: string) => {
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
        '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
        '#f43f5e', '#0f172a', '#475569', '#059669', '#7c3aed'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export const useConfigStore = defineStore('config', () => {
    const config = ref<Config>(JSON.parse(JSON.stringify(defaultConfig)));
    const isLoaded = ref(false);
    const rssCache = ref<Record<string, any[]>>({});
    const applyingExternal = ref(false);
    const localRevision = ref(0);
    let scheduler: SyncScheduler | null = null;


    const loadConfig = async () => {
        config.value = await configRepository.load();
        isLoaded.value = true;

        // 启动 scheduler（只初始化一次）
        if (!scheduler) {
            scheduler = new SyncScheduler({
                getProfile: () => config.value.sync as any,
                getUploadPayload: () => JSON.stringify(config.value),
                getLocalRevision: () => localRevision.value,

                onRemotePayload: async (remoteText, meta) => {
                    try {
                        const raw = JSON.parse(remoteText);
                        const next = normalizeConfig(migrateConfig(raw));

                        applyingExternal.value = true;
                        config.value = next;
                        queueMicrotask(() => (applyingExternal.value = false));

                        // 远端覆盖后：本地 revision 也算已变化（你也可以不加）
                        localRevision.value += 1;
                        console.log(meta)
                    } catch (e) {
                        console.warn('远端数据不是有效 JSON，已忽略', e);
                    }
                },

                onSyncMeta: (meta) => {
                    config.value.sync.lastSyncTime = meta.lastSyncTime;
                    if (meta.etag) config.value.sync.lastRemoteEtag = meta.etag;
                    if (meta.mtime) config.value.sync.lastRemoteMtime = meta.mtime;
                    saveConfig();
                },

                onError: (e) => console.warn('AutoSync error:', e)
            });

            scheduler.start();
        }
    };


    const saveConfig = async () => {
        if (!isLoaded.value) return;
        try {
            await configRepository.save(config.value);
        } catch (e) {
            console.error('保存配置失败:', e);
        }
    };

    watch(
        config,
        () => {
            if (!isLoaded.value) return;
            if (applyingExternal.value) return;

            localRevision.value += 1;   // ✅ Step7：记录本地“修改版本”
            saveConfig();
        },
        {deep: true}
    );


    // --- Actions ---
    const addGroup = (group: any) => {
        group.id = Date.now().toString();
        group.items = [];
        config.value.layout.push(group);
    };

    const removeGroup = (groupId: string) => {
        config.value.layout = config.value.layout.filter((g: any) => g.id !== groupId);
    };

    const updateGroup = (groupId: string, data: any) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) Object.assign(group, data);
    };

    const addSite = (groupId: string, site: any) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) {
            site.id = Date.now().toString();
            group.items.push(site);
        }
    };

    const updateSite = (groupId: string, siteId: string, data: any) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) {
            const site = group.items.find((s: any) => s.id === siteId);
            if (site) Object.assign(site, data);
        }
    };

    const removeSite = (groupId: string, siteId: string) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) {
            group.items = group.items.filter((s: any) => s.id !== siteId);
        }
    };

    const reorderItems = (groupId: string, newItems: any[]) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) {
            group.items = newItems;
        }
    };

    const moveSite = (fromGroupId: string, toGroupId: string, siteId: string) => {
        const fromGroup = config.value.layout.find((g: any) => g.id === fromGroupId);
        const toGroup = config.value.layout.find((g: any) => g.id === toGroupId);
        if (fromGroup && toGroup) {
            const siteIndex = fromGroup.items.findIndex((s: any) => s.id === siteId);
            if (siteIndex > -1) {
                const [site] = fromGroup.items.splice(siteIndex, 1);
                toGroup.items.push(site);
            }
        }
    };

    const addEngine = (name: string, url: string) => {
        config.value.searchEngines.push({id: Date.now().toString(), name, url, icon: 'Globe'});
    };

    const removeEngine = (id: string) => {
        config.value.searchEngines = config.value.searchEngines.filter((e: any) => e.id !== id);
        // 防止删掉当前引擎导致崩溃
        if (!config.value.searchEngines.some((e: any) => e.id === config.value.currentEngineId)) {
            config.value.currentEngineId = config.value.searchEngines[0]?.id || 'bing';
        }
    };

    const toggleWidget = (widgetId: string, isVisible: boolean) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) widget.visible = isVisible;
    };

    const updateWidgetConfig = (widgetId: string, settings: any) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) {
            widget.config = {...(widget.config || {}), ...settings};
        }
    };

    const addRssFeed = (widgetId: string, name: string, url: string) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget && widget.config && widget.config.feeds) {
            widget.config.feeds.push({name, url});
        }
    };

    const removeRssFeed = (widgetId: string, url: string) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget && widget.config && widget.config.feeds) {
            widget.config.feeds = widget.config.feeds.filter((f: any) => f.url !== url);
        }
    };


    const importBookmarks = (htmlContent: string) => {
        const result = parseBookmarkContent(htmlContent);
        if (result.success && result.groups.length > 0) {
            config.value.layout.push(...result.groups);
            saveConfig();
            return {success: true, groupCount: result.groups.length, count: result.totalCount};
        }
        return {success: false, message: result.message || '导入失败'};
    };

    // 兜底逻辑 (供单个组件调用)
    const setIconFallback = (itemId: string) => {
        for (const group of config.value.layout as any[]) {
            const item = group.items.find((i: any) => i.id === itemId);
            if (item) {
                if (item.iconType === 'text' && item.iconValue && item.iconValue.length >= 2 && item.bgColor && item.bgColor !== '#3b82f6')
                    return;

                console.log(`单个图标修复: ${item.title}`);
                item.iconType = 'text';

                const cleanTitle = (item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
                if (/[\u4e00-\u9fa5]/.test(cleanTitle)) {
                    item.iconValue = cleanTitle.substring(0, 2);
                } else {
                    item.iconValue = cleanTitle.substring(0, 4).toUpperCase();
                }
                if (!item.iconValue) item.iconValue = item.title.substring(0, 2) || 'A';

                if (!item.bgColor || item.bgColor === '#ffffff' || item.bgColor === '#3b82f6') {
                    item.bgColor = generateColor(item.title || '');
                }
                saveConfig();
                break;
            }
        }
    };

    const testSyncConnection = async (profile?: Config['sync']) => {
        return await syncService.test((profile ?? config.value.sync) as any);
    };


    // 手动上传备份
    const uploadBackup = async () => {
        if (!config.value.sync?.enabled) {
            // 你也可以允许未 enabled 的情况下手动上传，这里看你需求
        }

        const now = Date.now();
        const backupData = JSON.parse(JSON.stringify(config.value));
        backupData.sync.lastSyncTime = now;

        const res = await syncService.upload(config.value.sync as any, backupData);

        if (res.ok) {
            config.value.sync.lastSyncTime = now;
            if (res.remoteEtag) config.value.sync.lastRemoteEtag = res.remoteEtag;
            if (res.remoteMtime) config.value.sync.lastRemoteMtime = res.remoteMtime;
            saveConfig();
            return {success: true, msg: res.message};
        }
        return {success: false, msg: res.message};
    };


    // 手动恢复备份
    const downloadBackup = async () => {
        const currentSync = {...config.value.sync};

        const res = await syncService.download(config.value.sync as any);
        if (!res.ok || !res.data) return {success: false, msg: res.message};

        try {
            const parsed = JSON.parse(res.data);

            // ✅ Step2 的 migrate+normalize 仍然要走
            const next = normalizeConfig(migrateConfig(parsed));
            config.value = next;

            // 保留当前凭证（避免云端备份覆盖为空）
            config.value.sync = {...config.value.sync, ...currentSync};

            // 记录远端 meta
            if (res.remoteEtag) config.value.sync.lastRemoteEtag = res.remoteEtag;
            if (res.remoteMtime) config.value.sync.lastRemoteMtime = res.remoteMtime;

            saveConfig();
            return {success: true, msg: '数据恢复成功'};
        } catch {
            return {success: false, msg: '云端数据不是有效 JSON'};
        }
    };


    const destroy = () => {
        scheduler?.stop();
        scheduler = null;
    };


    return {
        config,
        isLoaded,
        loadConfig,
        saveConfig,

        addGroup,
        removeGroup,
        updateGroup,

        addSite,
        updateSite,
        removeSite,
        reorderItems,
        moveSite,

        addEngine,
        removeEngine,

        toggleWidget,
        updateWidgetConfig,
        addRssFeed,
        removeRssFeed,

        importBookmarks,

        rssCache,
        setIconFallback,

        testSyncConnection,
        uploadBackup,
        downloadBackup,

        destroy

    };
});
