// src/core/registry/widgets.ts

/**
 * 组件元数据接口定义
 */
export interface WidgetMeta {
    type: string;
    label: string;
    description: string;
    defaultW: number;
    defaultH: number;
    /** * 组件分类：
     * time: 时间日期
     * system: 系统监控
     * tool: 效率工具
     */
    category: 'time' | 'system' | 'tool' | string;
}

/**
 * 组件注册表
 * 这里的 category 必须与 WidgetMarketplaceModal.vue 中的 categories ID 对应
 */
export const widgetRegistry: WidgetMeta[] = [
    {
        type: 'clock',
        label: '数字时钟',
        description: '极简风格的数字时钟，支持 1x1 到 4x2 的自适应排版及翻页动效。',
        defaultW: 2,
        defaultH: 2,
        category: 'time'
    },
    {
        type: 'calendar',
        label: '日历',
        description: '展示详细的公历与农历信息，支持点击查看月份大图及节假日详情。',
        defaultW: 2,
        defaultH: 2,
        category: 'time'
    },
    {
        type: 'weather',
        label: '实时天气',
        description: '自动获取当前城市气象数据，包含气温、风力及未来趋势预览。',
        defaultW: 2,
        defaultH: 2,
        category: 'system'
    },
    {
        type: 'system_monitor',
        label: '系统监控',
        description: '实时显示网络延迟、IP地址及系统资源占用情况。',
        defaultW: 2,
        defaultH: 2,
        category: 'system'
    }
];