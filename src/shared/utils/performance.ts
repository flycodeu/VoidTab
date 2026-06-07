export type VoidTabPerformanceEntry = {
    id: string;
    name: string;
    ok: boolean;
    durationMs: number;
    timestamp: number;
    detail?: string;
    error?: string;
};

export type VoidTabPerformanceSummary = {
    recentCount: number;
    failureCount: number;
    avgDurationMs?: number;
    p95DurationMs?: number;
    lastError?: string;
    lastUpdatedAt?: number;
};

type PerformanceListener = (entry: VoidTabPerformanceEntry) => void;

type PerformanceMonitorOptions = {
    maxEntries?: number;
    exposeGlobal?: boolean;
};

const DEFAULT_MAX_ENTRIES = 120;

const entries: VoidTabPerformanceEntry[] = [];
const listeners = new Set<PerformanceListener>();
let maxEntries = DEFAULT_MAX_ENTRIES;

const now = () => {
    const perf = globalThis.performance;
    return perf?.now ? perf.now() : Date.now();
};

const describeError = (error: unknown) => {
    if (error instanceof Error) return error.message || error.name;
    if (typeof error === 'string') return error;
    return 'Operation failed';
};

const nextId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const pushEntry = (entry: Omit<VoidTabPerformanceEntry, 'id' | 'timestamp'>) => {
    const payload: VoidTabPerformanceEntry = {
        ...entry,
        id: nextId(),
        timestamp: Date.now(),
    };

    entries.push(payload);
    if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
    }

    listeners.forEach((listener) => listener(payload));
    return payload;
};

export function initPerformanceMonitor(options: PerformanceMonitorOptions = {}) {
    if (typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries)) {
        maxEntries = Math.max(20, Math.round(options.maxEntries));
    }

    if (options.exposeGlobal && typeof window !== 'undefined') {
        window.__VOIDTAB_PERFORMANCE__ = performanceMonitor;
    }

    return performanceMonitor;
}

export function markPerformance(name: string, detail?: string) {
    return pushEntry({
        name,
        ok: true,
        durationMs: 0,
        detail,
    });
}

export async function measurePerformanceAsync<T>(
    name: string,
    fn: () => Promise<T>,
    detail?: string
): Promise<T> {
    const startedAt = now();

    try {
        const result = await fn();
        pushEntry({
            name,
            ok: true,
            durationMs: Math.round(now() - startedAt),
            detail,
        });
        return result;
    } catch (error) {
        pushEntry({
            name,
            ok: false,
            durationMs: Math.round(now() - startedAt),
            detail,
            error: describeError(error),
        });
        throw error;
    }
}

export function measurePerformanceSync<T>(name: string, fn: () => T, detail?: string): T {
    const startedAt = now();

    try {
        const result = fn();
        pushEntry({
            name,
            ok: true,
            durationMs: Math.round(now() - startedAt),
            detail,
        });
        return result;
    } catch (error) {
        pushEntry({
            name,
            ok: false,
            durationMs: Math.round(now() - startedAt),
            detail,
            error: describeError(error),
        });
        throw error;
    }
}

export function getPerformanceEntries(): VoidTabPerformanceEntry[] {
    return entries.slice();
}

export function clearPerformanceEntries() {
    entries.length = 0;
}

export function subscribePerformance(listener: PerformanceListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getPerformanceSummary(): VoidTabPerformanceSummary {
    const recent = entries.slice(-60);
    const durations = recent.map((entry) => entry.durationMs).sort((a, b) => a - b);
    const failures = recent.filter((entry) => !entry.ok);
    const lastError = [...recent].reverse().find((entry) => entry.error)?.error;
    const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : -1;
    const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined;

    return {
        recentCount: recent.length,
        failureCount: failures.length,
        avgDurationMs: typeof avg === 'number' ? Math.round(avg) : undefined,
        p95DurationMs: p95Index >= 0 ? durations[p95Index] : undefined,
        lastError,
        lastUpdatedAt: recent.length ? recent[recent.length - 1].timestamp : undefined,
    };
}

export const performanceMonitor = {
    mark: markPerformance,
    measureAsync: measurePerformanceAsync,
    measureSync: measurePerformanceSync,
    getEntries: getPerformanceEntries,
    getSummary: getPerformanceSummary,
    clear: clearPerformanceEntries,
    subscribe: subscribePerformance,
};

export type VoidTabPerformanceMonitor = typeof performanceMonitor;

declare global {
    interface Window {
        __VOIDTAB_PERFORMANCE__?: VoidTabPerformanceMonitor;
    }
}
