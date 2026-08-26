import {watch, type Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import {configRepository} from '../../core/config/repository';
import {watchConfigChanges} from '../../core/config/watch';
import {mergeConfigV6ThreeWay} from '../../core/config/localMerge';
import {measurePerformanceAsync} from '../../shared/utils/performance';

type ConfigPersistenceDeps = {
    config: Ref<ConfigV6>;
    isLoaded: Ref<boolean>;
    applyingExternal: Ref<boolean>;
    localRevision: Ref<number>;
    onSaveError?: (error: unknown) => void;
};

export const createConfigPersistence = ({
    config,
    isLoaded,
    applyingExternal,
    localRevision,
    onSaveError,
}: ConfigPersistenceDeps) => {
    let saveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let saveQueue: Promise<void> = Promise.resolve();
    let committedSnapshot: ConfigV6 | null = null;
    let suppressNextWatch = 0;
    let externalChangeRun = 0;

    const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    const valuesEqual = (left: unknown, right: unknown): boolean => {
        if (Object.is(left, right)) return true;
        if (Array.isArray(left) || Array.isArray(right)) {
            if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
            return left.every((item, index) => valuesEqual(item, right[index]));
        }
        if (left && right && typeof left === 'object' && typeof right === 'object') {
            const a = left as Record<string, unknown>;
            const b = right as Record<string, unknown>;
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            return [...keys].every((key) => valuesEqual(a[key], b[key]));
        }
        return false;
    };

    const clearPendingSave = () => {
        if (!saveTimer) return;
        globalThis.clearTimeout(saveTimer);
        saveTimer = null;
    };

    const persistNow = (): Promise<boolean> => {
        if (!isLoaded.value) return Promise.resolve(false);
        clearPendingSave();

        const task = saveQueue.then(async () => {
            const revisionAtStart = localRevision.value;
            const candidate = cloneJson(config.value);
            const base = committedSnapshot ? cloneJson(committedSnapshot) : undefined;

            try {
                const saved = await measurePerformanceAsync('config.save', async () =>
                    await configRepository.save(candidate, {base})
                ) as ConfigV6;

                // A user may have edited the tab while storage I/O was in
                // flight. Rebase those edits on the exact snapshot that was
                // written instead of silently replacing them.
                const current = cloneJson(config.value);
                const unchangedDuringSave = revisionAtStart === localRevision.value
                    && valuesEqual(current, candidate);
                const rebased = unchangedDuringSave
                    ? saved
                    : mergeConfigV6ThreeWay(candidate, current, saved);

                committedSnapshot = cloneJson(saved);
                if (!valuesEqual(current, rebased)) {
                    suppressNextWatch += 1;
                    config.value = rebased;
                }
                if (!unchangedDuringSave && !valuesEqual(rebased, saved)) saveConfigDebounced();
                return true;
            } catch (e) {
                onSaveError?.(e);
                return false;
            }
        });

        // Keep the queue alive after a handled failure while returning the
        // actual result to callers that need to gate a backup operation.
        saveQueue = task.then(() => undefined, () => undefined);
        return task;
    };

    const saveConfig = async () => {
        await persistNow();
    };

    const flushConfig = async () => await persistNow();

    const saveConfigDebounced = () => {
        clearPendingSave();
        saveTimer = globalThis.setTimeout(() => {
            void persistNow();
            saveTimer = null;
        }, 200);
    };

    const stopWatching = watch(
        config,
        () => {
            if (!isLoaded.value) return;
            if (suppressNextWatch > 0) {
                suppressNextWatch -= 1;
                return;
            }
            if (applyingExternal.value) return;

            localRevision.value += 1;
            saveConfigDebounced();
        },
        {deep: true}
    );

    const markCommittedConfig = (next: ConfigV6) => {
        committedSnapshot = cloneJson(next);
    };

    const reconcileFromStorage = async (): Promise<boolean> => {
        if (!isLoaded.value) return false;
        const runId = ++externalChangeRun;

        // If this tab is already writing, wait for that write and inspect the
        // storage again. The event payload may have been read before the write
        // queue finished and would otherwise re-apply an obsolete snapshot.
        await saveQueue;
        if (runId !== externalChangeRun || !isLoaded.value) return false;

        try {
            const remote = await configRepository.load();
            const current = cloneJson(config.value);
            const base = committedSnapshot;
            const isClean = !base || valuesEqual(current, base);
            const nextConfig = isClean
                ? remote
                : mergeConfigV6ThreeWay(base, current, remote);

            committedSnapshot = cloneJson(remote);
            if (valuesEqual(current, nextConfig)) return true;

            suppressNextWatch += 1;
            config.value = nextConfig;

            // A dirty tab keeps its own edits, but also needs to publish the
            // merged result so every other tab converges on one snapshot.
            if (!isClean) saveConfigDebounced();
            return true;
        } catch (error) {
            if (import.meta.env.DEV) console.error('[VoidTab] external config sync failed', error);
            return false;
        }
    };

    const stopWatchingExternal = watchConfigChanges(async () => {
        await reconcileFromStorage();
    });

    const refreshConfig = async () => await reconcileFromStorage();

    const destroy = () => {
        clearPendingSave();
        stopWatching();
        stopWatchingExternal();
    };

    return {
        saveConfig,
        flushConfig,
        refreshConfig,
        saveConfigDebounced,
        markCommittedConfig,
        destroy,
    };
};
