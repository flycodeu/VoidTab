// 定义存储区域类型
type StorageArea = 'sync' | 'local';

const isExtension = typeof chrome !== 'undefined' && chrome.storage;

export const storage = {
    // 获取数据
    get: async (key: string, defaultValue: any, area: StorageArea = 'sync') => {
        if (isExtension) {
            return new Promise((resolve) => {
                // 动态选择 storage.sync 或 storage.local
                chrome.storage[area].get([key], (result) => {
                    resolve(result[key] !== undefined ? result[key] : defaultValue);
                });
            });
        } else {
            // 开发环境：全部存 localStorage，但在 key 前面加前缀模拟分区
            const realKey = `${area}_${key}`;
            const val = localStorage.getItem(realKey);
            try {
                return val ? JSON.parse(val) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        }
    },

    // 保存数据
    set: async (key: string, value: any, area: StorageArea = 'sync') => {
        if (isExtension) {
            return new Promise<void>((resolve) => {
                chrome.storage[area].set({ [key]: value }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(`Storage Error (${area}):`, chrome.runtime.lastError);
                    }
                    resolve();
                });
            });
        } else {
            // 开发环境
            const realKey = `${area}_${key}`;
            localStorage.setItem(realKey, JSON.stringify(value));
        }
    },

    // 删除数据 (用于清理旧壁纸)
    remove: async (key: string, area: StorageArea = 'sync') => {
        if (isExtension) {
            return new Promise<void>((resolve) => {
                chrome.storage[area].remove(key, resolve);
            });
        } else {
            localStorage.removeItem(`${area}_${key}`);
        }
    }
};