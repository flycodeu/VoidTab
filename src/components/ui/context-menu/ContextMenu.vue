<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/useUiStore.ts';

import ContextMenuPanel from './ContextMenuPanel.vue';
import ConfirmDialog from "../ConfirmDialog.vue";

import {useDeleteConfirm} from '../../../composables/useDeleteConfirm';

const del = useDeleteConfirm();

type DeleteTarget =
    | { type: 'site'; groupId: string; siteId: string; title?: string }
    | { type: 'group'; groupId: string; title?: string }
    | null;

const store = useConfigStore();
const ui = useUiStore();

const emit = defineEmits<{
  (e: 'edit'): void;
}>();

// ========== 删除弹窗状态 ==========
const showDeleteModal = ref(false);
const deleteTarget = ref<DeleteTarget>(null);

const openDeleteModal = () => {
  if (!ui.contextMenu?.show) return;

  if (ui.contextMenu.type === 'site') {
    del.open({
      kind: 'site',
      groupId: ui.contextMenu.groupId,
      siteId: ui.contextMenu.item?.id,
      title: ui.contextMenu.item?.title
    });
  } else if (ui.contextMenu.type === 'group') {
    del.open({
      kind: 'group',
      groupId: ui.contextMenu.item?.id,
      title: ui.contextMenu.item?.title
    });
  }

  ui.closeContextMenu();
};

const confirmDelete = () => {
  if (!deleteTarget.value) {
    showDeleteModal.value = false;
    return;
  }

  if (deleteTarget.value.type === 'site') {
    store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  } else {
    store.removeGroup(deleteTarget.value.groupId);
  }

  showDeleteModal.value = false;
  deleteTarget.value = null;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  deleteTarget.value = null;
};

// ========== 菜单样式（位置 + 浅色适配） ==========
const menuStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    top: ui.contextMenu.y + 'px',
    left: ui.contextMenu.x + 'px',
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    color: isDark ? '#fff' : '#333',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
  };
});

// 当前组名（显示用）
const currentGroupName = computed(() => {
  if (!ui.contextMenu.groupId) return '';
  const g = store.config.layout.find((group: any) => group.id === ui.contextMenu.groupId);
  return g ? g.title : '';
});

// 移动逻辑
const moveTo = (targetGroupId: string) => {
  if (targetGroupId === ui.contextMenu.groupId) return;
  if (ui.contextMenu.type === 'site') {
    store.moveSite(ui.contextMenu.groupId, targetGroupId, ui.contextMenu.item.id);
  }
  ui.closeContextMenu();
};
// 新增 import
import {PhTrash} from '@phosphor-icons/vue';

// 新增：标题/内容计算（也可直接写在模板里）
const deleteTitle = computed(() => '确认删除？');

const deleteMessage = computed(() => {
  const t = deleteTarget.value?.type === 'group' ? '分组' : '图标';
  return ['删除后无法恢复，', `确定要移除这个${t}吗？`];
});

// 关闭逻辑
const handleClickOutside = () => ui.closeContextMenu();

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    del.close();
    ui.closeContextMenu();
  }
};


onMounted(() => {
  window.addEventListener('resize', handleClickOutside);
  window.addEventListener('scroll', handleClickOutside, true);
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleClickOutside);
  window.removeEventListener('scroll', handleClickOutside, true);
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <!-- 菜单面板（纯 UI，可随便换样式/结构） -->
  <ContextMenuPanel
      :show="ui.contextMenu.show"
      :styleObj="menuStyle"
      :menuType="ui.contextMenu.type"
      :groups="store.config.layout"
      :currentGroupId="ui.contextMenu.groupId"
      :currentGroupName="currentGroupName"
      @edit="() => { emit('edit'); ui.closeContextMenu(); }"
      @move="moveTo"
      @delete="openDeleteModal"
  />

  <!-- 删除弹窗（纯 UI，可替换） -->
  <ConfirmDialog
      :show="showDeleteModal"
      :title="deleteTitle"
      :message="deleteMessage"
      confirmText="确认删除"
      cancelText="取消"
      :danger="true"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
  >
    <template #icon>
      <PhTrash :size="32" weight="duotone"/>
    </template>
  </ConfirmDialog>

</template>
