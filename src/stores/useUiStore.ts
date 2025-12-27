import {defineStore} from 'pinia';
import {ref} from 'vue';

export type ContextMenuType = 'site' | 'group';

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
        item: any,
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
            groupId: groupId || (type === 'group' ? String(item?.id ?? '') : '')
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
