import {defineStore} from 'pinia';
import {ref, watch} from 'vue';

// 定义统计数据结构
export type SiteStats = Record<string, { lastVisited: number; count: number }>;

const STORAGE_KEY = 'voidtab_site_stats';

export const useStatsStore = defineStore('stats', () => {
    // ✅ 修复：提取初始化逻辑为一个普通函数
    const getInitialStats = (): SiteStats => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    };

    // ✅ 修复：调用函数获取结果，而不是传函数本身
    const siteStats = ref<SiteStats>(getInitialStats());

    // 2. 监听：一旦数据变化，立刻写回 LocalStorage
    watch(siteStats, (newVal) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));
    }, {deep: true});

    // 3. Action：记录点击
    const recordVisit = (siteId: string) => {
        if (!siteStats.value[siteId]) {
            siteStats.value[siteId] = {lastVisited: 0, count: 0};
        }

        // 更新时间戳和次数
        siteStats.value[siteId].lastVisited = Date.now();
        siteStats.value[siteId].count += 1;
    };

    // 4. Getter：获取某站点的最后访问时间
    const getLastVisited = (siteId: string) => {
        return siteStats.value[siteId]?.lastVisited || 0;
    };

    // 新增 Getter：获取点击次数 (调试用)
    const getCount = (siteId: string) => {
        return siteStats.value[siteId]?.count || 0;
    };

    return {
        siteStats,
        recordVisit,
        getLastVisited,
        getCount
    };
});