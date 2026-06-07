import {defineStore} from 'pinia';
import {ref} from 'vue';

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
    const announcement = ref('');
    let announcementTimer: ReturnType<typeof setTimeout> | null = null;

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

    // 分组排序状态
    const isGroupSorting = ref(false);

    const openContextMenu = (
        e: MouseEvent,
        item: any | null,
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
            groupId: groupId || (type === 'group' && item ? String(item.id) : '')
        };
    };

    const openContextMenuAt = (
        x: number,
        y: number,
        item: any | null,
        type: ContextMenuType,
        groupId: string = ''
    ) => {
        contextMenu.value = {
            show: true,
            x,
            y,
            type,
            item,
            groupId: groupId || (type === 'group' && item ? String(item.id) : '')
        };
    };

    const closeContextMenu = () => {
        contextMenu.value.show = false;
    };

    const setDragState = (isDragging: boolean, fromGroupId: string = '', item: any = null) => {
        dragState.value = {isDragging, fromGroupId, item};
    };

    const setGroupSorting = (val: boolean) => {
        isGroupSorting.value = val;
    };

    const announce = (message: string) => {
        const text = message.trim();
        if (!text) return;

        if (announcementTimer) {
            clearTimeout(announcementTimer);
            announcementTimer = null;
        }

        announcement.value = '';

        if (typeof window === 'undefined') {
            announcement.value = text;
            return;
        }

        window.setTimeout(() => {
            announcement.value = text;
            announcementTimer = window.setTimeout(() => {
                announcement.value = '';
                announcementTimer = null;
            }, 4000);
        }, 0);
    };

    return {
        announcement,
        contextMenu,
        dragState,
        isGroupSorting,
        openContextMenu,
        openContextMenuAt,
        closeContextMenu,
        setDragState,
        setGroupSorting,
        announce
    };
});
