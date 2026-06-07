// src/utils/webdav.ts
import {fetchWithRetry} from './network';

export interface WebDavConfig {
    // 建议用户填：https://dav.jianguoyun.com/dav/
    url: string;
    username: string;
    password: string; // 坚果云建议用“应用专用密码”
}

const DAV_FOLDER = 'voidtab';
export const DEFAULT_BACKUP_FILENAME = 'voidtab-backup.json';

//   1. 准确判断是否为插件环境 (Manifest V3)
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;

const isJianguoyun = (url: string) => /dav\.jianguoyun\.com/i.test(url);

/** 处理中文账号/密码的 Base64（避免 btoa 遇到非 ASCII 报错） */
const toBase64 = (input: string) => {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
};

const authHeader = (config: WebDavConfig) =>
    `Basic ${toBase64(`${config.username}:${config.password}`)}`;

/**
 *   核心修复：智能 URL 转换
 *
 * 策略：
 * 1. 插件环境 (Extension): 始终直接访问完整 URL (依赖 manifest host_permissions)
 * 2. 网页环境 (Vercel/Dev):
 * - 如果是坚果云 -> 替换为 /jianguoyun (走 vercel.json 代理)
 * - 其他网盘 -> 保持原样 (网页版直连其他网盘可能会有 CORS，除非也配代理)
 */
const getRequestBaseUrl = (inputUrl: string): string => {
    const raw = (inputUrl || '').trim();
    if (!raw) throw new Error('WebDAV URL 不能为空');

    // 补全协议，确保能被 URL 解析
    let fullUrl = raw.includes('://') ? raw : `https://${raw}`;
    // 移除末尾斜杠
    fullUrl = fullUrl.replace(/\/+$/, '');

    // 🔌 场景 A: 浏览器插件 -> 直连
    if (isExtension) {
        return fullUrl;
    }

    // 🌐 场景 B: 网页版 (Dev 或 Vercel) -> 坚果云走代理
    if (isJianguoyun(fullUrl)) {
        // 这里的逻辑是将 "https://dav.jianguoyun.com/dav" 替换为 "/jianguoyun/dav"
        // 或者是 "https://dav.jianguoyun.com" 替换为 "/jianguoyun"
        return fullUrl.replace(/^https?:\/\/dav\.jianguoyun\.com/, '/jianguoyun');
    }

    // 场景 C: 网页版其他网盘 -> 尝试直连
    return fullUrl;
};

/**
 * 生成完整路径
 * 目录：{base}/voidtab
 * 文件：{base}/voidtab/{filename}
 */
export const buildFullPath = (config: WebDavConfig, filename = ''): string => {
    const baseUrl = getRequestBaseUrl(config.url);
    // 确保 folder 干净
    const folder = DAV_FOLDER.replace(/^\/+|\/+$/g, '');

    // 拼接: Base + / + Folder
    let path = `${baseUrl}/${folder}`;

    // 如果有文件名，继续拼接
    if (filename) {
        const safeName = filename.replace(/^\/+/, '');
        path = `${path}/${safeName}`;
    } else {
        // 如果没有文件名，说明是操作目录，通常 WebDAV 目录操作习惯加个尾部斜杠
        path = `${path}/`;
    }

    return path;
};

/**
 *   核心修复：Fetch 封装
 * 增加了 credentials: 'omit' 以解决插件端 401 弹窗死循环
 */
const webdavFetch = async (config: WebDavConfig, url: string, init: RequestInit) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', authHeader(config));

    // 确保 Content-Type 默认值 (有些 WebDAV 服务端不仅需要 Auth 还需要这个)
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/xml; charset=utf-8');
    }

    return fetchWithRetry(url, {
        ...init,
        headers,
        // 🔥 关键点：防止浏览器弹出原生登录框，并允许跨域携带 Auth 头
        credentials: 'omit',
        mode: 'cors'
    }, {
        timeoutMs: 15000,
        retries: 2,
        retryDelayMs: 500,
        maxRetryDelayMs: 5000,
        metricName: `webdav.${method.toLowerCase()}`,
        fallbackName: `webdav.${method.toLowerCase()}.unavailable`,
        fallback: () => new Response('', {status: 503, statusText: 'Service Unavailable'}),
    });
};

/** 确保目录存在（已存在时 405/409 也视为 OK） */
export const ensureWebDavFolder = async (config: WebDavConfig): Promise<boolean> => {
    // 注意：创建目录时不带文件名
    const folderUrl = buildFullPath(config, '');

    // MKCOL 请求
    const resp = await webdavFetch(config, folderUrl, {method: 'MKCOL'});

    if (resp.status === 201) return true; // Created
    if (resp.status === 204) return true; // No Content
    if (resp.status === 405) return true; // Method Not Allowed (通常意味着目录已存在)
    if (resp.status === 409) return true; // Conflict (父目录不存在或已存在)

    // 如果是 401，这里会被拦截，不会弹窗，返回 false
    return false;
};

/** 1) 测试连接：MKCOL -> PROPFIND */
export const checkWebDavConnection = async (config: WebDavConfig): Promise<boolean> => {
    try {
        // 先尝试创建目录（如果有了就跳过，没有就创建）
        await ensureWebDavFolder(config);

        const targetUrl = buildFullPath(config, ''); // .../voidtab/
        const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:resourcetype/></d:prop>
</d:propfind>`;

        const resp = await webdavFetch(config, targetUrl, {
            method: 'PROPFIND',
            headers: {
                'Depth': '0', // 只检查当前文件夹
            },
            body,
        });

        // 207: Multi-Status（WebDAV 标准成功）
        if (resp.status === 207) return true;
        if (resp.ok) return true;

        return false;
    } catch {
        return false;
    }
};

/** 2) 上传备份（PUT） */
export const uploadToWebDav = async (
    config: WebDavConfig,
    data: any,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<boolean> => {
    try {
        await ensureWebDavFolder(config);

        const targetUrl = buildFullPath(config, filename);
        const resp = await webdavFetch(config, targetUrl, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json; charset=utf-8'},
            body: JSON.stringify(data),
        });

        return resp.ok || resp.status === 201 || resp.status === 204;
    } catch {
        return false;
    }
};

/** 3) 下载备份（GET） */
export const downloadFromWebDav = async (
    config: WebDavConfig,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<any | null> => {
    try {
        const targetUrl = buildFullPath(config, filename);
        const resp = await webdavFetch(config, targetUrl, {method: 'GET'});

        if (!resp.ok) {
            return null;
        }
        return await resp.json();
    } catch {
        return null;
    }
};
