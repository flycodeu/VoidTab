import type {MemoCategory, MemoNote} from './types';

export const memoNoteCategories = [
    {id: 'all', label: '全部'},
    {id: 'inbox', label: '收集箱'},
    {id: 'todo', label: '待办'},
    {id: 'work', label: '工作'},
    {id: 'study', label: '学习'},
    {id: 'idea', label: '想法'},
    {id: 'snippet', label: '片段'},
    {id: 'note', label: '其他'},
] as const;

export const defaultMemoCategories: MemoCategory[] = memoNoteCategories
    .filter((item) => item.id !== 'all')
    .map((item) => ({...item}));

const legacyCategoryMap: Record<string, string> = {
    dev: 'work',
    git: 'snippet',
    ops: 'work',
};

export const defaultMemoNotes: MemoNote[] = [];

export function cloneDefaultMemoCategories(): MemoCategory[] {
    return defaultMemoCategories.map((item) => ({...item}));
}

export function cloneDefaultMemoNotes(): MemoNote[] {
    return defaultMemoNotes.map((item) => ({...item}));
}

export function getMemoNoteCategoryLabel(category: string, categories: MemoCategory[] = defaultMemoCategories): string {
    return categories.find((item) => item.id === category)?.label || category || '其他';
}

export function normalizeMemoCategories(value: unknown, fallback: MemoCategory[] = defaultMemoCategories): MemoCategory[] {
    const source = Array.isArray(value) ? value : fallback;
    const seen = new Set<string>();
    return source.flatMap((raw: any, index: number) => {
        const label = typeof raw?.label === 'string' ? raw.label.trim().slice(0, 20) : '';
        const idSeed = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `tag_${index + 1}`;
        if (!label || idSeed === 'all' || seen.has(idSeed)) return [];
        seen.add(idSeed);
        return [{id: idSeed, label}];
    });
}

export function getMemoPlainText(content: string) {
    return String(content || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/[#>*_`~\-[\]()|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getMemoExcerpt(content: string, fallback = '空白备忘') {
    return getMemoPlainText(content) || fallback;
}

export function getMemoWordCount(content: string) {
    const text = String(content || '').trim();
    if (!text) return 0;
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
    return cjk + words;
}

export function normalizeMemoNotes(
    value: unknown,
    fallback: MemoNote[] = [],
    categories: MemoCategory[] = defaultMemoCategories,
): MemoNote[] {
    const source = Array.isArray(value) ? value : fallback;
    const now = Date.now();
    const seen = new Set<string>();
    const validCategoryIds = new Set(categories.map((item) => item.id));
    const fallbackCategoryId = categories.find((item) => item.id === 'inbox')?.id || categories[0]?.id || 'note';

    return source
        .map((raw: any, index: number): MemoNote => {
            const content = typeof raw?.content === 'string'
                ? raw.content.trim()
                : (typeof raw?.command === 'string' ? raw.command.trim() : '');
            const summary = typeof raw?.summary === 'string'
                ? raw.summary.trim()
                : (typeof raw?.description === 'string' ? raw.description.trim() : '');
            const title = typeof raw?.title === 'string' && raw.title.trim()
                ? raw.title.trim()
                : (content ? getMemoExcerpt(content, `备忘 ${index + 1}`).slice(0, 32) : `备忘 ${index + 1}`);
            const rawCategory = typeof raw?.category === 'string' ? raw.category.trim() : '';
            const legacyCategory = legacyCategoryMap[rawCategory];
            const category = validCategoryIds.has(rawCategory)
                ? rawCategory
                : (legacyCategory && validCategoryIds.has(legacyCategory) ? legacyCategory : fallbackCategoryId);
            const idSeed = typeof raw?.id === 'string' && raw.id.trim()
                ? raw.id.trim()
                : `note_${category}_${index}`;
            let id = idSeed;
            let suffix = 1;
            while (seen.has(id)) {
                suffix += 1;
                id = `${idSeed}_${suffix}`;
            }
            seen.add(id);

            return {
                id,
                title,
                content,
                category,
                summary,
                pinned: raw?.pinned === true,
                createdAt: Number.isFinite(Number(raw?.createdAt)) ? Number(raw.createdAt) : now,
                updatedAt: Number.isFinite(Number(raw?.updatedAt)) ? Number(raw.updatedAt) : now,
            };
        })
        .filter((item) => item.title.trim().length > 0 || item.content.trim().length > 0 || (item.summary || '').trim().length > 0);
}

export function createLegacyBufferNote(buffer: string): MemoNote | null {
    const content = String(buffer || '').trim();
    if (!content) return null;
    const now = Date.now();
    return {
        id: `note_legacy_buffer_${now}`,
        title: getMemoExcerpt(content, '旧版备忘').slice(0, 32),
        content,
        category: 'inbox',
        summary: '从旧版缓冲区迁移',
        pinned: false,
        createdAt: now,
        updatedAt: now,
    };
}

// Backward-compatible exports for older code paths and imported configs.
export const terminalCommandCategories = memoNoteCategories;
export const defaultTerminalCommands = defaultMemoNotes;
export const cloneDefaultTerminalCommands = cloneDefaultMemoNotes;
export const getTerminalCommandCategoryLabel = getMemoNoteCategoryLabel;
