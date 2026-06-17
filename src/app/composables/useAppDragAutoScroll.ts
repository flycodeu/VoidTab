type DragAutoScrollOptions = {
    isEnabled: () => boolean;
    isDragging?: () => boolean;
};

const AUTO_SCROLL_MARGIN = 110;
const AUTO_SCROLL_BASE_SPEED = 10;
const AUTO_SCROLL_MAX_SPEED = 28;

function pickMainScrollEl(): HTMLElement | null {
    const list = Array.from(document.querySelectorAll('[data-main-scroll="1"]')) as HTMLElement[];
    if (!list.length) return null;

    let best: HTMLElement | null = null;
    let bestDelta = 0;

    for (const el of list) {
        const delta = el.scrollHeight - el.clientHeight;
        if (delta > bestDelta + 1) {
            best = el;
            bestDelta = delta;
        }
    }

    return best ?? list[0] ?? null;
}

function isAnyDraggingNow() {
    const hit =
        document.querySelector('.sortable-ghost') ||
        document.querySelector('.group-ghost') ||
        document.querySelector('.group-drag') ||
        document.querySelector('.vue-draggable-dragging') ||
        document.querySelector('.dragging') ||
        document.querySelector('[draggable="true"].dragging');

    return !!hit;
}

function calcSpeed(y: number): { dir: -1 | 0 | 1; speed: number } {
    const vh = window.innerHeight;

    if (y <= AUTO_SCROLL_MARGIN) {
        const k = Math.min(1, (AUTO_SCROLL_MARGIN - y) / AUTO_SCROLL_MARGIN);
        const speed = AUTO_SCROLL_BASE_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_BASE_SPEED) * k;
        return {dir: -1, speed};
    }

    if (y >= vh - AUTO_SCROLL_MARGIN) {
        const dist = vh - y;
        const k = Math.min(1, (AUTO_SCROLL_MARGIN - dist) / AUTO_SCROLL_MARGIN);
        const speed = AUTO_SCROLL_BASE_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_BASE_SPEED) * k;
        return {dir: 1, speed};
    }

    return {dir: 0, speed: 0};
}

export function useAppDragAutoScroll(options: DragAutoScrollOptions) {
    let autoScrollRaf: number | null = null;
    let lastPointerY = 0;

    const canAutoScroll = () => options.isEnabled() && (options.isDragging?.() || isAnyDraggingNow());

    const stopAutoScroll = () => {
        if (autoScrollRaf != null) cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
    };

    const autoScrollTick = () => {
        if (!canAutoScroll()) {
            stopAutoScroll();
            return;
        }

        const sc = pickMainScrollEl();
        if (!sc) {
            stopAutoScroll();
            return;
        }

        const {dir, speed} = calcSpeed(lastPointerY);
        if (dir === 0) {
            stopAutoScroll();
            return;
        }

        sc.scrollTop += dir * speed;
        autoScrollRaf = requestAnimationFrame(autoScrollTick);
    };

    const ensureAutoScrollRunning = () => {
        if (autoScrollRaf != null) return;
        autoScrollRaf = requestAnimationFrame(autoScrollTick);
    };

    const onDragOver = (e: DragEvent) => {
        if (canAutoScroll() && e.cancelable) e.preventDefault();

        lastPointerY = e.clientY || lastPointerY;
        if (!canAutoScroll()) return;

        const {dir} = calcSpeed(lastPointerY);
        if (dir !== 0) ensureAutoScrollRunning();
    };

    const onMouseMove = (e: MouseEvent) => {
        lastPointerY = e.clientY || lastPointerY;
    };

    const mount = () => {
        window.addEventListener('dragover', onDragOver, {capture: true, passive: false});
        window.addEventListener('dragend', stopAutoScroll, {capture: true, passive: true});
        window.addEventListener('drop', stopAutoScroll, {capture: true, passive: true});
        window.addEventListener('mousemove', onMouseMove, {capture: true, passive: true});
        window.addEventListener('blur', stopAutoScroll);
    };

    const unmount = () => {
        window.removeEventListener('dragover', onDragOver, true);
        window.removeEventListener('dragend', stopAutoScroll, true);
        window.removeEventListener('drop', stopAutoScroll, true);
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('blur', stopAutoScroll);
        stopAutoScroll();
    };

    return {
        mount,
        unmount,
    };
}
