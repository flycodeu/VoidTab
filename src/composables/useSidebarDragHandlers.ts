import {onUnmounted} from 'vue';

type DragState = {
    isDragging: boolean;
    fromGroupId?: string;
    item?: { id: string } | null;
};

export function useSidebarDragHandlers(options: {
    dragState: DragState;
    getActiveGroupId: () => string;
    setActiveGroupId: (id: string) => void;
    moveSite: (from: string, to: string, siteId: string) => void;
    endDrag: () => void;
    hoverDelay?: number; // 默认 600
}) {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = null;
    };

    const handleDragEnter = (groupId: string) => {
        if (!options.dragState?.isDragging) return;
        if (groupId === options.getActiveGroupId()) return;

        clearTimer();
        hoverTimer = setTimeout(() => {
            options.setActiveGroupId(groupId);
            hoverTimer = null;
        }, options.hoverDelay ?? 600);
    };

    const handleDragLeave = () => {
        clearTimer();
    };

    const handleDrop = (targetGroupId: string) => {
        clearTimer();

        const ds = options.dragState;
        if (!ds?.isDragging || !ds.item?.id) return;

        const from = ds.fromGroupId;
        const siteId = ds.item.id;

        // ✅ 同组 drop 不 move
        if (from && from !== targetGroupId) {
            options.moveSite(from, targetGroupId, siteId);
        }

        options.setActiveGroupId(targetGroupId);
        options.endDrag();
    };

    onUnmounted(() => {
        clearTimer();
    });

    return {
        handleDragEnter,
        handleDragLeave,
        handleDrop
    };
}
