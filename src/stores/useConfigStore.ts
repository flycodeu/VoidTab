import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UserConfig, LinkGroup, LinkItem, SearchEngineItem } from '../types';

const defaultEngines: SearchEngineItem[] = [
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=', icon: 'PawPrint' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'GoogleLogo' },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'MagnifyingGlass' },
];

const defaultConfig: UserConfig = {
    theme: {
        wallpaper: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
        mode: 'dark',
        blur: 20,
        opacity: 0.3,
        iconSize: 72,
        radius: 24,
        gap: 32,
        showIconName: true,
        iconTextSize: 14,
        iconTextColor: '#ffffff',
        gridMaxWidth: 1200,
        sidebarPos: 'left',
        showTime: true,
        techFont: true,
        breathingLight: true,
        neonGlow: true,
        customCursor: true,
    },
    currentEngineId: 'baidu',
    searchEngines: defaultEngines,
    layout: [
        {
            id: 'g-1',
            title: '生产环境',
            icon: 'Briefcase',
            items: [
                { id: '1', title: '文档中心', url: '#', iconType: 'text', iconValue: '文', bgColor: '#ef4444' },
            ]
        },
        {
            id: 'g-2',
            title: '常用工具',
            icon: 'Star',
            items: []
        }
    ]
};

export const useConfigStore = defineStore('config', () => {
    const config = ref<UserConfig>(defaultConfig);

    // === 分类 (Group) 操作 ===

    // 修复：接收对象 { title, icon }
    function addGroup(data: { title: string, icon: string }) {
        config.value.layout.push({
            id: `g-${Date.now()}`, // 生成唯一 ID
            title: data.title || '新分类',
            icon: data.icon || 'Folder',
            items: []
        });
    }

    function removeGroup(groupId: string) {
        // 至少保留一个分类
        if (config.value.layout.length <= 1) {
            alert("请至少保留一个分类");
            return;
        }
        config.value.layout = config.value.layout.filter(g => g.id !== groupId);
    }

    function updateGroup(groupId: string, data: Partial<LinkGroup>) {
        const group = config.value.layout.find(g => g.id === groupId);
        if (group) {
            Object.assign(group, data);
        }
    }

    // === 网站 (Site) 操作 ===

    function addSite(groupId: string, item: Omit<LinkItem, 'id'>) {
        const group = config.value.layout.find(g => g.id === groupId);
        if (group) {
            group.items.push({
                ...item,
                id: `site-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // 确保 ID 绝对唯一
            });
        } else {
            console.error('Group not found:', groupId);
        }
    }

    function removeSite(groupId: string, itemId: string) {
        const group = config.value.layout.find(g => g.id === groupId);
        if (group) {
            group.items = group.items.filter(i => i.id !== itemId);
        }
    }

    function updateSite(groupId: string, itemId: string, newData: Partial<LinkItem>) {
        const group = config.value.layout.find(g => g.id === groupId);
        if (group) {
            const index = group.items.findIndex(i => i.id === itemId);
            if (index !== -1) {
                group.items[index] = { ...group.items[index], ...newData };
            }
        }
    }

    // === 搜索引擎操作 ===
    function addEngine(name: string, url: string) {
        config.value.searchEngines.push({ id: `se-${Date.now()}`, name, url, icon: 'Globe' });
    }
    function removeEngine(id: string) {
        if (config.value.searchEngines.length <= 1) return;
        config.value.searchEngines = config.value.searchEngines.filter(e => e.id !== id);
        if (config.value.currentEngineId === id) config.value.currentEngineId = config.value.searchEngines[0].id;
    }

    return {
        config,
        addGroup, removeGroup, updateGroup,
        addSite, removeSite, updateSite,
        addEngine, removeEngine
    };
}, { persist: true });