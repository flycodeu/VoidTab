import {defineStore} from 'pinia';
import {ref, watch} from 'vue';
import {storage} from '../utils/storage';
import {parseBookmarkContent} from "../utils/bookmarkImporter";

const CONFIG_KEY = 'voidtab-core-config';
const WALLPAPER_KEY = 'voidtab-wallpaper-blob';
const LOCAL_MARKER = '_USE_LOCAL_STORAGE_';

// 🎨 颜色生成器
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
    widgets: [
        {id: 'weather', name: '天气信息', visible: true, order: 1, colSpan: 1, config: {city: 'Shanghai'}},
        {
            id: 'github',
            name: 'GitHub 趋势',
            visible: true,
            order: 2,
            colSpan: 2,
            config: {language: 'javascript', since: 'daily'}
        },
        {id: 'system', name: '系统监控', visible: true, colSpan: 1, order: 3},
        {
            id: 'rss',
            name: 'RSS 阅读器',
            visible: true,
            order: 4,
            colSpan: 2,
            config: {
                feeds: [{name: '少数派', url: 'https://sspai.com/feed'}, {
                    name: 'V2EX',
                    url: 'https://www.v2ex.com/index.xml'
                }, {name: '36Kr', url: 'https://36kr.com/feed'}]
            }
        },
        {id: 'greeting', name: '问候语', visible: true, order: 0, colSpan: 1, config: {}}
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
    const rssCache = ref<Record<string, any[]>>({});

    // ✨✨✨ 新增：数据自愈/修复函数 ✨✨✨
    // 专门解决：导入的数据全是默认蓝/白色，或者内网IP还在尝试请求图片的问题
    const repairData = () => {
        let hasChanges = false;

        config.value.layout.forEach((group: any) => {
            group.items.forEach((item: any) => {
                // 判断是否是内网/本地 IP
                const isInternal = item.url && /^(https?:\/\/)?(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])|localhost|127\.)/.test(item.url);

                // 判断是否是“坏数据”（虽然是文字模式，或者是内网，但颜色还是默认的蓝/白）
                const isDefaultColor = !item.bgColor || item.bgColor === '#3b82f6' || item.bgColor === '#ffffff';

                // 如果是内网地址，强制转文字模式
                if (isInternal && item.iconType !== 'text') {
                    item.iconType = 'text';
                    hasChanges = true;
                }

                // 如果是文字模式 (或被强制转了)，且颜色是默认的 -> 重新生成颜色和文字
                if (item.iconType === 'text' || isInternal) {
                    // 1. 修复颜色
                    if (isDefaultColor) {
                        item.bgColor = generateColor(item.title || '');
                        hasChanges = true;
                    }

                    // 2. 修复文字 (如果没字，或者字太少)
                    if (!item.iconValue || item.iconValue.length < 2) {
                        const cleanTitle = (item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
                        if (/[\u4e00-\u9fa5]/.test(cleanTitle)) {
                            item.iconValue = cleanTitle.substring(0, 2);
                        } else {
                            item.iconValue = cleanTitle.substring(0, 4).toUpperCase();
                        }
                        if (!item.iconValue) item.iconValue = item.title?.substring(0, 2) || 'A';
                        hasChanges = true;
                    }
                }
            });
        });

        // 如果有修复，立即保存
        if (hasChanges) {
            console.log('检测到旧数据样式异常，已自动修复颜色和文字。');
            saveConfig();
        }
    };

    // --- Core Logic: Load & Save ---

    const loadConfig = async () => {
        let loadedConfig = await storage.get(CONFIG_KEY, null, 'local');

        if (!loadedConfig) {
            console.log('Local config not found, trying sync...');
            loadedConfig = await storage.get(CONFIG_KEY, null, 'sync');
        }

        if (loadedConfig) {
            config.value = {
                ...config.value,
                ...loadedConfig,
                theme: {...config.value.theme, ...loadedConfig.theme}
            };

            const storedWidgets = loadedConfig.widgets || defaultConfig.widgets;
            config.value.widgets = defaultConfig.widgets.map((defW: any) => {
                const exists = storedWidgets.find((w: any) => w.id === defW.id);
                if (exists) {
                    if (exists.colSpan === undefined) exists.colSpan = defW.colSpan;
                    return exists;
                }
                return defW;
            });
            config.value.widgets = storedWidgets;

            if (config.value.theme.wallpaper === LOCAL_MARKER) {
                const localWallpaper = await storage.get(WALLPAPER_KEY, '', 'local');
                if (localWallpaper) {
                    config.value.theme.wallpaper = localWallpaper;
                }
            }

            // ✨✨✨ 加载完成后，立即运行一次修复逻辑 ✨✨✨
            repairData();
        }
        isLoaded.value = true;
    };

    const saveConfig = async () => {
        if (!isLoaded.value) return;
        const configToSync = JSON.parse(JSON.stringify(config.value));
        const currentWallpaper = configToSync.theme.wallpaper || '';
        const isBase64 = currentWallpaper.startsWith('data:image');

        if (isBase64) {
            await storage.set(WALLPAPER_KEY, currentWallpaper, 'local');
            configToSync.theme.wallpaper = LOCAL_MARKER;
        } else {
            if (currentWallpaper !== LOCAL_MARKER) {
                await storage.remove(WALLPAPER_KEY, 'local');
            }
        }
        try {
            await storage.set(CONFIG_KEY, configToSync, 'local');
        } catch (e) {
            console.error('保存配置失败:', e);
        }
    };

    watch(config, () => {
        saveConfig();
    }, {deep: true});

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes[CONFIG_KEY]) {
                loadConfig();
            }
            if (areaName === 'local' && changes[WALLPAPER_KEY]) {
                config.value.theme.wallpaper = changes[WALLPAPER_KEY].newValue;
            }
        });
    }

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
    };
    const toggleWidget = (widgetId: string, isVisible: boolean) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) widget.visible = isVisible;
    };
    const updateWidgetConfig = (widgetId: string, settings: any) => {
        const widget = config.value.widgets.find((w: any) => w.id === widgetId);
        if (widget) {
            widget.config = {...widget.config, ...settings};
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

    const dragState = ref({isDragging: false, item: null as any, fromGroupId: ''});
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
        for (const group of config.value.layout) {
            const item = group.items.find((i: any) => i.id === itemId);
            if (item) {
                if (item.iconType === 'text' && item.iconValue && item.iconValue.length >= 2 && item.bgColor && item.bgColor !== '#3b82f6') return;

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
        setDragState,
        dragState,
        contextMenu,
        openContextMenu,
        closeContextMenu,
        rssCache,
        setIconFallback
    };
});