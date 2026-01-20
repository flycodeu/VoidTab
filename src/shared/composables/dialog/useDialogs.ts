import { provide, reactive } from 'vue';

export interface DialogState {
    show: boolean;
    isEdit: boolean;
    groupId: string;
    initialData: any;
}

function setDialog(target: DialogState, next: Partial<DialogState>) {
    Object.assign(target, next);
}

export function useDialogs(store: any, ui: any) {
    const siteDialog = reactive<DialogState>({
        show: false,
        isEdit: false,
        groupId: '',
        initialData: null,
    });

    const groupDialog = reactive<DialogState>({
        show: false,
        isEdit: false,
        groupId: '',
        initialData: null,
    });

    const openAddSiteDialog = (gid: string) => {
        setDialog(siteDialog, { show: true, isEdit: false, groupId: gid, initialData: null });
    };

    const openEditSiteDialog = (gid: string, item: any) => {
        //  重要：initialData 用拷贝，避免表单编辑时直接污染原数据
        setDialog(siteDialog, { show: true, isEdit: true, groupId: gid, initialData: { ...item } });
    };

    const openAddGroupDialog = () => {
        setDialog(groupDialog, { show: true, isEdit: false, groupId: '', initialData: null });
    };

    const openEditGroupDialog = (group: any) => {
        setDialog(groupDialog, { show: true, isEdit: true, groupId: '', initialData: { ...group } });
    };

    //  保持 MainGrid inject('dialog') 不变
    provide('dialog', {
        openAddDialog: openAddSiteDialog,
        openGroupDialog: openAddGroupDialog,
    });

    //  右键菜单编辑
    const handleContextMenuEdit = () => {
        const { type, item, groupId } = ui.contextMenu;

        if (type === 'site') {
            openEditSiteDialog(groupId, item);
        } else if (type === 'group') {
            openEditGroupDialog(item);
        }
    };

    const onSiteSubmit = (data: any) => {
        if (siteDialog.isEdit && siteDialog.initialData) {
            store.updateSite(siteDialog.groupId, siteDialog.initialData.id, data);
        } else {
            store.addSite(siteDialog.groupId, data);
        }
        setDialog(siteDialog, { show: false });
    };

    const onGroupSubmit = (data: any) => {
        const payload = {
            title: data.title,
            icon: data.icon,
            iconColor: data.iconColor,
            iconBgColor: data.iconBgColor,
        };

        if (groupDialog.isEdit && groupDialog.initialData) {
            store.updateGroup(groupDialog.initialData.id, payload);
        } else {
            store.addGroup(payload);
        }

        setDialog(groupDialog, { show: false });
    };

    const closeSiteDialog = () => setDialog(siteDialog, { show: false });
    const closeGroupDialog = () => setDialog(groupDialog, { show: false });

    return {
        siteDialog,
        groupDialog,

        openAddSiteDialog,
        openAddGroupDialog,

        closeSiteDialog,
        closeGroupDialog,

        handleContextMenuEdit,
        onSiteSubmit,
        onGroupSubmit,
    };
}
