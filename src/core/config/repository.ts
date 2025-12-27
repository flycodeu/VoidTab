// src/core/config/repository.ts
import type {Config} from './types';
import {defaultConfig} from './default';
import {migrateConfig} from './migrate';
import {normalizeConfig} from './normalize';
import {storage} from '../storage';
import {CONFIG_KEY, WALLPAPER_KEY, LOCAL_WALLPAPER_MARKER} from './keys';

const isBase64Image = (s: string) => typeof s === 'string' && s.startsWith('data:image');

export const configRepository = {
    /**
     * 统一加载：
     * 1) local
     * 2) sync（如果 local 没有）
     * 3) fallback = defaultConfig
     * 4) migrate + normalize
     * 5) wallpaper marker 还原
     */
    async load(): Promise<Config> {
        const local = await storage.get<any>(CONFIG_KEY, null, 'local');
        const sync = local ? null : await storage.get<any>(CONFIG_KEY, null, 'sync');

        const raw = (local ?? sync ?? defaultConfig) as any;
        const next = normalizeConfig(migrateConfig(raw));

        // wallpaper marker 还原（始终从 local 读大体积）
        if (next.theme.wallpaper === LOCAL_WALLPAPER_MARKER) {
            const w = await storage.get<string>(WALLPAPER_KEY, '', 'local');
            if (w) next.theme.wallpaper = w;
        }

        return next;
    },

    /**
     * 统一保存：
     * - base64 wallpaper => 写 local 的 WALLPAPER_KEY，并把 theme.wallpaper 改 marker
     * - config 本体写 local（你也可以未来改成：enabled 时写 sync）
     */
    async save(cfg: Config): Promise<void> {
        const copy: any = JSON.parse(JSON.stringify(cfg));
        const wp = copy?.theme?.wallpaper ?? '';

        if (isBase64Image(wp)) {
            await storage.set(WALLPAPER_KEY, wp, 'local');
            copy.theme.wallpaper = LOCAL_WALLPAPER_MARKER;
        } else {
            // 不是 marker 才删，避免误删已存的大图
            if (wp !== LOCAL_WALLPAPER_MARKER) {
                await storage.remove(WALLPAPER_KEY, 'local');
            }
        }

        await storage.set(CONFIG_KEY, copy, 'local');
    }
};
