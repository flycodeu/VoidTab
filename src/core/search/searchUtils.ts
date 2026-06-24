import type {ConfigV6, SearchEngine} from '../config/types';
import type {SiteTile, Workspace} from '../tiles/contracts.ts';
import {getTileUrl, isSiteTile} from '../tiles/tileAccess.ts';

export type SearchTemplateValidation = {
    ok: boolean;
    normalizedUrl: string;
    message: string;
};

export type SearchShortcutMatch = {
    engine: SearchEngine;
    query: string;
    token: string;
};

export type SearchSuggestion =
    | {
    id: string;
    type: 'shortcut';
    label: string;
    sub: string;
    query: string;
    engine: SearchEngine;
    token: string;
}
    | {
    id: string;
    type: 'completion';
    label: string;
    sub: string;
    query: string;
}
    | {
    id: string;
    type: 'history';
    label: string;
    sub: string;
    query: string;
};

export type LocalSearchResult = SiteTile & {
    groupName: string;
    score: number;
};

const SEARCH_PLACEHOLDER_RE = /(\{query\}|%s)/i;
const QUICK_SITE_ALIASES: Record<string, string> = {
    github: 'https://github.com',
    gh: 'https://github.com',
    bilibili: 'https://www.bilibili.com',
    bili: 'https://www.bilibili.com',
    youtube: 'https://www.youtube.com',
    yt: 'https://www.youtube.com',
    google: 'https://www.google.com',
    baidu: 'https://www.baidu.com',
    bing: 'https://www.bing.com',
    npm: 'https://www.npmjs.com',
    mdn: 'https://developer.mozilla.org',
};

const SEARCH_HINTS = [
    '今天新闻',
    '天气',
    '翻译',
    'AI 工具',
    'GitHub trending',
    'Vue 3 文档',
    'TypeScript utility types',
    'cron 表达式',
    'JWT 调试',
    'Base64 编码',
];

export function validateSearchTemplate(value: string): SearchTemplateValidation {
    const raw = String(value || '').trim();
    if (!raw) {
        return {ok: false, normalizedUrl: '', message: '请输入搜索 URL 模板'};
    }

    if (!/^https?:\/\//i.test(raw)) {
        return {ok: false, normalizedUrl: raw, message: 'URL 必须以 http:// 或 https:// 开头'};
    }

    try {
        new URL(raw.replace(SEARCH_PLACEHOLDER_RE, 'voidtab'));
    } catch {
        return {ok: false, normalizedUrl: raw, message: 'URL 格式不正确'};
    }

    if (SEARCH_PLACEHOLDER_RE.test(raw)) {
        return {ok: true, normalizedUrl: raw, message: '模板有效'};
    }

    if (/[?&][^=]+=$/.test(raw) || raw.endsWith('=')) {
        return {
            ok: true,
            normalizedUrl: raw,
            message: '已识别为兼容前缀模板，搜索词会追加在末尾',
        };
    }

    return {
        ok: false,
        normalizedUrl: raw,
        message: '请在 URL 中加入 {query} 或 %s，例如 https://www.google.com/search?q={query}',
    };
}

export function buildSearchUrl(engine: SearchEngine | undefined, query: string) {
    const template = String(engine?.url || '').trim();
    const encoded = encodeURIComponent(query.trim());
    if (!template || !encoded) return '';
    if (SEARCH_PLACEHOLDER_RE.test(template)) {
        return template.replace(SEARCH_PLACEHOLDER_RE, encoded);
    }
    return `${template}${encoded}`;
}

export function getEngineShortcutTokens(engine: SearchEngine) {
    const id = engine.id.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const name = engine.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const tokens = new Set<string>();

    if (id) {
        tokens.add(id);
        tokens.add(id.slice(0, 1));
    }
    if (name) {
        tokens.add(name);
        tokens.add(name.slice(0, 1));
    }

    return Array.from(tokens).filter(Boolean);
}

export function parseSearchShortcut(input: string, engines: SearchEngine[]): SearchShortcutMatch | null {
    const text = input.trim();
    const match = text.match(/^!(\S+)(?:\s+(.+))?$/);
    if (!match) return null;

    const token = match[1].toLowerCase();
    const query = (match[2] || '').trim();
    const engine = engines.find((item) => getEngineShortcutTokens(item).includes(token));
    if (!engine || !query) return null;

    return {engine, query, token};
}

export function isLikelyUrl(input: string) {
    const text = input.trim();
    if (!text || /\s/.test(text)) return false;
    if (/^(https?:\/\/|www\.|localhost(?::\d+)?(?:\/|$)|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$))/i.test(text)) {
        return true;
    }
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(text);
}

export function resolveQuickSiteUrl(input: string) {
    return QUICK_SITE_ALIASES[input.trim().toLowerCase()] || '';
}

export function normalizeDirectUrl(input: string) {
    const text = input.trim();
    if (!text) return '';
    const quick = QUICK_SITE_ALIASES[text.toLowerCase()];
    if (quick) return quick;
    if (/^https?:\/\//i.test(text)) return text;
    if (/^localhost(?::\d+)?(?:\/|$)/i.test(text)) return `http://${text}`;
    return `https://${text.replace(/^www\./i, 'www.')}`;
}

export function findLocalResults(layout: ConfigV6['layout'] | Workspace[], query: string, limit = 6): LocalSearchResult[] {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];

    const results: LocalSearchResult[] = [];
    for (const group of layout || []) {
        for (const tile of group.tiles) {
            if (!isSiteTile(tile)) continue;

            const title = (tile.title || '').toLowerCase();
            const url = getTileUrl(tile).toLowerCase();
            const remark = (tile.remark || '').toLowerCase();
            const tags = Array.isArray(tile.tags) ? tile.tags.join(' ').toLowerCase() : '';
            const haystack = `${title} ${url} ${remark} ${tags}`;
            if (!haystack.includes(keyword)) continue;

            let score = 1;
            if (title === keyword) score += 8;
            else if (title.startsWith(keyword)) score += 5;
            if (url.includes(keyword)) score += 2;
            if (tags.includes(keyword)) score += 2;

            results.push({...tile, groupName: group.title, score});
        }
    }

    return results
        .sort((a, b) => b.score - a.score || String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'))
        .slice(0, limit);
}

export function createSearchSuggestions(input: string, engines: SearchEngine[], historyStats: any[] = []): SearchSuggestion[] {
    const text = input.trim();
    if (!text) return [];

    const suggestions: SearchSuggestion[] = [];
    const shortcut = parseSearchShortcut(text, engines);
    if (shortcut) {
        suggestions.push({
            id: `shortcut:${shortcut.engine.id}`,
            type: 'shortcut',
            label: `用 ${shortcut.engine.name} 搜索「${shortcut.query}」`,
            sub: `快捷指令 !${shortcut.token}`,
            query: shortcut.query,
            engine: shortcut.engine,
            token: shortcut.token,
        });
    }

    const keyword = text.toLowerCase();
    for (const stat of historyStats.slice(0, 30)) {
        const content = String(stat?.content || '').trim();
        if (!content || content.toLowerCase() === keyword || !content.toLowerCase().includes(keyword)) continue;
        suggestions.push({
            id: `history:${content}`,
            type: 'history',
            label: content,
            sub: `使用记录 · ${Number(stat?.count || 0)} 次`,
            query: content,
        });
        if (suggestions.length >= 4) break;
    }

    for (const hint of SEARCH_HINTS) {
        if (!hint.toLowerCase().includes(keyword) || hint.toLowerCase() === keyword) continue;
        suggestions.push({
            id: `hint:${hint}`,
            type: 'completion',
            label: hint,
            sub: '搜索建议',
            query: hint,
        });
        if (suggestions.length >= 6) break;
    }

    if (!suggestions.some((item) => item.type === 'completion' && item.query === text)) {
        suggestions.push({
            id: `completion:${text}`,
            type: 'completion',
            label: `${text} 是什么`,
            sub: '补全问题',
            query: `${text} 是什么`,
        });
    }

    return suggestions.slice(0, 6);
}
