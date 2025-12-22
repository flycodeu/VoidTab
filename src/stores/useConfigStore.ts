import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { storage } from '../utils/storage';

const CONFIG_KEY = 'voidtab-core-config'; // 存同步配置
const WALLPAPER_KEY = 'voidtab-wallpaper-blob'; // 存本地大图
const LOCAL_MARKER = '_USE_LOCAL_STORAGE_'; // 标记位

// 默认配置
const defaultConfig = {
    layout: [
        {
            id: 'group-1',
            title: '常用工具',
            icon: 'Briefcase',
            items: [
                { id: 'site-1', title: 'GitHub', url: 'https://github.com', icon: 'https://github.com/favicon.ico' },
                { id: 'site-2', title: 'Bilibili', url: 'https://bilibili.com', icon: 'https://www.bilibili.com/favicon.ico' },
            ]
        }
    ],
    theme: {
        mode: 'light',
        sidebarPos: 'left',
        showTime: true,
        gridMaxWidth: 1200,
        blur: 20,
        opacity: 0.6,
        wallpaper: '', // 这里只存 URL 或者 MARKER
        techFont: true,
        breathingLight: true,
        neonGlow: true,
        customCursor: true,
        iconSize: 60,
        radius: 16,
        gap: 24,
        showIconName: true,
        iconTextSize: 12
    },
    searchEngines: [
        { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass' },
        { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'Globe' },
        { id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint' }
    ],
    currentEngineId: 'bing'
};

export const useConfigStore = defineStore('config', () => {
    const config = ref<any>(JSON.parse(JSON.stringify(defaultConfig)));
    const isLoaded = ref(false);

    // 📥 加载逻辑：合并 Sync 和 Local
    const loadConfig = async () => {
        // 1. 先加载云端配置 (轻量)
        const syncedConfig = await storage.get(CONFIG_KEY, null, 'sync');

        if (syncedConfig) {
            // 深度合并配置
            config.value = {
                ...config.value,
                ...syncedConfig,
                theme: { ...config.value.theme, ...syncedConfig.theme }
            };

            // 2. 检查壁纸是否存储在本地
            if (config.value.theme.wallpaper === LOCAL_MARKER) {
                const localWallpaper = await storage.get(WALLPAPER_KEY, '', 'local');
                if (localWallpaper) {
                    config.value.theme.wallpaper = localWallpaper; // 恢复大图显示
                }
            }
        }
        isLoaded.value = true;
    };

    // 💾 保存逻辑：拆分 Sync 和 Local
    watch(config, async (newVal) => {
        if (!isLoaded.value) return;

        // 深拷贝一份副本用于处理，不影响当前显示
        const configToSync = JSON.parse(JSON.stringify(newVal));
        const currentWallpaper = configToSync.theme.wallpaper || '';

        // 判断壁纸类型
        const isBase64 = currentWallpaper.startsWith('data:image');

        if (isBase64) {
            // 情况 A: 是 Base64 大图
            // 1. 存入 Local Storage
            await storage.set(WALLPAPER_KEY, currentWallpaper, 'local');
            // 2. Sync 中只存标记位，防止爆库
            configToSync.theme.wallpaper = LOCAL_MARKER;
        } else {
            // 情况 B: 是网络 URL 或空
            // 1. 清理 Local Storage (节省空间)
            if (currentWallpaper !== LOCAL_MARKER) {
                await storage.remove(WALLPAPER_KEY, 'local');
            }
            // 2. Sync 中直接存 URL
        }

        // 保存瘦身后的配置到 Sync
        await storage.set(CONFIG_KEY, configToSync, 'sync');

    }, { deep: true });

    // Actions (保持不变)
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

    const addEngine = (name: string, url: string) => {
        config.value.searchEngines.push({ id: Date.now().toString(), name, url, icon: 'Globe' });
    };

    const removeEngine = (id: string) => {
        config.value.searchEngines = config.value.searchEngines.filter((e: any) => e.id !== id);
    };

    return {
        config,
        isLoaded,
        loadConfig,
        addGroup,
        removeGroup,
        updateGroup,
        addSite,
        updateSite,
        removeSite,
        addEngine,
        removeEngine
    };
});