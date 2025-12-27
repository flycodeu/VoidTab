// src/utils/webdav.ts

export interface WebDavConfig {
    // 建议用户填：https://dav.jianguoyun.com/dav/ 或 https://dav.jianguoyun.com/
    url: string;
    username: string;
    password: string; // 坚果云建议用“应用专用密码”
}

const DAV_FOLDER = 'voidtab';
export const DEFAULT_BACKUP_FILENAME = 'voidtab-backup.json';

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
 * 把用户输入的 URL 归一化成 “只到 /dav 的 base”
 * DEV：坚果云变成 /jianguoyun/dav
 * PROD：变成 https://dav.jianguoyun.com/dav
 */
const normalizeDavBase = (inputUrl: string): string => {
    const raw = (inputUrl || '').trim();
    if (!raw) throw new Error('WebDAV URL 不能为空');

    // 补协议以便 URL 能 parse
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);

    // 强制 pathname 截断到 /dav（只保留一次）
    let p = parsed.pathname.replace(/\/+$/, '');
    const idx = p.toLowerCase().indexOf('/dav');
    if (idx >= 0) p = p.slice(0, idx + 4);
    else p = p ? `${p}/dav` : '/dav';

    // DEV 下坚果云走代理；其余不动
    if (import.meta.env.DEV && isJianguoyun(parsed.href)) {
        return `/jianguoyun${p}`.replace(/\/+$/, '');
    }

    return `${parsed.origin}${p}`.replace(/\/+$/, '');
};

/**
 * 生成最终访问 URL
 * 目录：{davBase}/voidtab/
 * 文件：{davBase}/voidtab/{filename}
 */
export const buildFullPath = (config: WebDavConfig, filename = ''): string => {
    const davBase = normalizeDavBase(config.url); // /jianguoyun/dav 或 https://.../dav
    const folderUrl = `${davBase}/${DAV_FOLDER}`.replace(/\/+$/, '');

    if (!filename) return `${folderUrl}/`;

    const safe = filename.replace(/^\/+/, '');
    return `${folderUrl}/${safe}`;
};

const webdavFetch = async (config: WebDavConfig, url: string, init: RequestInit) => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', authHeader(config));
    return fetch(url, {...init, headers});
};

/** 确保目录存在（已存在时 405/409 也视为 OK） */
export const ensureWebDavFolder = async (config: WebDavConfig): Promise<boolean> => {
    const folderUrl = buildFullPath(config); // .../voidtab/
    const resp = await webdavFetch(config, folderUrl, {method: 'MKCOL'});

    if (resp.status === 201) return true; // created
    if (resp.status === 204) return true; // some impl
    if (resp.status === 405 || resp.status === 409) return true; // already exists / conflict
    return false;
};

/** 1) 测试连接：MKCOL -> PROPFIND */
export const checkWebDavConnection = async (config: WebDavConfig): Promise<boolean> => {
    try {
        await ensureWebDavFolder(config);

        const targetUrl = buildFullPath(config); // .../voidtab/
        console.log(`[WebDAV] 测试连接 URL: ${targetUrl}`);

        const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:resourcetype/></d:prop>
</d:propfind>`;

        const resp = await webdavFetch(config, targetUrl, {
            method: 'PROPFIND',
            headers: {
                Depth: '0',
                'Content-Type': 'application/xml; charset=utf-8',
            },
            body,
        });

        // 207: Multi-Status（WebDAV 标准成功）
        if (resp.status === 207) return true;
        if (resp.ok) return true;

        console.warn('[WebDAV] PROPFIND failed:', resp.status);
        return false;
    } catch (e) {
        console.error('[WebDAV] 连接失败:', e);
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
        console.log(`[WebDAV] 上传 URL: ${targetUrl}`);

        const resp = await webdavFetch(config, targetUrl, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json; charset=utf-8'},
            body: JSON.stringify(data),
        });

        return resp.ok || resp.status === 201 || resp.status === 204;
    } catch (e) {
        console.error('[WebDAV] 上传失败:', e);
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
        console.log(`[WebDAV] 下载 URL: ${targetUrl}`);

        const resp = await webdavFetch(config, targetUrl, {method: 'GET'});
        if (!resp.ok) {
            console.warn('[WebDAV] 下载失败 status=', resp.status);
            return null;
        }
        return await resp.json();
    } catch (e) {
        console.error('[WebDAV] 下载失败:', e);
        return null;
    }
};
