// src/core/config/keys.ts
export const CONFIG_KEY = 'voidtab-core-config';
export const WALLPAPER_KEY = 'voidtab-wallpaper-blob';

/**
 * wallpaper 如果是大体积 base64，实际存 local，用 marker 代替
 */
export const LOCAL_WALLPAPER_MARKER = '_USE_LOCAL_STORAGE_' as const;
