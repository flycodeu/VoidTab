// src/core/theme/wallpaperRepository.ts
import {storage} from '../../utils/storage.ts';
import {LOCAL_WALLPAPER_MARKER} from '../config/default.ts';
import type {Config} from '../config/types.ts';

const WALLPAPER_KEY = 'voidtab-wallpaper-blob';

export const wallpaperRepository = {
    /**
     * 把 config 中的 wallpaper 规范化：
     * - 如果是大体积 base64 => 存 local，并把 config.theme.wallpaper 改成 marker
     * - 如果不是 base64 => 清理 local 存储
     */
    async normalizeForSave(cfg: Config): Promise<Config> {
        const current = cfg.theme.wallpaper || '';
        const isBase64Image = current.startsWith('data:image');

        if (isBase64Image) {
            await storage.set(WALLPAPER_KEY, current, 'local');
            return {
                ...cfg,
                theme: {...cfg.theme, wallpaper: LOCAL_WALLPAPER_MARKER}
            };
        }

        if (current !== LOCAL_WALLPAPER_MARKER) {
            await storage.remove(WALLPAPER_KEY, 'local');
        }

        return cfg;
    }
};
