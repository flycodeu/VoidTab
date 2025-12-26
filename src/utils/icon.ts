// src/utils/icon.ts

/**
 * 1. 白名单：知名大站，强制使用官方 CDN 原图 (绝对高清)
 */
const PRESET_ICONS: Record<string, string> = {
    // GitHub
    'github.com': 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    // Bilibili
    'bilibili.com': 'https://s1.hdslb.com/bfs/static/jinkela/long/images/512.png',
    // YouTube
    'youtube.com': 'https://www.youtube.com/s/desktop/10c3080e/img/favicon_144x144.png',
    // 淘宝
    'taobao.com': 'https://img.alicdn.com/tfs/TB1_uT8a5ZX8KJjSgoSXXa.sXXa-128-128.png',
    // 知乎
    'zhihu.com': 'https://static.zhihu.com/heifetz/assets/apple-touch-icon-152.a53ae37b.png',
    //CSDN
    'csdn.net': 'https://g.csdnimg.cn/static/logo/favicon32.ico',
};

/**
 * 获取高清网站图标
 */
export const getHighResIconUrl = (url: string): string => {
    if (!url) return '';

    try {
        let fullUrl = url;
        if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;

        const domain = new URL(fullUrl).hostname;

        // 2. 排除内网 IP (172.x, 192.x, 10.x, localhost)
        // 内网服务公网 API 抓不到，返回空字符串让组件显示“文字”或“默认地球仪”
        if (
            domain === 'localhost' ||
            domain.startsWith('127.') ||
            domain.startsWith('192.168.') ||
            domain.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(domain)
        ) {
            return '';
        }

        // 3. 检查白名单 (大站)
        // 移除 www. 前缀匹配
        const rootDomain = domain.replace(/^www\./, '');
        if (PRESET_ICONS[domain]) return PRESET_ICONS[domain];
        if (PRESET_ICONS[rootDomain]) return PRESET_ICONS[rootDomain];

        // 4. ✨✨✨ 终极通用方案：Yandex ✨✨✨
        // Yandex 的图标服务比 Google 清晰得多，尤其是对于中小型网站
        // size=120: 请求 120px 的高清图
        return `https://favicon.yandex.net/favicon/${domain}?size=120`;

    } catch (e) {
        console.warn('解析域名失败:', e);
        return '';
    }
};