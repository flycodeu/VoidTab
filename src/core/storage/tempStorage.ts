// src/core/storage/tempStorage.ts
import type {VoidTabTempConfig} from '../config/types-temp';

const KEY = 'voidtab-temp-config';

/**
 * 读取完整的临时配置
 */
function readConfig(): VoidTabTempConfig {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/**
 * 保存完整的临时配置
 */
function saveConfig(config: VoidTabTempConfig) {
    try {
        localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
        // Ignore quota failures for non-critical temporary caches.
    }
}

export const tempStorage = {
    /**
     * 获取指定模块的缓存
     * @param key 模块名 (e.g. 'holiday', 'github')
     */
    get<K extends keyof VoidTabTempConfig>(key: K): VoidTabTempConfig[K] | undefined {
        const config = readConfig();
        return config[key];
    },

    /**
     * 设置指定模块的缓存（自动合并，不影响其他模块）
     * @param key 模块名
     * @param value 数据
     */
    set<K extends keyof VoidTabTempConfig>(key: K, value: VoidTabTempConfig[K]) {
        const config = readConfig();
        config[key] = value;
        saveConfig(config);
    },

    /**
     * 清除指定模块的缓存
     */
    remove<K extends keyof VoidTabTempConfig>(key: K) {
        const config = readConfig();
        delete config[key];
        saveConfig(config);
    },

    /**
     * 检查缓存是否有效
     * @param ts 缓存的时间戳
     * @param expireMs 过期时间 (毫秒)
     */
    isValid(ts: number | undefined, expireMs: number): boolean {
        if (!ts) return false;
        return Date.now() - ts < expireMs;
    }
};
