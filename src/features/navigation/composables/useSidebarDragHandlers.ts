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

    // 清除定时器
    const clearTimer = () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = null;
    };

    // 拖拽进入事件
    const handleDragEnter = (groupId: string) => {
        // 判断是否正在拖拽，并且不是当前活动的 group
        if (!options.dragState?.isDragging) return;
        if (groupId === options.getActiveGroupId()) return;

        // 清除旧定时器
        clearTimer();

        // 设置延迟，改变活动的 group
        hoverTimer = setTimeout(() => {
            options.setActiveGroupId(groupId);
            hoverTimer = null;
        }, options.hoverDelay ?? 600);
    };

    // 拖拽离开事件
    const handleDragLeave = () => {
        clearTimer();
    };

    // 拖拽释放（drop）事件
    const handleDrop = (targetGroupId: string) => {
        clearTimer();

        const ds = options.dragState;
        if (!ds?.isDragging || !ds.item?.id) return;

        const from = ds.fromGroupId;
        const siteId = ds.item.id;

        // 如果拖拽源和目标组是同一个组，则不执行 move 操作
        if (from && from !== targetGroupId) {
            options.moveSite(from, targetGroupId, siteId);
        }

        // 更新活动组，并结束拖拽
        options.setActiveGroupId(targetGroupId);
        options.endDrag();
    };

    // 组件卸载时清除定时器
    onUnmounted(() => {
        clearTimer();
    });

    return {
        handleDragEnter,
        handleDragLeave,
        handleDrop
    };
}
