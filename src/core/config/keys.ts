// src/core/config/keys.ts
export const CONFIG_KEY = 'voidtab-core-config';
/** Local-only encrypted rollback snapshots created before a v5 -> v6 commit. */
export const CONFIG_V5_BACKUP_PREFIX = 'voidtab:config-backup:v5:';
export const WALLPAPER_KEY = 'voidtab-wallpaper-blob';

/**
 * wallpaper 如果是大体积 base64，实际存 local，用 marker 代替
 */
export const LOCAL_WALLPAPER_MARKER = '_USE_LOCAL_STORAGE_' as const;

/** 右键菜单 id（可选） */
export const CTX_MENU_SET_WALLPAPER_ID = 'set-voidtab-wallpaper' as const;


/**
 * ai聊天历史记录
 */
export const AI_HISTORY_KEY = 'voidtab_ai_history';

/**
 * 节假日缓存
 */
export const HOLIDAY_CACHE_KEY = 'voidtab_holiday_data_cache';
