<script setup lang="ts">
import {computed, inject, onMounted, onUnmounted, ref, nextTick, watch} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import { useSystemPrefersDark } from '../../../shared/composables/theme/systemColorScheme';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {useDeleteConfirm} from '../../confirm-delete/composables/useDeleteConfirm.ts';

// 组件
import ContextMenuPanel from './ContextMenuPanel.vue';
import WidgetMarketplaceModal from '../../widgets/components/WidgetMarketplaceModal.vue';
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';

const store = useConfigStore();
const ui = useUiStore();
const { prefersDark: systemPrefersDark } = useSystemPrefersDark();
useDeleteConfirm();
const dialog = inject('dialog') as { openAddDialog: (gid: string) => void } | undefined;

// 菜单容器 Ref
const menuRef = ref<HTMLElement | null>(null);

// 完整定义 emits，防止事件无法穿透
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'toggleEdit'): void;          // 向 HomeMain 发送开启编辑模式信号
  (e: 'editWidgetSettings', item: any): void; // 向 HomeMain 发送配置组件信号
}>();

const showWidgetModal = ref(false);

// ========== 删除弹窗状态 ==========
type DeleteTarget =
    | { type: 'site' | 'widget'; groupId: string; siteId: string; title?: string }
    | { type: 'group'; groupId: string; title?: string }
    | null;

const showDeleteModal = ref(false);
const deleteTarget = ref<DeleteTarget>(null);

const openDeleteModal = () => {
  if (!ui.contextMenu?.show) return;

  const {type, groupId, item} = ui.contextMenu;

  if (type === 'site' || type === 'widget') {
    deleteTarget.value = {
      type,
      groupId,
      siteId: item?.id,
      title: item?.title || (type === 'widget' ? item?.widgetType : '未命名'),
    };
    showDeleteModal.value = true;
  } else if (type === 'group') {
    deleteTarget.value = {
      type: 'group',
      groupId: item?.id,
      title: item?.title,
    };
    showDeleteModal.value = true;
  }

  ui.closeContextMenu();
};

const confirmDelete = () => {
  if (!deleteTarget.value) {
    showDeleteModal.value = false;
    return;
  }

  if (deleteTarget.value.type === 'site' || deleteTarget.value.type === 'widget') {
    store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  } else if (deleteTarget.value.type === 'group') {
    store.removeGroup(deleteTarget.value.groupId);
  }

  showDeleteModal.value = false;
  deleteTarget.value = null;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  deleteTarget.value = null;
};

// =====================
// 自动避让
// =====================
const PAD = 12;
const menuPos = ref({top: 0, left: 0, origin: 'top left', maxH: 0});

function getPanelEl() {
  return menuRef.value?.querySelector('.context-menu-panel-root') as HTMLElement | null;
}

async function recomputeMenuPosition() {
  if (!ui.contextMenu?.show) return;

  const rawTop = ui.contextMenu.y;
  const rawLeft = ui.contextMenu.x;

  menuPos.value = {top: rawTop, left: rawLeft, origin: 'top left', maxH: Math.max(120, window.innerHeight - PAD * 2)};

  await nextTick();

  const el = getPanelEl();
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  let top = rawTop;
  let left = rawLeft;

  let originX: 'left' | 'right' = 'left';
  if (left + rect.width > winW - PAD) {
    left = winW - rect.width - PAD;
    originX = 'right';
  }
  left = Math.max(PAD, left);

  let originY: 'top' | 'bottom' = 'top';
  if (top + rect.height > winH - PAD) {
    const candidate = rawTop - rect.height;
    if (candidate >= PAD) {
      top = candidate;
      originY = 'bottom';
    } else {
      top = winH - rect.height - PAD;
      originY = 'bottom';
    }
  }
  top = Math.max(PAD, top);

  menuPos.value = {
    top,
    left,
    origin: `${originY} ${originX}`,
    maxH: Math.max(120, winH - PAD * 2),
  };
}

watch(() => [ui.contextMenu.show, ui.contextMenu.x, ui.contextMenu.y, ui.contextMenu.type], async ([show]) => {
  if (show) await recomputeMenuPosition();
});

const handleResize = async () => {
  if (ui.contextMenu.show) await recomputeMenuPosition();
};

const menuStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark'
      ? true
      : store.config.theme.mode === 'light'
          ? false
          : systemPrefersDark.value;
  return {
    top: menuPos.value.top + 'px',
    left: menuPos.value.left + 'px',
    transformOrigin: menuPos.value.origin,
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    color: isDark ? '#fff' : '#333',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    maxHeight: menuPos.value.maxH + 'px',
    overflowY: 'auto',
  } as Record<string, any>;
});

const currentGroupName = computed(() => {
  if (!ui.contextMenu.groupId) return '';
  const g = store.config.layout.find((group: any) => group.id === ui.contextMenu.groupId);
  return g ? g.title : '';
});

// --- 事件处理 ---

const moveTo = (targetGroupId: string) => {
  if (targetGroupId === ui.contextMenu.groupId) return;
  if (ui.contextMenu.type === 'site' && ui.contextMenu.item) {
    store.moveSite(ui.contextMenu.groupId, targetGroupId, ui.contextMenu.item.id);
  }
  ui.closeContextMenu();
};

const handleAddSite = () => {
  if (dialog && ui.contextMenu.groupId) dialog.openAddDialog(ui.contextMenu.groupId);
  ui.closeContextMenu();
};

const handleAddWidgetRequest = () => {
  ui.closeContextMenu();
  showWidgetModal.value = true;
};

const handleConfirmAddWidget = (type: string) => {
  if (ui.contextMenu.groupId) store.addWidget(ui.contextMenu.groupId, type);
};

const handleResizeItem = (w: number, h: number) => {
  if (ui.contextMenu.item && ui.contextMenu.groupId) {
    store.updateItemSize(ui.contextMenu.groupId, ui.contextMenu.item.id, w, h);
  }
  ui.closeContextMenu();
};

//  修复 2: 响应 Panel 的事件，并向上抛出
const handleToggleGlobalEdit = () => {
  emit('toggleEdit');
  ui.closeContextMenu();
};

const handleConfigWidget = () => {
  if (ui.contextMenu.item) {
    emit('editWidgetSettings', ui.contextMenu.item);
  }
  ui.closeContextMenu();
};

const deleteTitle = computed(() => '确认删除？');
const deleteMessage = computed(() => {
  const t = deleteTarget.value?.type === 'group' ? '分组' : deleteTarget.value?.type === 'widget' ? '组件' : '图标';
  return ['删除后无法恢复，', `确定要移除这个${t}吗？`];
});

const handleClickOutside = (event: Event) => {
  if (!ui.contextMenu.show) return;
  const target = event.target;
  if (menuRef.value && target instanceof Node && menuRef.value.contains(target)) return;
  ui.closeContextMenu();
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (showDeleteModal.value) {
    showDeleteModal.value = false;
    return;
  }
  ui.closeContextMenu();
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  window.addEventListener('mousedown', handleClickOutside, true);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousedown', handleClickOutside, true);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
      ref="menuRef"
      class="fixed z-[99999]"
      :style="{ pointerEvents: ui.contextMenu.show ? 'auto' : 'none' }"
  >
    <ContextMenuPanel
        :show="ui.contextMenu.show"
        :styleObj="menuStyle"
        :menuType="ui.contextMenu.type"
        :groups="store.config.layout"
        :currentGroupId="ui.contextMenu.groupId"
        :currentGroupName="currentGroupName"
        @toggleGlobalEdit="handleToggleGlobalEdit"
        @move="moveTo"
        @delete="openDeleteModal"
        @resize="handleResizeItem"
        @addSite="handleAddSite"
        @addWidget="handleAddWidgetRequest"
        @configWidget="handleConfigWidget"
        @edit="() => { emit('edit'); ui.closeContextMenu(); }"
    />
  </div>

  <WidgetMarketplaceModal
      :show="showWidgetModal"
      @close="showWidgetModal = false"
      @select="handleConfirmAddWidget"
  />

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