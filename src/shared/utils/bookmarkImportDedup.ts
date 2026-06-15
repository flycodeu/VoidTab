import type {Group, SiteItem} from '../../core/config/types';

export interface BookmarkDuplicateStats {
    skippedExisting: number;
    skippedWithinFile: number;
    skippedInvalid: number;
    examples: string[];
}

export interface BookmarkDedupeResult {
    groups: Group[];
    importedCount: number;
    duplicateStats: BookmarkDuplicateStats;
}

const MAX_DUPLICATE_EXAMPLES = 3;

export function createBookmarkUrlKey(url: unknown): string {
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        parsed.hash = '';
        parsed.hostname = parsed.hostname.toLowerCase();
        if (parsed.protocol === 'http:' && parsed.port === '80') parsed.port = '';
        if (parsed.protocol === 'https:' && parsed.port === '443') parsed.port = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return raw.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
    }
}

const describeBookmark = (item: SiteItem) => {
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    return title && url ? `${title} (${url})` : title || url || '未命名书签';
};

export function dedupeImportedBookmarkGroups(
    incomingGroups: Group[],
    existingGroups: Group[]
): BookmarkDedupeResult {
    const existingKeys = new Set<string>();
    const seen = new Set<string>();
    const stats: BookmarkDuplicateStats = {
        skippedExisting: 0,
        skippedWithinFile: 0,
        skippedInvalid: 0,
        examples: [],
    };

    for (const group of existingGroups) {
        for (const item of group.items || []) {
            const key = createBookmarkUrlKey(item.url);
            if (key) {
                existingKeys.add(key);
                seen.add(key);
            }
        }
    }

    let importedCount = 0;
    const groups: Group[] = [];

    for (const group of incomingGroups) {
        const nextItems: SiteItem[] = [];

        for (const item of group.items || []) {
            const key = createBookmarkUrlKey(item.url);
            if (!key) {
                stats.skippedInvalid += 1;
                continue;
            }

            if (existingKeys.has(key)) {
                stats.skippedExisting += 1;
                if (stats.examples.length < MAX_DUPLICATE_EXAMPLES) {
                    stats.examples.push(describeBookmark(item));
                }
                continue;
            }

            if (seen.has(key)) {
                stats.skippedWithinFile += 1;
                if (stats.examples.length < MAX_DUPLICATE_EXAMPLES) {
                    stats.examples.push(describeBookmark(item));
                }
                continue;
            }

            seen.add(key);
            nextItems.push(item);
        }

        if (nextItems.length > 0) {
            groups.push({...group, items: nextItems});
            importedCount += nextItems.length;
        }
    }

    return {
        groups,
        importedCount,
        duplicateStats: stats,
    };
}
