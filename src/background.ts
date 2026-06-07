// src/background.ts
import {
    CONFIG_KEY,
    WALLPAPER_KEY,
    LOCAL_WALLPAPER_MARKER,
    CTX_MENU_SET_WALLPAPER_ID
} from './core/config/keys';
import {fetchWithRetry} from './shared/utils/network';

// 监听安装事件：创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: CTX_MENU_SET_WALLPAPER_ID,
        title: '设为 VoidTab 壁纸',
        contexts: ['image'],
    });
});

// 监听菜单点击事件
chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === CTX_MENU_SET_WALLPAPER_ID && info.srcUrl) {
        convertImageToBase64(info.srcUrl);
    }
});

// 辅助函数：将网络图片转为 Base64
async function convertImageToBase64(url: string) {
    try {
        const response = await fetchWithRetry(url, {cache: 'force-cache'}, {
            timeoutMs: 10000,
            retries: 1,
            retryDelayMs: 500,
            maxRetryDelayMs: 1500,
            metricName: 'background.wallpaper.fetch',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob || blob.size <= 0) throw new Error('empty image blob');

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;

            // 存入 local storage (大图)
            chrome.storage.local.set({[WALLPAPER_KEY]: base64data}, () => {
                console.log('壁纸已保存到本地存储');
            });

            // 更新 sync storage 标记位
            chrome.storage.sync.get([CONFIG_KEY], (result) => {
                const config: any = result[CONFIG_KEY] || {};
                if (!config.theme) config.theme = {};

                config.theme.wallpaper = LOCAL_WALLPAPER_MARKER;

                chrome.storage.sync.set({[CONFIG_KEY]: config});
            });
        };

        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('图片下载失败:', error);
    }
}
