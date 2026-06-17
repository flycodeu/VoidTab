import hljs from 'highlight.js/lib/core';
import type {LanguageFn} from 'highlight.js';

type HighlightLanguage = 'bash' | 'css' | 'javascript' | 'json' | 'markdown' | 'python' | 'typescript' | 'xml';

type HighlightLanguageModule = {
    default: LanguageFn;
};

const languageLoaders: Record<HighlightLanguage, () => Promise<HighlightLanguageModule>> = {
    bash: () => import('highlight.js/lib/languages/bash'),
    css: () => import('highlight.js/lib/languages/css'),
    javascript: () => import('highlight.js/lib/languages/javascript'),
    json: () => import('highlight.js/lib/languages/json'),
    markdown: () => import('highlight.js/lib/languages/markdown'),
    python: () => import('highlight.js/lib/languages/python'),
    typescript: () => import('highlight.js/lib/languages/typescript'),
    xml: () => import('highlight.js/lib/languages/xml'),
};

const languageAliases: Record<string, HighlightLanguage> = {
    bash: 'bash',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    css: 'css',
    javascript: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    markdown: 'markdown',
    md: 'markdown',
    python: 'python',
    py: 'python',
    typescript: 'typescript',
    ts: 'typescript',
    tsx: 'typescript',
    html: 'xml',
    vue: 'xml',
    xml: 'xml',
};

const pendingLoads = new Map<HighlightLanguage, Promise<boolean>>();

export const normalizeHighlightLanguage = (lang: string | undefined) => {
    if (!lang) return undefined;
    return languageAliases[lang.trim().toLowerCase()];
};

export const isHighlightLanguageLoaded = (lang: HighlightLanguage) => {
    return !!hljs.getLanguage(lang);
};

export const loadHighlightLanguage = (lang: HighlightLanguage) => {
    if (isHighlightLanguageLoaded(lang)) return Promise.resolve(false);

    const pending = pendingLoads.get(lang);
    if (pending) return pending;

    const next = languageLoaders[lang]()
        .then((mod) => {
            if (!isHighlightLanguageLoaded(lang)) hljs.registerLanguage(lang, mod.default);
            return true;
        })
        .catch(() => false)
        .finally(() => {
            pendingLoads.delete(lang);
        });

    pendingLoads.set(lang, next);
    return next;
};
