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
                }
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
        {id: 'system', name: '系统监控', visible: true, order: 3, colSpan: 1},
        {
            id: 'rss',
            name: 'RSS 阅读器',
            visible: true,
            order: 4,
            colSpan: 2,
            config: {
                feeds: [
                    {name: '少数派', url: 'https://sspai.com/feed'},
                    {name: 'V2EX', url: 'https://www.v2ex.com/index.xml'},
                    {name: '36Kr', url: 'https://36kr.com/feed'}
                ]
            }
        },
        {id: 'greeting', name: '问候语', visible: true, order: 0, colSpan: 1, config: {}}
    ],

    theme: {
        mode: 'light',
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
        iconTextSize: 12,
        icon: 'Folder'
    },

    searchEngines: [
        {id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass'},
        {id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'Globe'},
        {id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint'}
    ],
    currentEngineId: 'bing'
};
