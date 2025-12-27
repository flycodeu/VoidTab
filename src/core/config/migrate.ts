// src/core/config/migrate.ts
import { CURRENT_CONFIG_VERSION } from './types';

/**
 * Step2 目标：
 * - 给旧数据补 version
 * - 做最小必要迁移，避免破坏现有逻辑
 * - 返回一个“可继续 normalize 的对象”
 */
export function migrateConfig(raw: any): any {
    if (!raw || typeof raw !== 'object') {
        return { version: CURRENT_CONFIG_VERSION };
    }

    const cfg: any = { ...raw };

    // 旧数据没有 version -> 当作 0
    const v = typeof cfg.version === 'number' ? cfg.version : 0;
    cfg.version = v;

    // 未来你升级版本时，在这里分支处理：
    // if (cfg.version < 1) { ...; cfg.version = 1; }
    // 目前我们把 “无 version 的旧数据” 统一补到 v=1 的结构，由 normalize 做补齐
    if (cfg.version < 1) {
        cfg.version = 1;
    }

    // 最后统一写成当前版本（目前 CURRENT_CONFIG_VERSION = 1）
    cfg.version = CURRENT_CONFIG_VERSION;

    return cfg;
}
