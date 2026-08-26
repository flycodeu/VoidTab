// src/utils/webdav.ts
import {fetchWithRetry} from './network';

export interface WebDavConfig {
    // 建议用户填：https://dav.jianguoyun.com/dav/
    url: string;
    username: string;
    password: string; // 坚果云建议用“应用专用密码”
    folder?: string;
}

export interface WebDavActionResult<T = unknown> {
    ok: boolean;
    message: string;
    status?: number;
    data?: T;
    remoteEtag?: string;
    remoteMtime?: string;
}

const DAV_FOLDER = 'voidtab';
export const DEFAULT_BACKUP_FILENAME = 'voidtab-backup.json';

//   1. 准确判断是否为插件环境 (Manifest V3)
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;

const isJianguoyun = (url: string) => /dav\.jianguoyun\.com/i.test(url);

const normalizeWebDavFolder = (folder: unknown) => {
    const raw = typeof folder === 'string' ? folder.trim() : '';
    return (raw || DAV_FOLDER).replace(/^\/+|\/+$/g, '') || DAV_FOLDER;
};

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
    const folder = normalizeWebDavFolder(config.folder);

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

const explainHttpStatus = (status: number, action: 'test' | 'upload' | 'download') => {
    if (status === 401 || status === 403) return '认证失败：请检查账号和密码，坚果云等服务通常需要应用专用密码';
    if (status === 404) return action === 'download'
        ? '未找到云端备份文件，请先执行一次立即备份'
        : 'WebDAV 路径不存在，请检查服务器地址和文件夹';
    if (status === 405) return '服务器拒绝该 WebDAV 方法，请确认填写的是 WebDAV 地址而不是普通网页地址';
    if (status === 409) return '远端目录冲突：请检查文件夹路径，嵌套目录需要先在网盘侧创建父目录';
    if (status === 413) return '备份文件过大，服务器拒绝上传';
    if (status === 423) return '远端文件被锁定，请稍后重试';
    if (status === 429) return '请求过于频繁，请稍后再试';
    if (status === 503) return '网络不可达或被 CORS 拦截：网页版默认仅坚果云走代理，其他服务建议使用扩展版或配置跨域';
    if (status >= 500) return `WebDAV 服务暂时不可用（HTTP ${status}）`;
    return `WebDAV 请求失败（HTTP ${status}）`;
};

const explainError = (error: unknown) => {
    if (error instanceof Error) {
        if (/URL 不能为空/.test(error.message)) return 'WebDAV URL 不能为空';
        if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
            return '网络请求失败，可能是地址不可达、证书异常或浏览器 CORS 限制';
        }
        return error.message || 'WebDAV 请求失败';
    }
    return 'WebDAV 请求失败';
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

const getRemoteMetadata = (response: Response) => ({
    remoteEtag: response.headers.get('etag') || undefined,
    remoteMtime: response.headers.get('last-modified') || undefined,
});

/** 确保目录存在（已存在时 405/409 也视为 OK） */
export const ensureWebDavFolderDetailed = async (config: WebDavConfig): Promise<WebDavActionResult> => {
    // 注意：创建目录时不带文件名
    let folderUrl = '';

    try {
        folderUrl = buildFullPath(config, '');
        const resp = await webdavFetch(config, folderUrl, {method: 'MKCOL'});

        if (resp.status === 201) return {ok: true, status: resp.status, message: '远端文件夹已创建'};
        if (resp.status === 204) return {ok: true, status: resp.status, message: '远端文件夹可用'};
        if (resp.status === 405) return {ok: true, status: resp.status, message: '远端文件夹已存在'};

        return {ok: false, status: resp.status, message: explainHttpStatus(resp.status, 'test')};
    } catch (error) {
        return {ok: false, message: explainError(error)};
    }
};

export const ensureWebDavFolder = async (config: WebDavConfig): Promise<boolean> => {
    const result = await ensureWebDavFolderDetailed(config);
    return result.ok;
};

/** 1) 测试连接：MKCOL -> PROPFIND */
export const checkWebDavConnectionDetailed = async (config: WebDavConfig): Promise<WebDavActionResult> => {
    try {
        // 先尝试创建目录（如果有了就跳过，没有就创建）
        const folderResult = await ensureWebDavFolderDetailed(config);
        if (!folderResult.ok && folderResult.status !== 409) return folderResult;

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
        if (resp.status === 207 || resp.ok) return {ok: true, status: resp.status, message: '连接成功'};

        return {ok: false, status: resp.status, message: explainHttpStatus(resp.status, 'test')};
    } catch (error) {
        return {ok: false, message: explainError(error)};
    }
};

export const checkWebDavConnection = async (config: WebDavConfig): Promise<boolean> => {
    const result = await checkWebDavConnectionDetailed(config);
    return result.ok;
};

/** 2) 上传备份（PUT） */
export const uploadToWebDavDetailed = async (
    config: WebDavConfig,
    data: any,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<WebDavActionResult> => {
    try {
        const folderResult = await ensureWebDavFolderDetailed(config);
        if (!folderResult.ok && folderResult.status !== 409) return folderResult;

        const targetUrl = buildFullPath(config, filename);
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        const resp = await webdavFetch(config, targetUrl, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json; charset=utf-8'},
            body,
        });

        if (resp.ok || resp.status === 201 || resp.status === 204) {
            return {
                ok: true,
                status: resp.status,
                message: '云端备份成功',
                ...getRemoteMetadata(resp),
            };
        }
        return {ok: false, status: resp.status, message: explainHttpStatus(resp.status, 'upload')};
    } catch (error) {
        return {ok: false, message: explainError(error)};
    }
};

export const uploadToWebDav = async (
    config: WebDavConfig,
    data: any,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<boolean> => {
    const result = await uploadToWebDavDetailed(config, data, filename);
    return result.ok;
};

/** 3) 下载备份（GET） */
export const downloadFromWebDavDetailed = async (
    config: WebDavConfig,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<WebDavActionResult<string>> => {
    try {
        const targetUrl = buildFullPath(config, filename);
        const resp = await webdavFetch(config, targetUrl, {method: 'GET'});

        if (!resp.ok) {
            return {ok: false, status: resp.status, message: explainHttpStatus(resp.status, 'download')};
        }
        return {
            ok: true,
            status: resp.status,
            message: '下载成功',
            data: await resp.text(),
            ...getRemoteMetadata(resp),
        };
    } catch (error) {
        return {ok: false, message: explainError(error)};
    }
};

export const downloadFromWebDav = async (
    config: WebDavConfig,
    filename: string = DEFAULT_BACKUP_FILENAME
): Promise<any | null> => {
    const result = await downloadFromWebDavDetailed(config, filename);
    if (!result.ok || !result.data) return null;

    try {
        return JSON.parse(result.data);
    } catch {
        return result.data;
    }
};
