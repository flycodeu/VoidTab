// src/core/config/types.ts
import type {SyncProfile} from '../sync/types';

export const CURRENT_CONFIG_VERSION = 1 as const;

export interface SiteItem {
    id: string;
    title: string;
    url: string;

    // 你原来有 icon / iconType / iconValue / bgColor，这里要统一进类型，否则 default.ts 会报错
    icon?: string; // legacy: favicon url
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;
}

export interface Group {
    id: string;
    title: string;
    icon: string;
    items: SiteItem[];
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
}

export interface SearchEngine {
    id: string;
    name: string;
    url: string;
    icon: string;
}

export interface Config {
    version: number;
    sync: SyncProfile;

    layout: Group[];
    widgets: WidgetItem[];
    theme: ThemeConfig;

    searchEngines: SearchEngine[];
    currentEngineId: string;
}
