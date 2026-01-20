import type { Config } from './types';

const isJson = (s: string) => {
    try { JSON.parse(s); return true; } catch { return false; }
};

export const applyLegacyLocalStorageIntoConfig = (cfg: Config) => {
    // ⚠️ background/service worker 没有 window
    if (typeof window === 'undefined' || !window.localStorage) return { changed: false, removedKeys: [] as string[] };

    const ls = window.localStorage;
    const removedKeys: string[] = [];
    let changed = false;

    // 1) cron
    const cronExpr = ls.getItem('voidtab_cron_expr');
    const cronTheme = ls.getItem('voidtab_cron_theme');
    if (cronExpr) { cfg.runtime.cron.expr = cronExpr; removedKeys.push('voidtab_cron_expr'); changed = true; }
    if (cronTheme) { cfg.runtime.cron.theme = cronTheme; removedKeys.push('voidtab_cron_theme'); changed = true; }

    // 2) jwt
    const jwt = ls.getItem('voidtab_jwt_token');
    if (jwt !== null && jwt !== undefined && jwt !== '') {
        cfg.runtime.auth.jwtToken = jwt;
        removedKeys.push('voidtab_jwt_token');
        changed = true;
    }

    // 3) site stats
    const stats = ls.getItem('voidtab_site_stats');
    if (stats && isJson(stats)) {
        cfg.runtime.siteState = JSON.parse(stats);
        removedKeys.push('voidtab_site_stats');
        changed = true;
    }

    // 4) terminal
    const termBuf = ls.getItem('voidtab_terminal_buffer');
    const termTheme = ls.getItem('voidtab_terminal_theme');
    if (termBuf !== null && termBuf !== undefined) {
        cfg.runtime.terminal_buffer.buffer = termBuf;
        removedKeys.push('voidtab_terminal_buffer');
        changed = true;
    }
    if (termTheme) {
        cfg.runtime.terminal_buffer.theme = termTheme;
        removedKeys.push('voidtab_terminal_theme');
        changed = true;
    }

    // 6) merit widget
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k) continue;

        // widget_merit_sound_widget-xxx
        if (k.startsWith('widget_merit_sound_')) {
            const id = k.replace('widget_merit_sound_', '');
            const v = ls.getItem(k);
            if (v === 'true' || v === 'false') {
                cfg.runtime.widgets.merit.sound[id] = v === 'true';
                removedKeys.push(k);
                changed = true;
            }
        }

        // widget_merit_widget-xxx
        if (k.startsWith('widget_merit_') && !k.startsWith('widget_merit_sound_')) {
            const id = k.replace('widget_merit_', '');
            const v = ls.getItem(k);
            const num = Number(v);
            if (Number.isFinite(num)) {
                cfg.runtime.widgets.merit.value[id] = num;
                removedKeys.push(k);
                changed = true;
            }
        }
    }

    //   删除旧 key（可选，但推荐）
    // 你如果想“保留兼容”，就不要删；但会造成双源数据，容易出 bug
    removedKeys.forEach((k) => ls.removeItem(k));

    return { changed, removedKeys };
};
