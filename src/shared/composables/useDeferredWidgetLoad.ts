import {onMounted, onUnmounted, type Ref} from 'vue';
import {recordPerformance} from '../utils/performance';

type MaybePromise<T> = T | Promise<T>;

export type DeferredWidgetLoadOptions = {
    delayMs?: number;
    idleTimeoutMs?: number;
    requireVisible?: boolean;
    rootMargin?: string;
    metricName?: string;
};

export function useDeferredWidgetLoad(
    target: Ref<HTMLElement | null>,
    load: () => MaybePromise<void>,
    options: DeferredWidgetLoadOptions = {}
) {
    const delayMs = Math.max(0, Math.round(options.delayMs ?? 1200));
    const idleTimeoutMs = Math.max(100, Math.round(options.idleTimeoutMs ?? 5000));
    const requireVisible = options.requireVisible ?? true;
    const rootMargin = options.rootMargin ?? '120px';
    const metricName = options.metricName ?? 'widget.deferredLoad';

    let disposed = false;
    let hasRun = false;
    let mountedAt = 0;
    let delayTimer: number | null = null;
    let idleId: number | null = null;
    let observer: IntersectionObserver | null = null;
    let waitingVisibility = false;

    const clearDelayTimer = () => {
        if (delayTimer === null) return;
        window.clearTimeout(delayTimer);
        delayTimer = null;
    };

    const clearIdleCallback = () => {
        if (idleId === null) return;
        const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
        if (cancelIdle) cancelIdle(idleId);
        idleId = null;
    };

    const cleanupVisibilityWait = () => {
        if (!waitingVisibility || typeof document === 'undefined') return;
        document.removeEventListener('visibilitychange', onDocumentVisible);
        waitingVisibility = false;
    };

    const cancel = () => {
        clearDelayTimer();
        clearIdleCallback();
        cleanupVisibilityWait();
        observer?.disconnect();
        observer = null;
    };

    const run = () => {
        if (disposed || hasRun) return;
        hasRun = true;
        cancel();
        recordPerformance('widget.load.deferred', Date.now() - mountedAt, metricName);
        void Promise.resolve(load()).catch((error) => {
            recordPerformance(
                'widget.load.deferred.error',
                Date.now() - mountedAt,
                metricName,
                false,
                error instanceof Error ? error.message : String(error)
            );
        });
    };

    const scheduleIdle = () => {
        if (disposed || hasRun) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            if (!waitingVisibility) {
                waitingVisibility = true;
                document.addEventListener('visibilitychange', onDocumentVisible, {passive: true});
            }
            return;
        }

        const requestIdle = (window as any).requestIdleCallback as undefined | ((cb: () => void, options?: {timeout: number}) => number);
        if (requestIdle) {
            idleId = requestIdle(run, {timeout: idleTimeoutMs});
        } else {
            delayTimer = window.setTimeout(run, Math.min(idleTimeoutMs, 1000));
        }
    };

    const schedule = () => {
        if (disposed || hasRun) return;
        clearDelayTimer();
        delayTimer = window.setTimeout(() => {
            delayTimer = null;
            scheduleIdle();
        }, delayMs);
    };

    function onDocumentVisible() {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        cleanupVisibilityWait();
        scheduleIdle();
    }

    onMounted(() => {
        mountedAt = Date.now();

        if (!requireVisible || typeof IntersectionObserver === 'undefined') {
            schedule();
            return;
        }

        const el = target.value;
        if (!el) {
            schedule();
            return;
        }

        observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            observer = null;
            schedule();
        }, {rootMargin});
        observer.observe(el);
    });

    onUnmounted(() => {
        disposed = true;
        cancel();
    });

    return {
        trigger: run,
        cancel,
    };
}
