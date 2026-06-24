// core/bookmarks/export.ts
import type {ConfigV6} from '../config/types.ts';
import {getTileUrl, isSiteTile} from '../tiles/tileAccess.ts';

const escapeHtml = (s: string) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const safeUrl = (url: string) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    // 允许用户只写域名：自动补 https
    if (!/^https?:\/\//i.test(raw)) return "https://" + raw;
    return raw;
};

/**
 * 只导出：分组 + 站点(title/url/remark)
 * 不导出：主题/同步/widget/runtime/terminal 等任何其它字段
 */
export function exportBookmarksToHtml(config: ConfigV6) {
    const groups = config.layout;

    const now = Math.floor(Date.now() / 1000);

    // Netscape Bookmark File Header
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

    // 根节点下每个分组 -> 一个文件夹
    for (const g of groups) {
        const groupTitle = escapeHtml(g?.title || "未命名分组");
        html += `  <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">${groupTitle}</H3>\n`;
        html += `  <DL><p>\n`;

        for (const tile of g.tiles) {
            if (!isSiteTile(tile)) continue;
            const url = safeUrl(getTileUrl(tile));
            if (!url) continue;

            const title = escapeHtml(tile.title || url);
            const remark = String(tile.remark || "").trim();

            // 备注写进 <DD>，Chrome/Edge 导入后一般会变成“备注/描述”
            html += `    <DT><A HREF="${escapeHtml(url)}" ADD_DATE="${now}">${title}</A>\n`;
            if (remark) {
                html += `    <DD>${escapeHtml(remark)}\n`;
            }
        }

        html += `  </DL><p>\n`;
    }

    html += `</DL><p>\n`;
    return html;
}
