import {computed} from "vue";

export function useVisibleGroups(options: {
    groups: () => any[];
    isEditMode: () => boolean;
    activeGroupId: () => string;
    dragState: { isDragging: boolean; fromGroupId?: string };
}) {
    const visibleGroups = computed(() => {
        const groups = options.groups() || [];

        if (options.isEditMode()) return groups;

        const active = groups.find(g => g.id === options.activeGroupId());

        if (options.dragState.isDragging && options.dragState.fromGroupId) {
            const from = groups.find(g => g.id === options.dragState.fromGroupId);

            const map = new Map<string, any>();
            if (active) map.set(active.id, active);
            if (from) map.set(from.id, from);

            return Array.from(map.values());
        }

        return active ? [active] : [];
    });

    return {visibleGroups};
}
