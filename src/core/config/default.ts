import type {ConfigV5} from './types';
import {buildTemplateLayout} from '../templates/presets';
import {cloneDefaultMemoCategories, cloneDefaultMemoNotes} from './memoNotes';
import {cloneDefaultAiPromptTemplates} from './aiPromptTemplates';

export const LOCAL_WALLPAPER_MARKER = '_USE_LOCAL_STORAGE_' as const;

export const defaultConfig: ConfigV5 = {
    version: 5,
    sync: {
        provider: 'webdav',
        enabled: false,
        autoSync: false,
        url: 'https://dav.jianguoyun.com/dav/',
        username: '',
        password: '',
        folder: 'voidtab',
        filename: 'voidtab-backup.json',
        lastSyncTime: 0,
        lastRemoteEtag: '',
        lastRemoteMtime: '',
        syncCustomTiles: false,
    },

    ai: {
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxHistory: 10,
        systemPrompt: 'You are a helpful assistant.',
        templates: cloneDefaultAiPromptTemplates(),
    },

    layout: buildTemplateLayout('clean'),

    theme: {
        mode: 'light',
        sidebarPos: 'left',
        showSidebar: true,
        showTime: true,
        gridMaxWidth: 2000,

        maxTileSpan: 6,
        showTileAppearanceMenu: true,
        showTileSizeMenu: true,
        // 进阶 / 开发者入口默认隐藏，按需在「高级」设置中开启，降低普通用户的干扰与占用。
        showDesignerMenu: false,
        showImportTileMenu: false,
        showDevToolsMenu: false,

        blur: 20,
        opacity: 0.6,
        wallpaper: '',
        accent: '#007AFF',

        techFont: true,
        breathingLight: false,
        neonGlow: false,

        iconSize: 60,
        radius: 16,
        gap: 24,

        showIconName: true,
        showWidgetName: true,
        iconTextSize: 12,
        icon: 'Folder',

        density: 'normal',

        showLogoText: false,
        customLogoText: 'VoidTab',

        showGroupCount: false,

        enableHistory: true,

        enableTerminal: true,

        techFontFamily: 'Fira Code',
        breathingDuration: 3,
        siteLayoutMode: 'icon',
        showAllGroupsInMain: true,
        siteCard: {
            w: 3,
            h: 1,
            showRemark: true,
            showDomain: true,
        },
        readability: {
            enabled: true,
            mode: 'auto',
            strength: 22,
            blur: 0,
            desaturate: 0,
        },
    },

    searchEngines: [
        {id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass'},
        {id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'Globe'},
        {id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint'}
    ],
    currentEngineId: 'bing',

    focusMode: false,

    audio: {
        ambient: {
            enabled: false,
            currentId: 'rain',
            volume: 0.5,
        },
    },

    privacy: {
        enabled: false,
        vault: null,
        entry: {
            trigger: 'keyboard',
            phrase: ':void',
            autoLockMinutes: 10,
            hideWhenLocked: true,
            syncEnabled: true,
        },
    },

    runtime: {
        cron: {expr: '* * * * * ?', theme: 'pure-white'},
        auth: {jwtToken: ''},
        terminal_buffer: {
            buffer: '',
            theme: 'standard',
            activeCategory: 'all',
            categories: cloneDefaultMemoCategories(),
            notes: cloneDefaultMemoNotes(),
        },
        siteState: {},
        siteIcons: {
            version: 15,
            records: {},
            lastBatchRefreshAt: 0,
        },
        widgets: {merit: {value: {}, sound: {}}},
        widgetState: {},
        photo: {widgets: {}},
        musicEmbed: {widgets: {}},
        sandbox: {
            enabled: false,
            grants: {},
            revoked: {},
            crashes: {},
            limits: {
                maxActiveInstances: 6,
                maxStorageBytes: 64_000,
                maxRequestsPerMinute: 30,
                maxNetworkBytesPerRequest: 128_000,
                maxCrashCount: 3,
                crashWindowMs: 10 * 60 * 1000,
                fuseDurationMs: 30 * 60 * 1000,
            },
        },
        tileGrants: {
            grants: {},
            revoked: {},
        },
        siteList: {
            groups: {},
            widgets: {}
        },
        terminal: {history: [], theme: 'dark', isOpen: false},
    },
};
