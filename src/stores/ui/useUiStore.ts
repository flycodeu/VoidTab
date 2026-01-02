import {defineStore} from 'pinia';
import {ref} from 'vue';

// ✅ 修正 1：扩展类型定义，加入 'blank' and 'widget'
export type ContextMenuType = 'site' | 'group' | 'blank' | 'widget';

export interface ContextMenuState {
    show: boolean;
    x: number;
    y: number;
    type: ContextMenuType;
    item: any | null;
    groupId: string;
}

export interface DragState {
    isDragging: boolean;
    item: any | null;
    fromGroupId: string;
}

export const useUiStore = defineStore('ui', () => {
    const contextMenu = ref<ContextMenuState>({
        show: false,
        x: 0,
        y: 0,
        type: 'site',
        item: null,
        groupId: ''
    });

    const dragState = ref<DragState>({
        isDragging: false,
        item: null,
        fromGroupId: ''
    });

    const openContextMenu = (
        e: MouseEvent,
        item: any | null, // ✅ 修正 2：允许 item 为 null (因为空白处右键没有 item)
        type: ContextMenuType,
        groupId: string = ''
    ) => {
        e.preventDefault();
        e.stopPropagation();

        contextMenu.value = {
            show: true,
            x: e.clientX,
            y: e.clientY,
            type,
            item,
            // 修正 3：逻辑优化，防止 accessing id of null
            groupId: groupId || (type === 'group' && item ? String(item.id) : '')
        };
    };

    const closeContextMenu = () => {
        contextMenu.value.show = false;
    };

    const setDragState = (isDragging: boolean, fromGroupId: string = '', item: any = null) => {
        dragState.value = {isDragging, fromGroupId, item};
    };

    return {
        contextMenu,
        dragState,
        openContextMenu,
        closeContextMenu,
        setDragState
    };
});