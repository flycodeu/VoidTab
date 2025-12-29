// src/composables/useGroupWheelNavigation.ts
export type WheelNavGroup = { id: string };

type Options = {
    getGroups: () => WheelNavGroup[];
    getActiveId: () => string;
    setActiveId: (id: string) => void;

    /** 是否启用（比如：非专注模式、未打开弹窗时） */
    enabled: () => boolean;

    /** 触控板/滚轮累积阈值：越大越不敏感 */
    threshold?: number;

    /** 切组后冷却时间，避免连续抖动 */
    cooldownMs?: number;
};

export function useGroupWheelNavigation(options: Options) {
    const threshold = options.threshold ?? 90;
    const cooldownMs = options.cooldownMs ?? 450;

    let acc = 0;
    let lastTs = 0;
    let locked = false;

    function isTypingTarget(el: EventTarget | null) {
        const node = el as HTMLElement | null;
        if (!node) return false;
        const tag = node.tagName?.toLowerCase();
        if (!tag) return false;
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if (node.isContentEditable) return true;
        // 允许你在某些区域显式放行滚动（例如设置面板内部）
        if (node.closest?.('[data-wheel-allow="true"]')) return true;
        return false;
    }

    function clampIndex(i: number, len: number) {
        if (len <= 0) return 0;
        return (i % len + len) % len;
    }

    /** 返回 true 表示已接管滚动（外部应 preventDefault） */
    function onWheel(e: WheelEvent): boolean {
        if (!options.enabled()) return false;
        if (isTypingTarget(e.target)) return false;

        const groups = options.getGroups();
        if (!groups || groups.length <= 1) {
            // 只有 0/1 组时，不接管滚动（让它自然滚动/无效）
            return false;
        }

        // 锁定期间：吞掉滚动，避免页面/容器滚动
        if (locked) return true;

        const now = performance.now();
        // 间隔过大则清空累积，提升可控性
        if (now - lastTs > 180) acc = 0;
        lastTs = now;

        acc += e.deltaY;

        if (Math.abs(acc) < threshold) return true;

        locked = true;
        const dir = acc > 0 ? 1 : -1;
        acc = 0;

        const activeId = options.getActiveId();
        const idx = groups.findIndex(g => g.id === activeId);
        const nextIdx = clampIndex((idx === -1 ? 0 : idx) + dir, groups.length);
        const nextId = groups[nextIdx]?.id;

        if (nextId && nextId !== activeId) {
            options.setActiveId(nextId);
        }

        window.setTimeout(() => {
            locked = false;
        }, cooldownMs);

        return true;
    }

    return {onWheel};
}
