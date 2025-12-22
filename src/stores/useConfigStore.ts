import {defineStore} from 'pinia';
import {ref, watch} from 'vue';
import {storage} from '../utils/storage';

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
                {id: 'site-1', title: 'GitHub', url: 'https://github.com', icon: 'https://github.com/favicon.ico'},
                {
                    id: 'site-2',
                    title: 'Bilibili',
                    url: 'https://bilibili.com',
                    icon: 'https://www.bilibili.com/favicon.ico'
                },
            ]
        }
    ],
    // ✨ 新增：小组件配置
    widgets: [
        {
            id: 'weather',
            name: '天气信息',
            visible: true,
            order: 1,
            config: { city: 'Shanghai' }
        },
        {
            id: 'github',
            name: 'GitHub 趋势',
            visible: true,
            order: 2,
            config: { language: 'javascript', since: 'daily' }
        },
        {
            id: 'system',
            name: '系统监控',
            visible: true,
            order: 3
        },
        {
            id:'devtools',
            name: '开发工具',
            visible: true,
            order: 4
        }
    ],
    theme: {
        mode: 'light',
        sidebarPos: 'left',
        showTime: true,
        gridMaxWidth: 1200,
        blur: 20,
        opacity: 0.6,
        wallpaper: '',
        techFont: true,
        breathingLight: true,
        neonGlow: true,
        customCursor: false,
        iconSize: 60,
        radius: 16,
        gap: 24,
        showIconName: true,
        iconTextSize: 12
    },
    searchEngines: [
        {id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass'},
        {id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'Globe'},
        {id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint'}
    ],
    currentEngineId: 'bing'
};

export const useConfigStore = defineStore('config', () => {
    const config = ref<any>(JSON.parse(JSON.stringify(defaultConfig)));
    const isLoaded = ref(false);

// 📥 加载逻辑：智能合并 Sync 和 Local
    const loadConfig = async () => {
        // 1. 先加载云端/本地存储的配置
        const syncedConfig = await storage.get(CONFIG_KEY, null, 'sync');

        if (syncedConfig) {
            // 基础合并 (主题、布局等)
            config.value = {
                ...config.value,
                ...syncedConfig,
                theme: { ...config.value.theme, ...syncedConfig.theme }
            };

            // ✨✨✨ 核心修复：智能合并 Widgets ✨✨✨
            // 取出存储中的组件列表（如果是旧版可能没有 widgets 字段，就用默认的）
            const storedWidgets = syncedConfig.widgets || defaultConfig.widgets;

            // 遍历默认配置里的所有组件
            defaultConfig.widgets.forEach((defW: any) => {
                // 检查存储的列表中是否已经有这个组件
                const exists = storedWidgets.find((w: any) => w.id === defW.id);
                // ⚠️ 如果存储里没有（说明是新加的功能），就把它追加进去
                if (!exists) {
                    storedWidgets.push(defW);
                }
            });

            // 赋值回去
            config.value.widgets = storedWidgets;

            // 2. 检查壁纸逻辑 (保持不变)
            if (config.value.theme.wallpaper === LOCAL_MARKER) {
                const localWallpaper = await storage.get(WALLPAPER_KEY, '', 'local');
                if (localWallpaper) {
                    config.value.theme.wallpaper = localWallpaper;
                }
            }
        }
        isLoaded.value = true;
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            // 如果是 Sync 里的配置变了
            if (areaName === 'sync' && changes[CONFIG_KEY]) {
                loadConfig(); // 重新加载配置
            }
            // 如果是 Local 里的壁纸变了
            if (areaName === 'local' && changes[WALLPAPER_KEY]) {
                config.value.theme.wallpaper = changes[WALLPAPER_KEY].newValue;
            }
        });
    }

    //  保存逻辑：拆分 Sync 和 Local
    watch(config, async (newVal) => {
        if (!isLoaded.value) return;

        // 深拷贝一份副本用于处理，不影响当前显示
        const configToSync = JSON.parse(JSON.stringify(newVal));
        const currentWallpaper = configToSync.theme.wallpaper || '';

        // 判断壁纸类型
        const isBase64 = currentWallpaper.startsWith('data:image');

        if (isBase64) {
            // 情况 A: 是 Base64 大图
            await storage.set(WALLPAPER_KEY, currentWallpaper, 'local');
            configToSync.theme.wallpaper = LOCAL_MARKER;
        } else {
            // 情况 B: 是网络 URL 或空
            if (currentWallpaper !== LOCAL_MARKER) {
                await storage.remove(WALLPAPER_KEY, 'local');
            }
        }

        // 保存瘦身后的配置到 Sync
        await storage.set(CONFIG_KEY, configToSync, 'sync');

    }, {deep: true});

    // --- Actions ---

    // 1. 布局/分组操作
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

    // 2. 站点图标操作
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

    // 3. 搜索引擎操作
    const addEngine = (name: string, url: string) => {
        config.value.searchEngines.push({id: Date.now().toString(), name, url, icon: 'Globe'});
    };

    const removeEngine = (id: string) => {
        config.value.searchEngines = config.value.searchEngines.filter((e: any) => e.id !== id);
    };

    // 4. ✨ 新增：Widget 操作
    const toggleWidget = (widgetId: string, isVisible: boolean) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) widget.visible = isVisible;
    };

    const updateWidgetConfig = (widgetId: string, settings: any) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) {
            // 合并配置，防止丢失原有配置
            widget.config = { ...widget.config, ...settings };
        }
    };

    // 5. 状态管理 (拖拽 & 右键)
    const dragState = ref({
        isDragging: false,
        item: null as any,
        fromGroupId: ''
    });

    const setDragState = (isDragging: boolean, fromGroupId: string = '', item: any = null) => {
        dragState.value = {isDragging, fromGroupId, item};
    };

    const contextMenu = ref({
        show: false,
        x: 0,
        y: 0,
        type: 'site' as 'site' | 'group',
        item: null as any,
        groupId: ''
    });

    const openContextMenu = (e: MouseEvent, item: any, type: 'site' | 'group', groupId: string = '') => {
        e.preventDefault();
        e.stopPropagation();
        contextMenu.value = {
            show: true,
            x: e.clientX,
            y: e.clientY,
            type,
            item,
            groupId: groupId || (type === 'group' ? item.id : '')
        };
    };

    const closeContextMenu = () => {
        contextMenu.value.show = false;
    };

    return {
        config,
        isLoaded,
        loadConfig,
        // Group Actions
        addGroup,
        removeGroup,
        updateGroup,
        // Site Actions
        addSite,
        updateSite,
        removeSite,
        reorderItems,
        moveSite,
        // Engine Actions
        addEngine,
        removeEngine,
        // Widget Actions
        toggleWidget,
        updateWidgetConfig,
        // States
        setDragState,
        dragState,
        contextMenu,
        openContextMenu,
        closeContextMenu,
    };
});