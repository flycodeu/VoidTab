import {recordPerformance} from '../../shared/utils/performance.ts';

export interface TilePerformancePolicy {
    dragFrameBudgetMs: number;
    maxImageAssetBytes: number;
    declarativeRequestConcurrency: number;
    declarativeRequestBudgetMs: number;
    declarativeRequestMinIntervalMs: number;
}

export const DEFAULT_TILE_PERFORMANCE_POLICY: TilePerformancePolicy = {
    dragFrameBudgetMs: 16,
    maxImageAssetBytes: 512_000,
    declarativeRequestConcurrency: 4,
    declarativeRequestBudgetMs: 5000,
    declarativeRequestMinIntervalMs: 60_000,
};

let activeDeclarativeRequests = 0;
const lastRequestStartedAt = new Map<string, number>();

const now = () => globalThis.performance?.now ? globalThis.performance.now() : Date.now();

export function shouldThrottleTileDragFrame(
    lastFrameAt: number,
    options: {now?: number; policy?: Partial<TilePerformancePolicy>} = {},
) {
    const policy = {...DEFAULT_TILE_PERFORMANCE_POLICY, ...options.policy};
    const current = options.now ?? now();
    return current - lastFrameAt < policy.dragFrameBudgetMs;
}

export function estimateDataUrlBytes(value: string) {
    const commaIndex = value.indexOf(',');
    if (commaIndex < 0) return new TextEncoder().encode(value).byteLength;
    const payload = value.slice(commaIndex + 1).replace(/\s/g, '');
    if (/;base64/i.test(value.slice(0, commaIndex))) {
        return Math.ceil(payload.length * 3 / 4);
    }
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
}

export function assertTileImageAssetBudget(
    url: string,
    options: {label?: string; policy?: Partial<TilePerformancePolicy>} = {},
) {
    const policy = {...DEFAULT_TILE_PERFORMANCE_POLICY, ...options.policy};
    if (!/^data:image\//i.test(url)) return {ok: true as const, bytes: 0};
    const bytes = estimateDataUrlBytes(url);
    if (bytes <= policy.maxImageAssetBytes) return {ok: true as const, bytes};
    return {
        ok: false as const,
        bytes,
        message: `${options.label || 'tile image asset'} exceeds ${policy.maxImageAssetBytes} bytes`,
    };
}

export async function scheduleDeclarativeDataRequest<T>(
    key: string,
    task: () => Promise<T>,
    options: {policy?: Partial<TilePerformancePolicy>; minIntervalMs?: number} = {},
): Promise<T> {
    const policy = {...DEFAULT_TILE_PERFORMANCE_POLICY, ...options.policy};
    const minInterval = Math.max(policy.declarativeRequestMinIntervalMs, options.minIntervalMs || 0);
    const current = Date.now();
    const lastStarted = lastRequestStartedAt.get(key) || 0;
    if (current - lastStarted < minInterval) {
        throw new Error('declarative provider request throttled');
    }
    if (activeDeclarativeRequests >= policy.declarativeRequestConcurrency) {
        throw new Error('declarative provider request concurrency limit exceeded');
    }

    activeDeclarativeRequests += 1;
    lastRequestStartedAt.set(key, current);
    const startedAt = now();
    try {
        const result = await task();
        recordPerformance('tile.declarative.providerFetch', now() - startedAt, key, true);
        return result;
    } catch (error) {
        recordPerformance(
            'tile.declarative.providerFetch',
            now() - startedAt,
            key,
            false,
            error instanceof Error ? error.message : 'provider request failed',
        );
        throw error;
    } finally {
        activeDeclarativeRequests = Math.max(0, activeDeclarativeRequests - 1);
    }
}

export function resetTilePerformanceSchedulersForTest() {
    activeDeclarativeRequests = 0;
    lastRequestStartedAt.clear();
}
