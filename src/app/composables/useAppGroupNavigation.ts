import {ref, watch} from 'vue';
import type {Group} from '../../core/config/types';
import {useBoundaryGroupWheel} from '../../shared/composables/useBoundaryGroupWheel';

type GroupSelectMeta = {
    direction?: 1 | -1;
};

type MainScrollPosition = 'top' | 'bottom';

type AppGroupNavigationOptions = {
    getGroups: () => Group[];
    getGroupTitle: (id: string) => string;
    shouldUseContinuousScroll: () => boolean;
    isWheelDisabled: () => boolean;
    announce: (message: string) => void;
};

const findMainScrollEl = () => {
    return document.querySelector('[data-main-scroll="1"]') as HTMLElement | null;
};

const findGroupSection = (id: string) => {
    const host = findMainScrollEl();
    if (!host) return null;

    const sections = Array.from(host.querySelectorAll<HTMLElement>('[data-group-section="1"]'));
    return sections.find((section) => section.dataset.groupSectionId === id) || null;
};

export function useAppGroupNavigation(options: AppGroupNavigationOptions) {
    const activeGroupId = ref('');

    let groupScrollSyncLockedUntil = 0;
    let groupScrollUnlockTimer: number | null = null;

    const lockGroupScrollSync = (durationMs = 760) => {
        groupScrollSyncLockedUntil = performance.now() + durationMs;
        if (groupScrollUnlockTimer != null) window.clearTimeout(groupScrollUnlockTimer);
        groupScrollUnlockTimer = window.setTimeout(() => {
            groupScrollUnlockTimer = null;
            groupScrollSyncLockedUntil = 0;
        }, durationMs);
    };

    const resetMainScroll = (position: MainScrollPosition = 'top', behavior: ScrollBehavior = 'auto') => {
        lockGroupScrollSync(360);
        requestAnimationFrame(() => {
            const host = findMainScrollEl();
            if (!host) return;

            const top = position === 'bottom'
                ? Math.max(0, host.scrollHeight - host.clientHeight)
                : 0;
            host.scrollTo({top, behavior});
        });
    };

    const setActiveGroupId = (id: string, announce = false) => {
        if (!id) return false;

        const changed = activeGroupId.value !== id;
        if (changed) activeGroupId.value = id;

        if (announce && changed) {
            const title = options.getGroupTitle(id);
            if (title) options.announce(`已切换到「${title}」分组`);
        }

        return changed;
    };

    const scrollToGroupSection = (id: string, behavior: ScrollBehavior = 'smooth') => {
        lockGroupScrollSync(behavior === 'auto' ? 360 : 760);
        requestAnimationFrame(() => {
            const section = findGroupSection(id);
            if (!section) return;

            const host = findMainScrollEl();
            if (!host) return;

            const hostRect = host.getBoundingClientRect();
            const sectionRect = section.getBoundingClientRect();
            const scrollMarginTop = Number.parseFloat(window.getComputedStyle(section).scrollMarginTop || '0') || 0;
            const top = Math.max(0, host.scrollTop + sectionRect.top - hostRect.top - scrollMarginTop);
            host.scrollTo({top, behavior});
        });
    };

    const selectGroupId = (id: string, meta?: GroupSelectMeta) => {
        if (!id) return;

        setActiveGroupId(id, true);

        if (options.shouldUseContinuousScroll()) {
            scrollToGroupSection(id, meta?.direction ? 'auto' : 'smooth');
            return;
        }

        resetMainScroll(meta?.direction === -1 ? 'bottom' : 'top');
    };

    const syncActiveGroupIdFromScroll = (id: string) => {
        if (!id || performance.now() < groupScrollSyncLockedUntil) return;
        setActiveGroupId(id, false);
    };

    const groupWheel = useBoundaryGroupWheel({
        getGroups: options.getGroups,
        getActiveGroupId: () => activeGroupId.value,
        setActiveGroupId: (id, meta) => selectGroupId(id, meta),
        isDisabled: options.isWheelDisabled,
    });

    const stopWatchingGroups = watch(
        () => (options.getGroups() || []).map((group) => group.id).join('|'),
        () => {
            const groups = options.getGroups() || [];
            if (!groups.length) {
                activeGroupId.value = '';
                return;
            }

            if (!groups.some((group) => group.id === activeGroupId.value)) {
                selectGroupId(groups[0].id);
            }
        },
        {flush: 'post'}
    );

    const mount = () => {
        groupWheel.mount();
    };

    const unmount = () => {
        groupWheel.unmount();
        stopWatchingGroups();

        if (groupScrollUnlockTimer != null) window.clearTimeout(groupScrollUnlockTimer);
        groupScrollUnlockTimer = null;
        groupScrollSyncLockedUntil = 0;
    };

    return {
        activeGroupId,
        setActiveGroupId,
        selectGroupId,
        syncActiveGroupIdFromScroll,
        mount,
        unmount,
    };
}
