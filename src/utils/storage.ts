// 判断是否在 Chrome 扩展环境中
const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

export const storage = {
    // 读取数据 (异步)
    get: async (key: string, defaultValue: any) => {
        if (isExtension) {
            return new Promise((resolve) => {
                chrome.storage.sync.get([key], (result) => {
                    // 如果 storage 里没有，返回默认值
                    resolve(result[key] !== undefined ? result[key] : defaultValue);
                });
            });
        } else {
            // 开发环境：读取 localStorage
            const val = localStorage.getItem(key);
            try {
                return val ? JSON.parse(val) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        }
    },

    // 保存数据 (异步)
    set: async (key: string, value: any) => {
        if (isExtension) {
            return new Promise<void>((resolve) => {
                // 使用 sync 进行云同步
                // 注意：sync 有配额限制（每项 8KB，总共 100KB），适合存配置
                // 如果是壁纸这种大文件，后续建议改用 chrome.storage.local
                chrome.storage.sync.set({[key]: value}, () => {
                    resolve();
                });
            });
        } else {
            // 开发环境：写入 localStorage
            localStorage.setItem(key, JSON.stringify(value));
        }
    }
};