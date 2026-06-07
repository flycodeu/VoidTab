export type RetryDecisionContext = {
    url: string;
    method: string;
    attempt: number;
    maxAttempts: number;
    response?: Response;
    error?: unknown;
    timedOut?: boolean;
};

export type FetchFallbackContext = RetryDecisionContext & {
    attempts: number;
};

export type NetworkMetric = {
    id: string;
    name: string;
    url: string;
    method: string;
    ok: boolean;
    status?: number;
    attempts: number;
    durationMs: number;
    timeoutMs: number;
    degraded: boolean;
    fallback?: string;
    error?: string;
    timestamp: number;
};

export type PerformanceMeasureEntry = {
    name: string;
    ok: boolean;
    durationMs: number;
    timestamp: number;
    error?: string;
};

export type NetworkPerformanceSummary = {
    recentCount: number;
    failureCount: number;
    degradedCount: number;
    avgDurationMs?: number;
    p95DurationMs?: number;
    lastError?: string;
    lastUpdatedAt?: number;
};

export interface FetchWithRetryOptions {
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffFactor?: number;
    jitter?: boolean;
    retryOnStatuses?: number[];
    metricName?: string;
    fallbackName?: string;
    fallback?: (ctx: FetchFallbackContext) => Promise<Response> | Response;
    shouldRetry?: (ctx: RetryDecisionContext) => boolean;
    throwOnHttpError?: boolean;
}

export interface FetchJsonWithRetryOptions<T> extends FetchWithRetryOptions {
    fallbackData?: (ctx: {error: unknown}) => Promise<T | undefined> | T | undefined;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 350;
const DEFAULT_MAX_RETRY_DELAY_MS = 4000;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];
const MAX_NETWORK_METRICS = 80;
const MAX_PERFORMANCE_MEASURES = 80;

const networkMetrics: NetworkMetric[] = [];
const performanceMeasures: PerformanceMeasureEntry[] = [];

const now = () => {
    const perf = globalThis.performance;
    return perf?.now ? perf.now() : Date.now();
};

const clampTimeout = (timeoutMs: number | undefined) =>
    Math.max(1, Math.round(timeoutMs ?? DEFAULT_TIMEOUT_MS));

const normalizeMethod = (input: RequestInfo | URL, init?: RequestInit) => {
    const requestMethod = typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined;
    return (init?.method || requestMethod || 'GET').toUpperCase();
};

const metricUrl = (input: RequestInfo | URL) => {
    let raw = '';
    if (typeof input === 'string') raw = input;
    else if (input instanceof URL) raw = input.toString();
    else raw = input.url;

    const queryIndex = raw.indexOf('?');
    if (queryIndex < 0) return raw;
    return `${raw.slice(0, queryIndex)}?...`;
};

const describeError = (error: unknown) => {
    if (error instanceof Error) return error.message || error.name;
    if (typeof error === 'string') return error;
    return 'Network request failed';
};

const pushNetworkMetric = (metric: Omit<NetworkMetric, 'id' | 'timestamp'>) => {
    networkMetrics.push({
        ...metric,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: Date.now(),
    });
    if (networkMetrics.length > MAX_NETWORK_METRICS) {
        networkMetrics.splice(0, networkMetrics.length - MAX_NETWORK_METRICS);
    }
};

const pushPerformanceMeasure = (entry: Omit<PerformanceMeasureEntry, 'timestamp'>) => {
    performanceMeasures.push({...entry, timestamp: Date.now()});
    if (performanceMeasures.length > MAX_PERFORMANCE_MEASURES) {
        performanceMeasures.splice(0, performanceMeasures.length - MAX_PERFORMANCE_MEASURES);
    }
};

const createAttemptSignal = (externalSignal: AbortSignal | null | undefined, timeoutMs: number) => {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    const abortFromExternal = () => controller.abort();

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', abortFromExternal, {once: true});
        }
    }

    return {
        signal: controller.signal,
        timedOut: () => timedOut,
        cleanup: () => {
            clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', abortFromExternal);
        },
    };
};

const wait = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, ms);

        const abort = () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal?.addEventListener('abort', abort, {once: true});
    });

const retryAfterMs = (response?: Response) => {
    const value = response?.headers.get('Retry-After');
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const dateMs = Date.parse(value);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());

    return undefined;
};

const retryDelay = (attempt: number, response: Response | undefined, options: FetchWithRetryOptions) => {
    const retryAfter = retryAfterMs(response);
    if (typeof retryAfter === 'number') return Math.min(retryAfter, options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS);

    const base = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const factor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    const max = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    const raw = Math.min(max, base * Math.pow(factor, attempt));

    if (options.jitter === false) return raw;
    return Math.round(raw * (0.75 + Math.random() * 0.5));
};

const defaultShouldRetry = (ctx: RetryDecisionContext, retryOnStatuses: number[]) => {
    if (ctx.response) return retryOnStatuses.includes(ctx.response.status);
    if (ctx.error) return !ctx.timedOut || ctx.attempt + 1 < ctx.maxAttempts;
    return false;
};

class HttpStatusError extends Error {
    constructor(readonly response: Response) {
        super(`HTTP ${response.status} ${response.statusText}`);
        this.name = 'HttpStatusError';
    }
}

export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = now();
    try {
        const result = await fn();
        pushPerformanceMeasure({name, ok: true, durationMs: Math.round(now() - start)});
        return result;
    } catch (error) {
        pushPerformanceMeasure({
            name,
            ok: false,
            durationMs: Math.round(now() - start),
            error: describeError(error),
        });
        throw error;
    }
}

export async function fetchWithRetry(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: FetchWithRetryOptions = {}
): Promise<Response> {
    const timeoutMs = clampTimeout(options.timeoutMs);
    const retries = Math.max(0, Math.round(options.retries ?? DEFAULT_RETRIES));
    const maxAttempts = retries + 1;
    const method = normalizeMethod(input, init);
    const url = metricUrl(input);
    const metricName = options.metricName ?? `network.${method.toLowerCase()}`;
    const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;
    const startedAt = now();
    let attempts = 0;
    let lastResponse: Response | undefined;
    let lastError: unknown;
    let lastTimedOut = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        attempts = attempt + 1;
        const attemptSignal = createAttemptSignal(init.signal, timeoutMs);

        try {
            const response = await fetch(input, {
                ...init,
                signal: attemptSignal.signal,
            });
            attemptSignal.cleanup();
            lastResponse = response;
            lastError = undefined;
            lastTimedOut = false;

            const retryContext: RetryDecisionContext = {url, method, attempt, maxAttempts, response};
            const shouldRetry = options.shouldRetry
                ? options.shouldRetry(retryContext)
                : defaultShouldRetry(retryContext, retryOnStatuses);

            if (shouldRetry && attempt < retries) {
                await wait(retryDelay(attempt, response, options), init.signal);
                continue;
            }

            if (shouldRetry && options.fallback) break;

            const durationMs = Math.round(now() - startedAt);
            pushNetworkMetric({
                name: metricName,
                url,
                method,
                ok: response.ok,
                status: response.status,
                attempts,
                durationMs,
                timeoutMs,
                degraded: false,
            });

            if (options.throwOnHttpError && !response.ok) throw new HttpStatusError(response);
            return response;
        } catch (error) {
            attemptSignal.cleanup();
            if (error instanceof HttpStatusError) throw error;

            lastError = error;
            lastTimedOut = attemptSignal.timedOut();

            if (init.signal?.aborted) break;

            const retryContext: RetryDecisionContext = {
                url,
                method,
                attempt,
                maxAttempts,
                error,
                timedOut: lastTimedOut,
            };
            const shouldRetry = options.shouldRetry
                ? options.shouldRetry(retryContext)
                : defaultShouldRetry(retryContext, retryOnStatuses);

            if (shouldRetry && attempt < retries) {
                await wait(retryDelay(attempt, undefined, options), init.signal);
                continue;
            }

            break;
        }
    }

    if (options.fallback) {
        try {
            const response = await options.fallback({
                url,
                method,
                attempt: Math.max(0, attempts - 1),
                maxAttempts,
                attempts,
                response: lastResponse,
                error: lastError,
                timedOut: lastTimedOut,
            });
            pushNetworkMetric({
                name: metricName,
                url,
                method,
                ok: response.ok,
                status: response.status,
                attempts,
                durationMs: Math.round(now() - startedAt),
                timeoutMs,
                degraded: true,
                fallback: options.fallbackName ?? 'fallback',
                error: lastError ? describeError(lastError) : undefined,
            });
            return response;
        } catch (fallbackError) {
            pushNetworkMetric({
                name: metricName,
                url,
                method,
                ok: false,
                attempts,
                durationMs: Math.round(now() - startedAt),
                timeoutMs,
                degraded: true,
                fallback: options.fallbackName ?? 'fallback',
                error: describeError(fallbackError),
            });
            throw fallbackError;
        }
    }

    if (lastResponse) {
        pushNetworkMetric({
            name: metricName,
            url,
            method,
            ok: lastResponse.ok,
            status: lastResponse.status,
            attempts,
            durationMs: Math.round(now() - startedAt),
            timeoutMs,
            degraded: false,
        });
        if (options.throwOnHttpError && !lastResponse.ok) throw new HttpStatusError(lastResponse);
        return lastResponse;
    }

    pushNetworkMetric({
        name: metricName,
        url,
        method,
        ok: false,
        attempts,
        durationMs: Math.round(now() - startedAt),
        timeoutMs,
        degraded: false,
        error: describeError(lastError),
    });
    throw lastError ?? new Error('Network request failed');
}

export async function fetchJsonWithRetry<T = unknown>(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: FetchJsonWithRetryOptions<T> = {}
): Promise<T> {
    const startedAt = now();
    try {
        const response = await fetchWithRetry(input, init, {...options, throwOnHttpError: true});
        return await measureAsync(`${options.metricName ?? 'network.json'}.parse`, async () => await response.json() as T);
    } catch (error) {
        if (options.fallbackData) {
            const fallback = await options.fallbackData({error});
            if (typeof fallback !== 'undefined') {
                pushNetworkMetric({
                    name: options.metricName ?? 'network.json',
                    url: metricUrl(input),
                    method: normalizeMethod(input, init),
                    ok: true,
                    attempts: 0,
                    durationMs: Math.round(now() - startedAt),
                    timeoutMs: clampTimeout(options.timeoutMs),
                    degraded: true,
                    fallback: options.fallbackName ?? 'data',
                    error: describeError(error),
                });
                return fallback;
            }
        }
        throw error;
    }
}

export function getNetworkMetrics(): NetworkMetric[] {
    return networkMetrics.slice();
}

export function clearNetworkMetrics() {
    networkMetrics.length = 0;
    performanceMeasures.length = 0;
}

export function getPerformanceMeasures(): PerformanceMeasureEntry[] {
    return performanceMeasures.slice();
}

export function getNetworkPerformanceSummary(): NetworkPerformanceSummary {
    const recent = networkMetrics.slice(-40);
    const durations = recent.map((metric) => metric.durationMs).sort((a, b) => a - b);
    const failures = recent.filter((metric) => !metric.ok);
    const degraded = recent.filter((metric) => metric.degraded);
    const lastError = [...recent].reverse().find((metric) => metric.error)?.error;
    const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : -1;
    const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined;

    return {
        recentCount: recent.length,
        failureCount: failures.length,
        degradedCount: degraded.length,
        avgDurationMs: typeof avg === 'number' ? Math.round(avg) : undefined,
        p95DurationMs: p95Index >= 0 ? durations[p95Index] : undefined,
        lastError,
        lastUpdatedAt: recent.length ? recent[recent.length - 1].timestamp : undefined,
    };
}
