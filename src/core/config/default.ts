// src/core/config/default.ts
import type {Config} from './types';
import {CURRENT_CONFIG_VERSION} from './types';

/**
 * wallpaper 如果是大体积 base64，实际存 local，用 marker 代替
 * 这里统一成常量导出
 */
export const LOCAL_WALLPAPER_MARKER = '_USE_LOCAL_STORAGE_' as const;

export const defaultConfig: Config = {
    version: CURRENT_CONFIG_VERSION,
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
        lastRemoteMtime: ''
    },

    ai: {
        // 默认预设为 DeepSeek
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxHistory: 10
    },

    layout: [
        {
            id: 'group-1',
            title: '常用工具',
            icon: 'Briefcase',
            sortKey: 'custom',
            iconColor: '#0ea5e9', // Sky blue
            iconBgColor: 'rgba(14, 165, 233, 0.15)',
            items: [
                {id: 'site-1', title: 'GitHub', url: 'https://github.com', icon: 'https://github.com/favicon.ico'},
                {
                    id: 'site-2',
                    title: 'Bilibili',
                    url: 'https://bilibili.com',
                    icon: 'https://www.bilibili.com/favicon.ico'
                }
            ]
        }
    ],

    theme: {
        mode: 'system',
        sidebarPos: 'left',
        showTime: true,
        gridMaxWidth: 2000,

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
        showWidgetName: true,
        iconTextSize: 12,
        icon: 'Folder',

        density: 'normal',

        showLogoText: false, // 默认不展示，用户确认后展示
        customLogoText: 'VoidTab',

        showGroupCount: false,

        enableHistory: true,

        enableTerminal: true
    },

    searchEngines: [
        {id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass'},
        {id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'Globe'},
        {id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint'}
    ],
    currentEngineId: 'bing',

    focusMode: false,


    runtime: {
        cron: {expr: '* * * * * ?', theme: 'pure-white'},
        auth: {jwtToken: ''},
        terminal_buffer: {buffer: '', theme: 'standard'},
        siteState: {},
        widgets: {merit: {value: {}, sound: {}}},
        widgetState: {},
        photo: {widgets: {}},
        siteList: {
            groups: {},
            widgets: {}
        },
        terminal: {history: [], theme: 'dark', isOpen: false},
    },
};
