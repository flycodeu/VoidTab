import type {Config, Group, SiteItem} from '../config/types';

type TemplateSite = {
    title: string;
    url: string;
    iconValue?: string;
    bgColor: string;
    remark?: string;
    icon?: string;
    iconType?: SiteItem['iconType'];
};

type StarterTemplateGroup = {
    title: string;
    icon: string;
    iconColor: string;
    iconBgColor: string;
    sites: TemplateSite[];
    widgets?: Array<{ type: string; title?: string; w?: number; h?: number }>;
};

type StarterLayoutPresetId = 'minimal' | 'clean' | 'office' | 'developer' | 'legacy';

type StarterLayoutPreset = {
    id: StarterLayoutPresetId;
    groups: StarterTemplateGroup[];
};

export type TemplatePresetId = 'google' | 'firefox' | 'edge' | 'itab' | 'compact' | 'regular' | 'classic';

export type TemplateLayoutSettings = {
    sidebarPos: Config['theme']['sidebarPos'];
    showSidebar: boolean;
    density: Config['theme']['density'];
    siteLayoutMode: Config['theme']['siteLayoutMode'];
    showTime: boolean;
    showAllGroupsInMain: boolean;
    showIconName: boolean;
    showWidgetName: boolean;
    iconSize: number;
    iconTextSize: number;
    radius: number;
    gap: number;
    gridMaxWidth: number;
    siteCard: Config['theme']['siteCard'];
};

export type TemplatePreset = {
    id: TemplatePresetId;
    name: string;
    audience: string;
    summary: string;
    accent: string;
    layout: TemplateLayoutSettings;
    highlights: string[];
};

export const templatePresets: TemplatePreset[] = [
    {
        id: 'regular',
        name: '常规布局',
        audience: '默认习惯',
        summary: '接近 VoidTab 默认使用方式：左侧分组、常规间距、图标入口和连续分组浏览。',
        accent: '#007AFF',
        layout: {
            sidebarPos: 'left',
            showSidebar: true,
            density: 'normal',
            siteLayoutMode: 'icon',
            showTime: true,
            showAllGroupsInMain: true,
            showIconName: true,
            showWidgetName: true,
            iconSize: 60,
            iconTextSize: 12,
            radius: 16,
            gap: 24,
            gridMaxWidth: 2000,
            siteCard: {
                w: 3,
                h: 1,
                showRemark: true,
                showDomain: true,
            },
        },
        highlights: ['左侧分组', '常规图标', '连续分组'],
    },
    {
        id: 'compact',
        name: '紧凑布局',
        audience: '入口较多',
        summary: '缩小图标、间距和文字尺寸，保留左侧分组，适合在一屏内放下更多网站。',
        accent: '#64748B',
        layout: {
            sidebarPos: 'left',
            showSidebar: true,
            density: 'compact',
            siteLayoutMode: 'icon',
            showTime: false,
            showAllGroupsInMain: false,
            showIconName: true,
            showWidgetName: true,
            iconSize: 48,
            iconTextSize: 11,
            radius: 12,
            gap: 14,
            gridMaxWidth: 1280,
            siteCard: {
                w: 2,
                h: 1,
                showRemark: false,
                showDomain: true,
            },
        },
        highlights: ['小图标', '低间距', '当前分组'],
    },
    {
        id: 'classic',
        name: '历史常规',
        audience: '旧版默认',
        summary: '保留未提交前的旧默认分组思路：常用工具、游戏和 AI，作为独立布局类型存在。',
        accent: '#0EA5E9',
        layout: {
            sidebarPos: 'left',
            showSidebar: true,
            density: 'normal',
            siteLayoutMode: 'icon',
            showTime: true,
            showAllGroupsInMain: false,
            showIconName: true,
            showWidgetName: true,
            iconSize: 60,
            iconTextSize: 12,
            radius: 16,
            gap: 24,
            gridMaxWidth: 2000,
            siteCard: {
                w: 3,
                h: 1,
                showRemark: true,
                showDomain: true,
            },
        },
        highlights: ['旧默认分组', '单分组视图', '左侧导航'],
    },
    {
        id: 'google',
        name: 'Google 风格',
        audience: '搜索优先',
        summary: '保留单个当前分组和轻量图标区，分组导航默认收起，更接近搜索页式新标签。',
        accent: '#4285F4',
        layout: {
            sidebarPos: 'bottom',
            showSidebar: false,
            density: 'comfortable',
            siteLayoutMode: 'icon',
            showTime: false,
            showAllGroupsInMain: false,
            showIconName: true,
            showWidgetName: true,
            iconSize: 58,
            iconTextSize: 12,
            radius: 18,
            gap: 22,
            gridMaxWidth: 960,
            siteCard: {
                w: 1,
                h: 1,
                showRemark: false,
                showDomain: false,
            },
        },
        highlights: ['当前分组', '轻量图标', '隐藏分组栏'],
    },
    {
        id: 'firefox',
        name: 'Firefox 磁贴',
        audience: '方块入口',
        summary: '把站点呈现为方块磁贴，分组导航默认收起，首屏更像 Firefox 常用站点区域。',
        accent: '#FF7139',
        layout: {
            sidebarPos: 'bottom',
            showSidebar: false,
            density: 'normal',
            siteLayoutMode: 'card',
            showTime: false,
            showAllGroupsInMain: false,
            showIconName: true,
            showWidgetName: true,
            iconSize: 64,
            iconTextSize: 12,
            radius: 16,
            gap: 18,
            gridMaxWidth: 1120,
            siteCard: {
                w: 1,
                h: 1,
                showRemark: false,
                showDomain: false,
            },
        },
        highlights: ['1x1 磁贴', '标题内收', '隐藏分组栏'],
    },
    {
        id: 'edge',
        name: 'Edge 卡片',
        audience: '信息密度',
        summary: '使用更宽的横向卡片、清晰边界和域名备注，适合办公入口和资料管理。',
        accent: '#0078D4',
        layout: {
            sidebarPos: 'left',
            showSidebar: true,
            density: 'normal',
            siteLayoutMode: 'card',
            showTime: true,
            showAllGroupsInMain: true,
            showIconName: true,
            showWidgetName: true,
            iconSize: 58,
            iconTextSize: 12,
            radius: 12,
            gap: 18,
            gridMaxWidth: 1360,
            siteCard: {
                w: 3,
                h: 1,
                showRemark: true,
                showDomain: true,
            },
        },
        highlights: ['3x1 卡片', '域名备注', '连续分组'],
    },
    {
        id: 'itab',
        name: 'iTab 桌面',
        audience: '自定义桌面',
        summary: '更大的自由图标和宽松间距，保留所有分组连续浏览，适合把新标签页当桌面使用。',
        accent: '#10B981',
        layout: {
            sidebarPos: 'left',
            showSidebar: true,
            density: 'comfortable',
            siteLayoutMode: 'icon',
            showTime: true,
            showAllGroupsInMain: true,
            showIconName: true,
            showWidgetName: true,
            iconSize: 86,
            iconTextSize: 13,
            radius: 24,
            gap: 30,
            gridMaxWidth: 1720,
            siteCard: {
                w: 3,
                h: 1,
                showRemark: true,
                showDomain: true,
            },
        },
        highlights: ['大图标', '宽松间距', '桌面感'],
    },
];

const starterLayoutPresets: StarterLayoutPreset[] = [
    {
        id: 'minimal',
        groups: [
            {
                title: '常用',
                icon: 'House',
                iconColor: '#2563EB',
                iconBgColor: 'rgba(37, 99, 235, 0.14)',
                sites: [
                    {title: 'Google', url: 'https://www.google.com', iconValue: 'GO', bgColor: '#2563EB'},
                    {title: 'Bing', url: 'https://www.bing.com', iconValue: 'BI', bgColor: '#0f766e'},
                    {title: 'GitHub', url: 'https://github.com', iconValue: 'GH', bgColor: '#111827'},
                    {title: 'YouTube', url: 'https://www.youtube.com', iconValue: 'YT', bgColor: '#dc2626'},
                    {title: 'Bilibili', url: 'https://www.bilibili.com', iconValue: 'BB', bgColor: '#06b6d4'},
                    {title: 'Notion', url: 'https://www.notion.so', iconValue: 'NO', bgColor: '#334155'},
                ],
            },
        ],
    },
    {
        id: 'clean',
        groups: [
            {
                title: '常用',
                icon: 'House',
                iconColor: '#007AFF',
                iconBgColor: 'rgba(0, 122, 255, 0.14)',
                sites: [
                    {title: 'Bing', url: 'https://www.bing.com', iconValue: 'BI', bgColor: '#2563EB'},
                    {title: 'Google', url: 'https://www.google.com', iconValue: 'GO', bgColor: '#16a34a'},
                    {title: 'GitHub', url: 'https://github.com', iconValue: 'GH', bgColor: '#111827'},
                    {title: 'Notion', url: 'https://www.notion.so', iconValue: 'NO', bgColor: '#334155'},
                ],
            },
            {
                title: '学习',
                icon: 'BookOpenText',
                iconColor: '#7c3aed',
                iconBgColor: 'rgba(124, 58, 237, 0.14)',
                sites: [
                    {title: 'MDN', url: 'https://developer.mozilla.org', iconValue: 'MD', bgColor: '#111827'},
                    {title: 'Wikipedia', url: 'https://www.wikipedia.org', iconValue: 'WK', bgColor: '#475569'},
                    {title: '知乎', url: 'https://www.zhihu.com', iconValue: '知', bgColor: '#2563EB'},
                    {title: 'Bilibili', url: 'https://www.bilibili.com', iconValue: 'BB', bgColor: '#06b6d4'},
                ],
                widgets: [
                    {type: 'calendar', title: '日历', w: 2, h: 2},
                ],
            },
        ],
    },
    {
        id: 'office',
        groups: [
            {
                title: '办公',
                icon: 'Briefcase',
                iconColor: '#0F766E',
                iconBgColor: 'rgba(15, 118, 110, 0.14)',
                sites: [
                    {title: 'Gmail', url: 'https://mail.google.com', iconValue: 'GM', bgColor: '#dc2626', remark: '邮箱'},
                    {title: 'Outlook', url: 'https://outlook.live.com', iconValue: 'OL', bgColor: '#2563EB', remark: '邮箱与日历'},
                    {title: 'Google Docs', url: 'https://docs.google.com', iconValue: 'DO', bgColor: '#2563EB', remark: '文档'},
                    {title: 'Notion', url: 'https://www.notion.so', iconValue: 'NO', bgColor: '#334155', remark: '知识库'},
                    {title: 'OneDrive', url: 'https://onedrive.live.com', iconValue: 'OD', bgColor: '#0ea5e9', remark: '网盘'},
                ],
            },
        ],
    },
    {
        id: 'developer',
        groups: [
            {
                title: '开发',
                icon: 'Code',
                iconColor: '#22C55E',
                iconBgColor: 'rgba(34, 197, 94, 0.14)',
                sites: [
                    {title: 'GitHub', url: 'https://github.com', iconValue: 'GH', bgColor: '#111827', remark: '代码托管'},
                    {title: 'MDN', url: 'https://developer.mozilla.org', iconValue: 'MD', bgColor: '#334155', remark: 'Web 文档'},
                    {title: 'Vue', url: 'https://vuejs.org', iconValue: 'VU', bgColor: '#16a34a', remark: 'Vue 文档'},
                    {title: 'Vite', url: 'https://vitejs.dev', iconValue: 'VI', bgColor: '#7c3aed', remark: '构建工具'},
                ],
                widgets: [
                    {type: 'jwt_sentry', title: 'JWT 解析', w: 2, h: 2},
                    {type: 'base64_codec', title: 'Base64', w: 2, h: 2},
                    {type: 'cron', title: 'Cron 助手', w: 2, h: 2},
                ],
            },
        ],
    },
    {
        id: 'legacy',
        groups: [
            {
                title: '常用工具',
                icon: 'Briefcase',
                iconColor: '#0ea5e9',
                iconBgColor: 'rgba(14, 165, 233, 0.15)',
                sites: [
                    {
                        title: 'GitHub',
                        url: 'https://github.com',
                        iconValue: 'GH',
                        bgColor: '#111827',
                        icon: 'https://github.com/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: 'Bilibili',
                        url: 'https://bilibili.com',
                        iconValue: 'BB',
                        bgColor: '#06b6d4',
                        icon: 'https://www.bilibili.com/favicon.ico',
                        iconType: 'auto',
                    },
                ],
            },
            {
                title: '游戏',
                icon: 'GameController',
                iconColor: '#a855f7',
                iconBgColor: 'rgba(168, 85, 247, 0.15)',
                sites: [
                    {
                        title: 'Minecraft Wiki',
                        url: 'https://minecraft.wiki/',
                        iconValue: 'MC',
                        bgColor: '#16a34a',
                        icon: 'https://minecraft.wiki/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: 'Minecraft 官网',
                        url: 'https://www.minecraft.net/',
                        iconValue: 'MC',
                        bgColor: '#15803d',
                        icon: 'https://www.minecraft.net/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: '缺氧 Wiki',
                        url: 'https://oxygennotincluded.fandom.com/wiki/Oxygen_Not_Included_Wiki',
                        iconValue: 'ON',
                        bgColor: '#0f766e',
                        remark: 'Fandom',
                        icon: 'https://static.wikia.nocookie.net/oxygennotincluded/images/6/63/Site-favicon.ico/revision/latest?cb=20170215100446',
                        iconType: 'auto',
                    },
                    {
                        title: '缺氧 Klei 官网',
                        url: 'https://www.klei.com/games/oxygen-not-included',
                        iconValue: 'KL',
                        bgColor: '#dc2626',
                        icon: 'https://www.klei.com/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: 'Terraria Wiki',
                        url: 'https://terraria.wiki.gg/wiki/Terraria_Wiki',
                        iconValue: 'TW',
                        bgColor: '#22c55e',
                        icon: 'https://terraria.wiki.gg/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: 'Terraria 官网',
                        url: 'https://terraria.org/',
                        iconValue: 'TR',
                        bgColor: '#16a34a',
                        icon: 'https://terraria.org/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: '星露谷 Wiki',
                        url: 'https://stardewvalleywiki.com/Stardew_Valley_Wiki',
                        iconValue: 'SV',
                        bgColor: '#ca8a04',
                        icon: 'https://stardewvalleywiki.com/favicon.ico',
                        iconType: 'auto',
                    },
                    {
                        title: 'Stardew Valley 官网',
                        url: 'https://www.stardewvalley.net/',
                        iconValue: 'SV',
                        bgColor: '#f59e0b',
                        icon: 'https://www.stardewvalley.net/favicon.ico',
                        iconType: 'auto',
                    },
                ],
            },
            {
                title: 'AI',
                icon: 'Robot',
                iconColor: '#22c55e',
                iconBgColor: 'rgba(34, 197, 94, 0.15)',
                sites: [
                    {title: 'ChatGPT', url: 'https://chat.openai.com/', iconValue: 'AI', bgColor: '#111827', icon: 'https://chat.openai.com/favicon.ico', iconType: 'auto'},
                    {title: 'Claude', url: 'https://claude.ai/', iconValue: 'CL', bgColor: '#7c2d12', icon: 'https://claude.ai/favicon.ico', iconType: 'auto'},
                    {title: 'Gemini', url: 'https://gemini.google.com/', iconValue: 'GE', bgColor: '#2563eb', icon: 'https://gemini.google.com/favicon.ico', iconType: 'auto'},
                    {title: 'Grok', url: 'https://grok.com/', iconValue: 'GR', bgColor: '#111827', icon: 'https://grok.com/favicon.ico', iconType: 'auto'},
                    {title: 'DeepSeek', url: 'https://chat.deepseek.com/', iconValue: 'DS', bgColor: '#2563eb', icon: 'https://chat.deepseek.com/favicon.ico', iconType: 'auto'},
                    {title: 'Kimi（月之暗面）', url: 'https://kimi.moonshot.cn/', iconValue: 'KM', bgColor: '#111827', icon: 'https://kimi.moonshot.cn/favicon.ico', iconType: 'auto'},
                    {title: '豆包', url: 'https://www.doubao.com/', iconValue: '豆', bgColor: '#2563eb', icon: 'https://www.doubao.com/favicon.ico', iconType: 'auto'},
                    {title: '通义千问', url: 'https://tongyi.aliyun.com/', iconValue: '通', bgColor: '#7c3aed', icon: 'https://tongyi.aliyun.com/favicon.ico', iconType: 'auto'},
                    {title: '文心一言', url: 'https://yiyan.baidu.com/', iconValue: '文', bgColor: '#2563eb', icon: 'https://yiyan.baidu.com/favicon.ico', iconType: 'auto'},
                    {title: 'Midjourney', url: 'https://www.midjourney.com/', iconValue: 'MJ', bgColor: '#111827', icon: 'https://www.midjourney.com/favicon.ico', iconType: 'auto'},
                    {title: 'Leonardo AI', url: 'https://leonardo.ai/', iconValue: 'LE', bgColor: '#0f172a', icon: 'https://leonardo.ai/favicon.ico', iconType: 'auto'},
                    {title: 'Ideogram', url: 'https://ideogram.ai/', iconValue: 'ID', bgColor: '#111827', icon: 'https://ideogram.ai/favicon.ico', iconType: 'auto'},
                    {title: 'Runway', url: 'https://runwayml.com/', iconValue: 'RW', bgColor: '#111827', icon: 'https://runwayml.com/favicon.ico', iconType: 'auto'},
                    {title: 'Pika', url: 'https://pika.art/', iconValue: 'PK', bgColor: '#7c3aed', icon: 'https://pika.art/favicon.ico', iconType: 'auto'},
                    {title: 'ElevenLabs', url: 'https://elevenlabs.io/', iconValue: 'EL', bgColor: '#111827', icon: 'https://elevenlabs.io/favicon.ico', iconType: 'auto'},
                ],
            },
        ],
    },
];

const now = () => Date.now();

const makeId = (prefix: string, parts: Array<string | number>, unique: boolean) => {
    const base = parts
        .join('-')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return unique ? `${prefix}-${base}-${now()}-${Math.random().toString(36).slice(2, 7)}` : `${prefix}-${base}`;
};

const buildSiteItem = (site: TemplateSite, groupIndex: number, siteIndex: number, unique: boolean): SiteItem => ({
    id: makeId('site', [groupIndex + 1, siteIndex + 1, site.title], unique),
    kind: 'site',
    w: 1,
    h: 1,
    title: site.title,
    url: site.url,
    iconType: site.iconType || 'text',
    iconValue: site.iconValue || '',
    bgColor: site.bgColor,
    icon: site.icon || '',
    remark: site.remark || '',
    createdAt: now(),
});

const buildWidgetItem = (
    widget: NonNullable<StarterTemplateGroup['widgets']>[number],
    groupIndex: number,
    widgetIndex: number,
    unique: boolean
): SiteItem => ({
    id: makeId('widget', [groupIndex + 1, widgetIndex + 1, widget.type], unique),
    kind: 'widget',
    widgetType: widget.type,
    title: widget.title || widget.type,
    w: widget.w || 2,
    h: widget.h || 2,
    url: '',
    icon: '',
});

function getStarterLayoutPreset(id: StarterLayoutPresetId | string) {
    return starterLayoutPresets.find((item) => item.id === id) || starterLayoutPresets[1];
}

export function getTemplatePreset(id: TemplatePresetId | string) {
    return templatePresets.find((item) => item.id === id) || templatePresets[0];
}

export function buildTemplateLayout(
    id: StarterLayoutPresetId | string,
    options: { unique?: boolean } = {}
): Group[] {
    const preset = getStarterLayoutPreset(id);
    const unique = !!options.unique;

    return preset.groups.map((group, groupIndex) => {
        const sites = group.sites.map((site, siteIndex) => buildSiteItem(site, groupIndex, siteIndex, unique));
        const widgets = (group.widgets || []).map((widget, widgetIndex) =>
            buildWidgetItem(widget, groupIndex, widgetIndex, unique)
        );

        return {
            id: makeId('group', [groupIndex + 1, group.title], unique),
            title: group.title,
            icon: group.icon,
            sortKey: 'custom',
            iconColor: group.iconColor,
            iconBgColor: group.iconBgColor,
            items: [...sites, ...widgets],
        };
    });
}

export function applyTemplatePreset(config: Config, id: TemplatePresetId | string) {
    const preset = getTemplatePreset(id);
    const layout = preset.layout;

    config.theme.accent = preset.accent;
    config.theme.sidebarPos = layout.sidebarPos;
    config.theme.showSidebar = layout.showSidebar;
    config.theme.density = layout.density;
    config.theme.siteLayoutMode = layout.siteLayoutMode;
    config.theme.showTime = layout.showTime;
    config.theme.showAllGroupsInMain = layout.showAllGroupsInMain;
    config.theme.showIconName = layout.showIconName;
    config.theme.showWidgetName = layout.showWidgetName;
    config.theme.iconSize = layout.iconSize;
    config.theme.iconTextSize = layout.iconTextSize;
    config.theme.radius = layout.radius;
    config.theme.gap = layout.gap;
    config.theme.gridMaxWidth = layout.gridMaxWidth;
    config.theme.siteCard = {
        ...config.theme.siteCard,
        ...layout.siteCard,
    };
}

export function isTemplatePresetActive(config: Config, id: TemplatePresetId | string) {
    const preset = getTemplatePreset(id);
    const theme = config.theme;
    const layout = preset.layout;

    return theme.accent === preset.accent
        && theme.sidebarPos === layout.sidebarPos
        && theme.showSidebar === layout.showSidebar
        && theme.density === layout.density
        && theme.siteLayoutMode === layout.siteLayoutMode
        && theme.showTime === layout.showTime
        && theme.showAllGroupsInMain === layout.showAllGroupsInMain
        && theme.showIconName === layout.showIconName
        && theme.showWidgetName === layout.showWidgetName
        && Number(theme.iconSize) === layout.iconSize
        && Number(theme.iconTextSize) === layout.iconTextSize
        && Number(theme.radius) === layout.radius
        && Number(theme.gap) === layout.gap
        && Number(theme.gridMaxWidth) === layout.gridMaxWidth
        && Number(theme.siteCard?.w) === layout.siteCard.w
        && Number(theme.siteCard?.h) === layout.siteCard.h
        && !!theme.siteCard?.showRemark === layout.siteCard.showRemark
        && !!theme.siteCard?.showDomain === layout.siteCard.showDomain;
}
