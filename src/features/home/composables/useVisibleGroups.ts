import {computed} from "vue";

export function useVisibleGroups(options: {
    groups: () => any[];
    isEditMode: () => boolean;
    activeGroupId: () => string;
    showAllGroups: () => boolean;
    dragState: { isDragging: boolean; fromGroupId?: string };
}) {
    const visibleGroups = computed(() => {
        const groups = options.groups() || [];

        if (options.isEditMode() || options.showAllGroups()) return groups;

        const active = groups.find((group) => group.id === options.activeGroupId());

        if (options.dragState.isDragging && options.dragState.fromGroupId) {
            const from = groups.find((group) => group.id === options.dragState.fromGroupId);
            const map = new Map<string, any>();
            if (active) map.set(active.id, active);
            if (from) map.set(from.id, from);
            return Array.from(map.values());
        }

        return active ? [active] : [];
    });

    return {visibleGroups};
}
