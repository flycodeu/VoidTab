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
        },
        {
            id: 'group-games',
            title: '游戏',
            icon: 'GameController',
            sortKey: 'custom',
            iconColor: '#a855f7',
            iconBgColor: 'rgba(168, 85, 247, 0.15)',
            items: [
                // Minecraft
                {
                    id: 'mc-wiki',
                    title: 'Minecraft Wiki',
                    url: 'https://minecraft.wiki/',
                    icon: 'https://minecraft.wiki/favicon.ico'
                },
                {
                    id: 'mc-official',
                    title: 'Minecraft 官网',
                    url: 'https://www.minecraft.net/',
                    icon: 'https://www.minecraft.net/favicon.ico'
                },

                // 缺氧（Oxygen Not Included）
                {
                    id: 'oni-wiki',
                    title: '缺氧 Wiki（Fandom）',
                    url: 'https://oxygennotincluded.fandom.com/wiki/Oxygen_Not_Included_Wiki',
                    icon: 'https://static.wikia.nocookie.net/oxygennotincluded/images/6/63/Site-favicon.ico/revision/latest?cb=20170215100446'
                },
                {
                    id: 'oni-klei',
                    title: '缺氧 Klei 官网页',
                    url: 'https://www.klei.com/games/oxygen-not-included',
                    icon: 'https://www.klei.com/favicon.ico'
                },

                // 泰拉瑞亚（Terraria）
                {
                    id: 'terraria-wiki',
                    title: 'Terraria Wiki',
                    url: 'https://terraria.wiki.gg/wiki/Terraria_Wiki',
                    icon: 'https://terraria.wiki.gg/favicon.ico'
                },
                {
                    id: 'terraria-official',
                    title: 'Terraria 官网',
                    url: 'https://terraria.org/',
                    icon: 'https://terraria.org/favicon.ico'
                },

                // 星露谷物语（Stardew Valley）
                {
                    id: 'sv-wiki',
                    title: '星露谷 Wiki',
                    url: 'https://stardewvalleywiki.com/Stardew_Valley_Wiki',
                    icon: 'https://stardewvalleywiki.com/favicon.ico'
                },
                {
                    id: 'sv-official',
                    title: 'Stardew Valley 官网',
                    url: 'https://www.stardewvalley.net/',
                    icon: 'https://www.stardewvalley.net/favicon.ico'
                }
            ]
        },
        {
            id: 'group-ai',
            title: 'AI',
            icon: 'Robot',
            sortKey: 'custom',
            iconColor: '#22c55e',
            iconBgColor: 'rgba(34, 197, 94, 0.15)',
            items: [
                // 通用聊天/助手
                {
                    id: 'ai-chatgpt',
                    title: 'ChatGPT',
                    url: 'https://chat.openai.com/',
                    icon: 'https://chat.openai.com/favicon.ico'
                },
                {id: 'ai-claude', title: 'Claude', url: 'https://claude.ai/', icon: 'https://claude.ai/favicon.ico'},
                {
                    id: 'ai-gemini',
                    title: 'Gemini',
                    url: 'https://gemini.google.com/',
                    icon: 'https://gemini.google.com/favicon.ico'
                },
                {id: 'ai-grok', title: 'Grok', url: 'https://grok.com/', icon: 'https://grok.com/favicon.ico'},
                {
                    id: 'ai-deepseek',
                    title: 'DeepSeek',
                    url: 'https://chat.deepseek.com/',
                    icon: 'https://chat.deepseek.com/favicon.ico'
                },
                {
                    id: 'ai-kimi',
                    title: 'Kimi（月之暗面）',
                    url: 'https://kimi.moonshot.cn/',
                    icon: 'https://kimi.moonshot.cn/favicon.ico'
                },
                {
                    id: 'ai-doubao',
                    title: '豆包',
                    url: 'https://www.doubao.com/',
                    icon: 'https://www.doubao.com/favicon.ico'
                },
                {
                    id: 'ai-tongyi',
                    title: '通义千问',
                    url: 'https://tongyi.aliyun.com/',
                    icon: 'https://tongyi.aliyun.com/favicon.ico'
                },
                {
                    id: 'ai-ernie',
                    title: '文心一言',
                    url: 'https://yiyan.baidu.com/',
                    icon: 'https://yiyan.baidu.com/favicon.ico'
                },

                // 图片 AI
                {
                    id: 'ai-midjourney',
                    title: 'Midjourney',
                    url: 'https://www.midjourney.com/',
                    icon: 'https://www.midjourney.com/favicon.ico'
                },
                {
                    id: 'ai-leonardo',
                    title: 'Leonardo AI',
                    url: 'https://leonardo.ai/',
                    icon: 'https://leonardo.ai/favicon.ico'
                },
                {
                    id: 'ai-ideogram',
                    title: 'Ideogram',
                    url: 'https://ideogram.ai/',
                    icon: 'https://ideogram.ai/favicon.ico'
                },

                // 视频 AI
                {
                    id: 'ai-runway',
                    title: 'Runway',
                    url: 'https://runwayml.com/',
                    icon: 'https://runwayml.com/favicon.ico'
                },
                {id: 'ai-pika', title: 'Pika', url: 'https://pika.art/', icon: 'https://pika.art/favicon.ico'},

                // 音频/语音 AI
                {
                    id: 'ai-elevenlabs',
                    title: 'ElevenLabs',
                    url: 'https://elevenlabs.io/',
                    icon: 'https://elevenlabs.io/favicon.ico'
                }
            ]
        }

    ],

    theme: {
        mode: 'light',
        sidebarPos: 'left',
        showTime: true,
        gridMaxWidth: 2000,

        blur: 20,
        opacity: 0.6,
        wallpaper: '',
        accent: '#007AFF',

        techFont: true,
        breathingLight: true,
        neonGlow: true,

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

        enableTerminal: true,

        techFontFamily: 'default',
        breathingDuration: 3,
        siteLayoutMode: "icon",
        siteCard: {
            w: 3,
            h: 1,
            showRemark: true,
            showDomain: true,
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
