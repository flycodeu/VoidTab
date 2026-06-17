import {isExtensionContext} from '../../shared/utils/icon';

type RefreshAutoIcons = (options: { maxDomains: number }) => Promise<unknown>;

export function useBackgroundIconRefresh(refreshAutoSiteIconsBatch: RefreshAutoIcons) {
    let iconRefreshIdleId: number | null = null;
    let iconRefreshTimer: number | null = null;

    const schedule = () => {
        const run = () => {
            iconRefreshIdleId = null;
            iconRefreshTimer = null;
            if (!isExtensionContext()) return;
            void refreshAutoSiteIconsBatch({maxDomains: 48});
        };

        const requestIdle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
        if (requestIdle) {
            iconRefreshIdleId = requestIdle(run, {timeout: 5000});
        } else {
            iconRefreshTimer = window.setTimeout(run, 3000);
        }
    };

    const cancel = () => {
        const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
        if (iconRefreshIdleId != null && cancelIdle) cancelIdle(iconRefreshIdleId);
        if (iconRefreshTimer != null) window.clearTimeout(iconRefreshTimer);
        iconRefreshIdleId = null;
        iconRefreshTimer = null;
    };

    return {
        schedule,
        cancel,
    };
}
