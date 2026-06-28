// core/bookmarks/browserBookmarks.ts
//
// Read/write the live browser bookmark tree (Chrome / Edge; falls back to the
// `browser.*` namespace where present). Used by the two-way bookmark sync:
// - read folders -> normalized groups so the store can MERGE them into the
//   layout (never overwrite),
// - write VoidTab groups back into the browser, merging by folder title and
//   skipping bookmarks whose URL already exists (no delete, no overwrite).
//
// The `bookmarks` permission is optional and requested at runtime; the web
// build has no bookmarks API and every entry point degrades to "unsupported".
import {browserAPI} from '../../shared/utils/browser.ts';

export interface BrowserBookmarkItem {
    title: string;
    url: string;
}

export interface BrowserBookmarkGroup {
    title: string;
    items: BrowserBookmarkItem[];
}

interface BookmarkTreeNode {
    id: string;
    title?: string;
    url?: string;
    children?: BookmarkTreeNode[];
}

const api = () => browserAPI as {
    bookmarks?: {
        getTree: (cb: (nodes: BookmarkTreeNode[]) => void) => void;
        getChildren: (id: string, cb: (nodes: BookmarkTreeNode[]) => void) => void;
        create: (details: {parentId?: string; title?: string; url?: string}, cb: (node: BookmarkTreeNode) => void) => void;
    };
    permissions?: {
        contains: (p: {permissions: string[]}, cb: (granted: boolean) => void) => void;
        request: (p: {permissions: string[]}, cb: (granted: boolean) => void) => void;
        remove: (p: {permissions: string[]}, cb: (removed: boolean) => void) => void;
    };
    runtime?: {lastError?: {message?: string} | null};
};

/** True only inside an extension whose runtime actually exposes the bookmarks/permissions APIs. */
export function isBrowserBookmarksSupported(): boolean {
    const a = api();
    return !!(a && a.permissions && typeof a.permissions.request === 'function' && a.runtime);
}

const lastError = () => api().runtime?.lastError || null;

export async function hasBookmarksPermission(): Promise<boolean> {
    const a = api();
    if (!a.permissions) return false;
    return new Promise((resolve) => {
        try {
            a.permissions!.contains({permissions: ['bookmarks']}, (granted) => resolve(!!granted && !lastError()));
        } catch {
            resolve(false);
        }
    });
}

/** Must be called from a user gesture (button click) or browsers reject the request. */
export async function requestBookmarksPermission(): Promise<boolean> {
    const a = api();
    if (!a.permissions) return false;
    return new Promise((resolve) => {
        try {
            a.permissions!.request({permissions: ['bookmarks']}, (granted) => resolve(!!granted && !lastError()));
        } catch {
            resolve(false);
        }
    });
}

const getTree = (): Promise<BookmarkTreeNode[]> => new Promise((resolve, reject) => {
    const a = api();
    if (!a.bookmarks) return reject(new Error('当前环境不支持书签 API'));
    a.bookmarks.getTree((nodes) => {
        const err = lastError();
        if (err) reject(new Error(err.message || '读取浏览器书签失败'));
        else resolve(nodes || []);
    });
});

const getChildren = (id: string): Promise<BookmarkTreeNode[]> => new Promise((resolve, reject) => {
    const a = api();
    if (!a.bookmarks) return reject(new Error('当前环境不支持书签 API'));
    a.bookmarks.getChildren(id, (nodes) => {
        const err = lastError();
        if (err) reject(new Error(err.message || '读取书签夹失败'));
        else resolve(nodes || []);
    });
});

const createNode = (details: {parentId?: string; title?: string; url?: string}): Promise<BookmarkTreeNode> => new Promise((resolve, reject) => {
    const a = api();
    if (!a.bookmarks) return reject(new Error('当前环境不支持书签 API'));
    a.bookmarks.create(details, (node) => {
        const err = lastError();
        if (err) reject(new Error(err.message || '写入书签失败'));
        else resolve(node);
    });
});

const cleanTitle = (value: unknown) => String(value || '').trim().slice(0, 120);

/**
 * Flatten the bookmark tree into one group per folder that directly contains
 * bookmarks. Folder title becomes the group title (root containers like the
 * bookmarks bar keep their localized name).
 */
export async function readBrowserBookmarkGroups(): Promise<BrowserBookmarkGroup[]> {
    const tree = await getTree();
    const groups: BrowserBookmarkGroup[] = [];

    const walk = (node: BookmarkTreeNode, fallbackTitle: string) => {
        const children = node.children || [];
        const items: BrowserBookmarkItem[] = [];
        for (const child of children) {
            if (child.url) {
                const url = String(child.url);
                if (/^(https?|ftp):/i.test(url)) {
                    items.push({title: cleanTitle(child.title) || url, url});
                }
            }
        }
        if (items.length) {
            groups.push({title: cleanTitle(node.title) || fallbackTitle, items});
        }
        for (const child of children) {
            if (!child.url) walk(child, cleanTitle(child.title) || '书签');
        }
    };

    // Root node(s) have no title; their children are the top containers.
    for (const root of tree) {
        for (const container of root.children || []) {
            if (!container.url) walk(container, cleanTitle(container.title) || '书签栏');
        }
    }
    return groups;
}

const norm = (value: string) => value.trim().toLowerCase();

const urlKey = (url: unknown) => {
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.hash = '';
        parsed.hostname = parsed.hostname.toLowerCase();
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return raw.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
    }
};

export interface BrowserBookmarkWriteResult {
    addedBookmarks: number;
    createdFolders: number;
    skipped: number;
}

/**
 * Write VoidTab groups into the browser, under a single "VoidTab" parent folder
 * in the bookmarks bar. Folders are matched/merged by title; bookmarks already
 * present (by normalized URL) are skipped. Nothing is deleted or overwritten.
 */
export async function writeGroupsToBrowser(
    groups: {title: string; items: BrowserBookmarkItem[]}[],
    parentTitle = 'VoidTab',
): Promise<BrowserBookmarkWriteResult> {
    const result: BrowserBookmarkWriteResult = {addedBookmarks: 0, createdFolders: 0, skipped: 0};
    const tree = await getTree();
    // Bookmarks bar is conventionally id "1"; fall back to the first container.
    const bar = tree[0]?.children?.find((node) => node.id === '1') || tree[0]?.children?.[0];
    const barId = bar?.id || '1';

    const barChildren = await getChildren(barId);
    let parent = barChildren.find((node) => !node.url && norm(cleanTitle(node.title)) === norm(parentTitle));
    if (!parent) {
        parent = await createNode({parentId: barId, title: parentTitle});
        result.createdFolders += 1;
    }

    const parentChildren = await getChildren(parent.id);

    for (const group of groups) {
        const title = cleanTitle(group.title) || '未命名分组';
        const validItems = group.items.filter((item) => urlKey(item.url));
        if (!validItems.length) continue;

        let folder = parentChildren.find((node) => !node.url && norm(cleanTitle(node.title)) === norm(title));
        if (!folder) {
            folder = await createNode({parentId: parent.id, title});
            parentChildren.push(folder);
            result.createdFolders += 1;
        }

        const existing = await getChildren(folder.id);
        const have = new Set(existing.filter((node) => node.url).map((node) => urlKey(node.url)));

        for (const item of validItems) {
            const key = urlKey(item.url);
            if (have.has(key)) {
                result.skipped += 1;
                continue;
            }
            have.add(key);
            await createNode({parentId: folder.id, title: cleanTitle(item.title) || item.url, url: item.url});
            result.addedBookmarks += 1;
        }
    }

    return result;
}
