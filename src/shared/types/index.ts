export type SearchEngine = 'google' | 'baidu' | 'bing';

export interface SearchEngineItem {
    id: string;
    name: string;
    url: string;
    icon: string;
}

export interface LinkItem {
    id: string;
    title: string;
    url: string;
    iconType: 'icon' | 'text';
    iconValue: string;
    bgColor?: string;
}

export interface LinkGroup {
    id: string;
    title: string;
    icon: string;
    items: LinkItem[];
}

export interface ThemeConfig {
    wallpaper: string;
    mode: 'dark' | 'light' | 'system';

    // 视觉材质
    blur: number;
    opacity: number;

    // 图标布局
    iconSize: number;
    radius: number;
    gap: number;

    // 文字设置
    showIconName: boolean;
    iconTextSize: number;
    iconTextColor: string;

    // 整体布局
    gridMaxWidth: number;
    sidebarPos: 'left' | 'right';
    showTime: boolean;

    techFont: boolean;       // 是否使用等宽数字字体 (时间)
    breathingLight: boolean; // 是否开启侧边栏呼吸灯
    neonGlow: boolean;       // 是否开启霓虹边框发光
    customCursor: boolean;   // 是否开启自定义科技光标
}

export interface UserConfig {
    theme: ThemeConfig;
    currentEngineId: string;
    searchEngines: SearchEngineItem[];
    layout: LinkGroup[];
}