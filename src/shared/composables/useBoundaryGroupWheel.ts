type WheelGroup = {
    id: string;
};

type BoundaryGroupWheelOptions<TGroup extends WheelGroup> = {
    getGroups: () => TGroup[];
    getActiveGroupId: () => string;
    setActiveGroupId: (id: string, meta?: { direction: 1 | -1 }) => void;
    isDisabled?: () => boolean;
    threshold?: number;
    cooldownMs?: number;
};

const DEFAULT_THRESHOLD = 80;
const DEFAULT_COOLDOWN_MS = 360;
const RESET_WINDOW_MS = 180;

function getPointerElementFromWheel(e: WheelEvent) {
    return (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) || (e.target as HTMLElement | null);
}

function isTypingTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!(el as any).isContentEditable;
}

function isScrollableY(el: HTMLElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const canOverflow = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    return canOverflow && el.scrollHeight > el.clientHeight + 1;
}

function canScrollInDirection(el: HTMLElement, deltaY: number) {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    if (deltaY < 0) return el.scrollTop > 0;
    if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    return false;
}

function normalizeWheelDelta(e: WheelEvent, value: number) {
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 40;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return value * window.innerHeight;
    return value;
}

function findScrollableAncestor(start: HTMLElement | null, boundaryHost: HTMLElement) {
    let el: HTMLElement | null = start;
    while (el) {
        if (isScrollableY(el)) return el;
        if (el === boundaryHost) return null;
        el = el.parentElement;
    }
    return null;
}

function isPointerInsideSidebarList(e: WheelEvent) {
    const el = document.querySelector('[data-sidebar-list="1"]') as HTMLElement | null;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
}

function getNextGroupId<TGroup extends WheelGroup>(groups: TGroup[], activeId: string, dir: 1 | -1) {
    if (groups.length <= 1) return '';
    const idx = groups.findIndex((group) => group.id === activeId);
    const base = idx >= 0 ? idx : 0;
    const nextIdx = (base + dir + groups.length) % groups.length;
    return groups[nextIdx]?.id || '';
}

export function useBoundaryGroupWheel<TGroup extends WheelGroup>(options: BoundaryGroupWheelOptions<TGroup>) {
    const threshold = Math.max(20, Number(options.threshold ?? DEFAULT_THRESHOLD));
    const cooldownMs = Math.max(120, Number(options.cooldownMs ?? DEFAULT_COOLDOWN_MS));
    let wheelAcc = 0;
    let lastWheelTs = 0;
    let wheelLocked = false;
    let wheelHandler: ((e: WheelEvent) => void) | null = null;

    const switchGroup = (dir: 1 | -1) => {
        const nextId = getNextGroupId(options.getGroups() || [], options.getActiveGroupId(), dir);
        if (nextId) options.setActiveGroupId(nextId, {direction: dir});
    };

    const onWheelCapture = (e: WheelEvent) => {
        if (!e.cancelable) return;
        const deltaY = normalizeWheelDelta(e, e.deltaY);
        const deltaX = normalizeWheelDelta(e, e.deltaX);
        if (Math.abs(deltaY) < Math.abs(deltaX)) return;
        if (options.isDisabled?.()) return;
        if (isTypingTarget(e.target)) return;

        const pointerEl = getPointerElementFromWheel(e);
        if (!pointerEl) return;
        if (pointerEl.closest('[data-modal="1"], [data-wheel-lock="true"]')) return;
        if (isPointerInsideSidebarList(e)) return;

        const boundaryHost = pointerEl.closest('[data-wheel-boundary-switch="true"]') as HTMLElement | null;
        if (!boundaryHost) return;

        const scrollable = findScrollableAncestor(pointerEl, boundaryHost);
        if (scrollable && canScrollInDirection(scrollable, deltaY)) return;

        // Nested scroll containers keep ownership at their own boundaries. The main
        // boundary host is the only exhausted scroll area that can turn into group nav.
        if (scrollable && scrollable !== boundaryHost) return;

        e.preventDefault();

        if (wheelLocked) return;
        const now = performance.now();
        if (now - lastWheelTs > RESET_WINDOW_MS) wheelAcc = 0;
        lastWheelTs = now;
        wheelAcc += deltaY;

        if (Math.abs(wheelAcc) < threshold) return;

        const dir = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        wheelLocked = true;
        switchGroup(dir);
        window.setTimeout(() => {
            wheelLocked = false;
        }, cooldownMs);
    };

    const mount = () => {
        if (wheelHandler) return;
        wheelHandler = (e: WheelEvent) => onWheelCapture(e);
        window.addEventListener('wheel', wheelHandler, {capture: true, passive: false});
    };

    const unmount = () => {
        if (!wheelHandler) return;
        window.removeEventListener('wheel', wheelHandler, true);
        wheelHandler = null;
        wheelAcc = 0;
        wheelLocked = false;
    };

    return {
        mount,
        unmount,
    };
}
