// src/core/config/types.ts
import type {SyncProfile} from '../sync/types';

export const CURRENT_CONFIG_VERSION = 1 as const;
export type BookmarkDensity = 'compact' | 'normal' | 'comfortable';
// 新增排序类型定义
export type GroupSortKey = 'custom' | 'name' | 'lastVisited';
export type WidgetType = 'todo' | 'clock' | 'calendar' | 'weather' | 'system_monitor' | string;

export interface SiteItem {
    id: string;
    // --- 新增布局字段 ---
    kind?: 'site' | 'widget'; // 默认为 site
    w?: number; // 宽跨度 (1-4)
    h?: number; // 高跨度 (1-4)

    // --- 站点字段 ---
    title?: string; // 变为可选，因为 widget 可能不需要
    url?: string;
    icon?: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;

    // --- 组件字段 ---
    widgetType?: WidgetType;
    widgetConfig?: Record<string, any>;
}

export interface Group {
    id: string;
    title: string;
    icon: string;
    items: SiteItem[];
    sortKey?: GroupSortKey;
    iconColor?: string;   // 图标颜色 (fg)
    iconBgColor?: string; // 背景颜色 (bg)
}

export interface WidgetItem {
    id: string;
    name: string;
    visible: boolean;
    order: number;
    colSpan: number;
    config?: any;
}

export interface ThemeConfig {
    mode: 'light' | 'dark';
    sidebarPos: 'left' | 'right';
    showTime: boolean;
    gridMaxWidth: number;

    blur: number;
    opacity: number;
    wallpaper: string;

    techFont: boolean;
    breathingLight: boolean;
    neonGlow: boolean;
    customCursor: boolean;

    iconSize: number;
    radius: number;
    gap: number;

    showIconName: boolean;
    iconTextSize: number;

    icon: 'Folder';

    density: BookmarkDensity;

    showLogoText: boolean;   // 是否显示文字
    customLogoText: string;  // 自定义文字内容 (例如 "VoidTab")

    showGroupCount: boolean;
}

export interface SearchEngine {
    id: string;
    name: string;
    url: string;
    icon: string;
}

export interface AiConfig {
    // 移除 provider 枚举，改为通用配置
    baseUrl: string;  // 新增：接口地址 (例如 https://api.deepseek.com)
    apiKey: string;
    model: string;    // 模型名称 (例如 deepseek-chat)
    temperature: number;
    maxHistory: number;
}


export interface Config {
    version: number;
    sync: SyncProfile;

    layout: Group[];
    theme: ThemeConfig;

    searchEngines: SearchEngine[];
    currentEngineId: string;

    ai: AiConfig,
    focusMode: boolean;
}


