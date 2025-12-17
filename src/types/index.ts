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
    mode: 'dark' | 'light';

    // 视觉材质
    blur: number;
    opacity: number;

    // 图标布局
    iconSize: number;      // 图标大小 (px)
    radius: number;        // 圆角 (px)
    gap: number;           // 间距 (px)

    // 文字设置
    showIconName: boolean; // 是否显示名称
    iconTextSize: number;  // 文字大小 (px)
    iconTextColor: string; // 文字颜色 (Hex)

    // 整体布局
    gridMaxWidth: number;  // 图标区域最大宽度 (px)
    sidebarPos: 'left' | 'right';
    showTime: boolean;
}

export interface UserConfig {
    theme: ThemeConfig;
    currentEngineId: string;
    searchEngines: SearchEngineItem[];
    layout: LinkGroup[];
}