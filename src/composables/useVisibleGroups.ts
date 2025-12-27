import {computed} from 'vue';

export function useVisibleGroups(options: {
    groups: any[];
    isEditMode: () => boolean;
    activeGroupId: () => string;
    dragState: { isDragging: boolean; fromGroupId?: string };
}) {
    const visibleGroups = computed(() => {
        const groups = options.groups || [];

        // 编辑模式：全部显示
        if (options.isEditMode()) return groups;

        // 非编辑：只显示当前组
        const active = groups.find(g => g.id === options.activeGroupId());

        // 拖拽中：额外显示来源组（去重）
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
