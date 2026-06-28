// src/features/widgets/builtins/system-monitor/useSystemStats.ts
import {ref} from 'vue';
import {collectSystemStats, type SystemStats} from '../../../../core/system/systemStats';
import {useVisibilityInterval} from '../../../../shared/composables/useVisibilityInterval';

export function useSystemStats(opts?: {
    pingUrl?: string;
    geoUrl?: string;
    intervalMs?: number; // 默认 5s
}) {
    const stats = ref<SystemStats | null>(null);
    const loading = ref(false);
    const error = ref('');

    async function refresh() {
        loading.value = true;
        try {
            stats.value = await collectSystemStats({
                pingUrl: opts?.pingUrl,
                geoUrl: opts?.geoUrl,
                pingTimeoutMs: 3000,
            });
            error.value = '';
        } catch (e: any) {
            error.value = e?.message || 'collectSystemStats failed';
        } finally {
            loading.value = false;
        }
    }

    // Visibility-gated: pause the 5s poll (and its network pings) while the tab
    // is hidden so a background new-tab does not keep hitting the network.
    useVisibilityInterval(() => { void refresh(); }, opts?.intervalMs ?? 5000, {immediate: true});

    return {stats, loading, error, refresh};
}
