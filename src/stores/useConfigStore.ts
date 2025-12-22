import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { storage } from '../utils/storage';

// 默认配置（兜底用）
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
        mode: 'dark',
        sidebarPos: 'left',
        showTime: true,
        gridMaxWidth: 1200,
        blur: 20,
        opacity: 0.6,
        wallpaper: '',
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
    // 1. 初始化为默认值
    const config = ref<any>(JSON.parse(JSON.stringify(defaultConfig)));
    const isLoaded = ref(false); // 标记数据是否加载完成

    // 2. 异步加载数据的方法
    const loadConfig = async () => {
        const savedConfig = await storage.get('voidtab-config', null);
        if (savedConfig) {
            // 合并逻辑：防止新版本加了字段，老配置覆盖导致字段丢失
            config.value = { ...config.value, ...savedConfig, theme: { ...config.value.theme, ...savedConfig.theme } };
        }
        isLoaded.value = true;
    };

    // 3. 监听变化并自动保存
    // 使用 deep: true 深度监听对象变化
    watch(config, async (newVal) => {
        if (isLoaded.value) {
            // 只有加载完成后，变动才写入存储，防止初始空数据覆盖云端
            await storage.set('voidtab-config', JSON.parse(JSON.stringify(newVal)));
        }
    }, { deep: true });

    // Actions
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

    const addEngine = (name: string, url: string) => {
        config.value.searchEngines.push({ id: Date.now().toString(), name, url, icon: 'Globe' });
    };

    const removeEngine = (id: string) => {
        config.value.searchEngines = config.value.searchEngines.filter((e: any) => e.id !== id);
    };

    const removeSite = (groupId: string, siteId: string) => {
        const group = config.value.layout.find((g: any) => g.id === groupId);
        if (group) {
            group.items = group.items.filter((s: any) => s.id !== siteId);
        }
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
        addEngine,
        removeEngine,
        removeSite
    };
});