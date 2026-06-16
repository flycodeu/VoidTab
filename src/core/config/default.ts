import type {Config} from './types';
import {CURRENT_CONFIG_VERSION} from './types';
import {buildTemplateLayout} from '../templates/presets';
import {cloneDefaultTerminalCommands} from './terminalCommands';

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
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxHistory: 10
    },

    layout: buildTemplateLayout('clean'),

    theme: {
        mode: 'light',
        sidebarPos: 'left',
        showSidebar: true,
        showTime: true,
        gridMaxWidth: 2000,

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

    runtime: {
        cron: {expr: '* * * * * ?', theme: 'pure-white'},
        auth: {jwtToken: ''},
        terminal_buffer: {
            buffer: '',
            theme: 'standard',
            activeCategory: 'all',
            commands: cloneDefaultTerminalCommands(),
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
        siteList: {
            groups: {},
            widgets: {}
        },
        terminal: {history: [], theme: 'dark', isOpen: false},
    },
};
