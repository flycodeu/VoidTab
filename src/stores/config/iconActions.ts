import type {Ref} from 'vue';
import type {Config} from '../../core/config/types';
import {extractSiteDomain} from '../../shared/utils/icon';
import {ensureSiteIconRuntime, resolveAndCacheSiteIcon} from '../../shared/utils/siteIconCache';
import {measurePerformanceAsync} from '../../shared/utils/performance';

export const createIconActions = (
    config: Ref<Config>,
    isLoaded: Ref<boolean>
) => {
    const refreshAutoSiteIconsBatch = async (options?: { force?: boolean; maxDomains?: number }) => {
        if (!isLoaded.value) return;

        await measurePerformanceAsync('config.icons.refreshBatch', async () => {
            ensureSiteIconRuntime(config.value.runtime);

            const runtime = config.value.runtime;
            const now = Date.now();
            const recentlyRefreshed = now - Number(runtime.siteIcons.lastBatchRefreshAt || 0) < 60 * 60 * 1000;
            if (!options?.force && recentlyRefreshed) return;

            const candidates: Array<{ url: string; domain: string }> = [];
            const seenDomains = new Set<string>();

            for (const group of config.value.layout) {
                for (const item of (group.items || [])) {
                    if (!item || item.kind === 'widget') continue;
                    const iconType = item.iconType || 'auto';
                    if (iconType !== 'auto') continue;
                    if (!item.url) continue;

                    const domain = extractSiteDomain(String(item.url));
                    if (!domain || seenDomains.has(domain)) continue;

                    seenDomains.add(domain);
                    candidates.push({url: String(item.url), domain});
                }
            }

            if (!candidates.length) {
                runtime.siteIcons.lastBatchRefreshAt = now;
                return;
            }

            const failedDomains = new Set<string>();
            for (const [domain, value] of Object.entries(runtime.siteIcons.records || {})) {
                const rec = value;
                if (!rec || typeof rec !== 'object') continue;
                if (rec.cacheMode === 'miss' || rec.lastError === 'img_error' || rec.lastError === 'probe_failed') {
                    failedDomains.add(domain);
                }
            }

            const maxDomains = Math.max(1, Number(options?.maxDomains ?? 160));
            const targets = [...candidates]
                .sort((a, b) => Number(failedDomains.has(b.domain)) - Number(failedDomains.has(a.domain)))
                .slice(0, maxDomains)
                .map((x) => x.url);
            const concurrency = 6;

            for (let i = 0; i < targets.length; i += concurrency) {
                const chunk = targets.slice(i, i + concurrency);
                await Promise.all(chunk.map((url) =>
                    resolveAndCacheSiteIcon(url, runtime, {
                        forceRefresh: !!options?.force,
                    }).catch(() => null)
                ));

                if (i + concurrency < targets.length) {
                    await new Promise((resolve) => window.setTimeout(resolve, 100));
                }
            }

            runtime.siteIcons.lastBatchRefreshAt = Date.now();
        });
    };

    return {
        refreshAutoSiteIconsBatch,
    };
};
