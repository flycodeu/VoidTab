export type VoidTabPerformanceEntry = {
    id: string;
    name: string;
    ok: boolean;
    durationMs: number;
    budgetMs?: number;
    overBudget?: boolean;
    timestamp: number;
    detail?: string;
    error?: string;
};

export type VoidTabPerformanceBudgetReport = {
    trackedCount: number;
    violationCount: number;
    lastViolation?: VoidTabPerformanceEntry;
    slowestViolation?: VoidTabPerformanceEntry;
};

export type VoidTabPerformanceSummary = {
    recentCount: number;
    failureCount: number;
    budgetViolationCount: number;
    avgDurationMs?: number;
    p95DurationMs?: number;
    lastError?: string;
    lastBudgetViolation?: string;
    lastUpdatedAt?: number;
};

type PerformanceListener = (entry: VoidTabPerformanceEntry) => void;

type PerformanceMonitorOptions = {
    maxEntries?: number;
    exposeGlobal?: boolean;
    budgets?: Record<string, number>;
    warnOnBudget?: boolean;
};

const DEFAULT_MAX_ENTRIES = 120;
const DEFAULT_PERFORMANCE_BUDGETS: Record<string, number> = {
    'app.boot.mount': 700,
    'app.boot.firstFrame': 1200,
    'app.boot.configReady': 1500,
    'config.load.boot': 1200,
    'config.postBoot': 2200,
    'config.save': 900,
    'config.icons.refreshBatch': 3500,
    'tile.drag.frame': 16,
    'tile.declarative.providerFetch': 5000,
};

const entries: VoidTabPerformanceEntry[] = [];
const listeners = new Set<PerformanceListener>();
const performanceBudgets: Record<string, number> = {...DEFAULT_PERFORMANCE_BUDGETS};
let maxEntries = DEFAULT_MAX_ENTRIES;
let warnOnBudget = false;

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
    const budgetMs = performanceBudgets[entry.name];
    const overBudget = typeof budgetMs === 'number' && entry.durationMs > budgetMs;
    const payload: VoidTabPerformanceEntry = {
        ...entry,
        budgetMs,
        overBudget,
        id: nextId(),
        timestamp: Date.now(),
    };

    entries.push(payload);
    if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
    }

    listeners.forEach((listener) => listener(payload));
    if (warnOnBudget && payload.ok && payload.overBudget) {
        console.warn(
            `[VoidTab performance] ${payload.name} took ${payload.durationMs}ms, budget ${payload.budgetMs}ms`,
            payload.detail || ''
        );
    }
    return payload;
};

export function initPerformanceMonitor(options: PerformanceMonitorOptions = {}) {
    if (typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries)) {
        maxEntries = Math.max(20, Math.round(options.maxEntries));
    }

    if (options.budgets) {
        Object.assign(performanceBudgets, options.budgets);
    }

    if (typeof options.warnOnBudget === 'boolean') {
        warnOnBudget = options.warnOnBudget;
    }

    if (options.exposeGlobal && typeof window !== 'undefined') {
        window.__VOIDTAB_PERFORMANCE__ = performanceMonitor;
    }

    return performanceMonitor;
}

export function recordPerformance(
    name: string,
    durationMs: number,
    detail?: string,
    ok = true,
    error?: string
) {
    return pushEntry({
        name,
        ok,
        durationMs: Math.max(0, Math.round(durationMs)),
        detail,
        error,
    });
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

export function setPerformanceBudget(name: string, budgetMs: number) {
    if (!name || !Number.isFinite(budgetMs)) return;
    performanceBudgets[name] = Math.max(1, Math.round(budgetMs));
}

export function getPerformanceBudgets(): Record<string, number> {
    return {...performanceBudgets};
}

export function getPerformanceBudgetReport(): VoidTabPerformanceBudgetReport {
    const tracked = entries.filter((entry) => typeof entry.budgetMs === 'number');
    const violations = tracked.filter((entry) => entry.overBudget);
    const slowestViolation = violations.reduce<VoidTabPerformanceEntry | undefined>((slowest, entry) => {
        if (!slowest) return entry;
        const entryRatio = entry.budgetMs ? entry.durationMs / entry.budgetMs : 0;
        const slowestRatio = slowest.budgetMs ? slowest.durationMs / slowest.budgetMs : 0;
        return entryRatio > slowestRatio ? entry : slowest;
    }, undefined);

    return {
        trackedCount: tracked.length,
        violationCount: violations.length,
        lastViolation: violations[violations.length - 1],
        slowestViolation,
    };
}

export function subscribePerformance(listener: PerformanceListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getPerformanceSummary(): VoidTabPerformanceSummary {
    const recent = entries.slice(-60);
    const durations = recent.map((entry) => entry.durationMs).sort((a, b) => a - b);
    const failures = recent.filter((entry) => !entry.ok);
    const budgetViolations = recent.filter((entry) => entry.overBudget);
    const lastError = [...recent].reverse().find((entry) => entry.error)?.error;
    const lastBudgetViolation = [...recent].reverse().find((entry) => entry.overBudget);
    const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : -1;
    const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined;

    return {
        recentCount: recent.length,
        failureCount: failures.length,
        budgetViolationCount: budgetViolations.length,
        avgDurationMs: typeof avg === 'number' ? Math.round(avg) : undefined,
        p95DurationMs: p95Index >= 0 ? durations[p95Index] : undefined,
        lastError,
        lastBudgetViolation: lastBudgetViolation
            ? `${lastBudgetViolation.name} ${lastBudgetViolation.durationMs}ms/${lastBudgetViolation.budgetMs}ms`
            : undefined,
        lastUpdatedAt: recent.length ? recent[recent.length - 1].timestamp : undefined,
    };
}

export const performanceMonitor = {
    mark: markPerformance,
    record: recordPerformance,
    measureAsync: measurePerformanceAsync,
    measureSync: measurePerformanceSync,
    getEntries: getPerformanceEntries,
    getSummary: getPerformanceSummary,
    getBudgets: getPerformanceBudgets,
    getBudgetReport: getPerformanceBudgetReport,
    setBudget: setPerformanceBudget,
    clear: clearPerformanceEntries,
    subscribe: subscribePerformance,
};

export type VoidTabPerformanceMonitor = typeof performanceMonitor;

declare global {
    interface Window {
        __VOIDTAB_PERFORMANCE__?: VoidTabPerformanceMonitor;
    }
}
