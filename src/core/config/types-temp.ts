// src/core/config/types-temp.ts

export interface HolidayCache {
    data: Record<string, any>; // 节假日具体数据
    year: number;              // 缓存年份
    ts: number;               // 写入时间戳
}

export interface GithubCache {
    data: any[];              // 热榜列表
    ts: number;               // 写入时间戳
}

export interface WeatherCache {
    data: any;
    city: string;
    ts: number;
}

export interface StockCache {
    data: any[];
    history: number[];
    symbols: string[];
    ts: number;
}

/** * 统一的临时数据结构
 * 键名对应业务模块，保持扁平化
 */
export interface VoidTabTempConfig {
    holiday?: HolidayCache;
    github?: GithubCache;
    weather?: WeatherCache;
    stock?: StockCache;
}
