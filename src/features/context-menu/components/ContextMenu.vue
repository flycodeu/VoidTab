<script setup lang="ts">
import {computed, defineAsyncComponent, inject, onMounted, onUnmounted, ref, nextTick, watch} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {useToast} from '../../../shared/composables/useToast.ts';

// 组件
import ContextMenuPanel from './ContextMenuPanel.vue';
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';

const WidgetMarketplaceModal = defineAsyncComponent(() => import('../../widgets/components/WidgetMarketplaceModal.vue'));

const store = useConfigStore();
const ui = useUiStore();
const toast = useToast();
const dialog = inject('dialog') as { openAddDialog: (gid: string) => void } | undefined;

// 菜单容器 Ref
const menuRef = ref<HTMLElement | null>(null);

// ✅ 新增 emits：openSettings / openDevTools
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'toggleEdit'): void;
  (e: 'editWidgetSettings', item: any): void;

  (e: 'openSettings'): void;     // ✅ 打开设置
  (e: 'openDevTools'): void;     // ✅ 尝试打开 DevTools（F12）
}>();

const showWidgetModal = ref(false);

// ========== 删除弹窗状态 ==========
type DeleteTarget =
    | { type: 'site' | 'widget'; groupId: string; siteId: string; title?: string }
    | { type: 'group'; groupId: string; title?: string }
    | null;

const showDeleteModal = ref(false);
const deleteTarget = ref<DeleteTarget>(null);

type DeleteSnapshot =
    | { type: 'site' | 'widget'; groupId: string; index: number; item: any; title: string }
    | { type: 'group'; index: number; group: any; title: string };

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const restoreDeleted = (snapshot: DeleteSnapshot) => {
  if (snapshot.type === 'group') {
    if (store.config.layout.some((group: any) => group.id === snapshot.group.id)) {
      toast.info(`「${snapshot.title}」已经在列表中。`);
      return;
    }
    const index = Math.max(0, Math.min(snapshot.index, store.config.layout.length));
    store.config.layout.splice(index, 0, cloneValue(snapshot.group));
    void store.saveConfig();
    toast.success(`已恢复分组「${snapshot.title}」。`);
    ui.announce(`已恢复分组${snapshot.title}`);
    return;
  }

  const group = store.config.layout.find((item: any) => item.id === snapshot.groupId);
  if (!group) {
    toast.error('原分组不存在，无法撤销这次移除。');
    ui.announce('原分组不存在，无法撤销这次移除');
    return;
  }
  if (group.items.some((item: any) => item.id === snapshot.item.id)) {
    toast.info(`「${snapshot.title}」已经在分组中。`);
    return;
  }
  const index = Math.max(0, Math.min(snapshot.index, group.items.length));
  group.items.splice(index, 0, cloneValue(snapshot.item));
  void store.saveConfig();
  toast.success(`已恢复「${snapshot.title}」。`);
  ui.announce(`已恢复${snapshot.type === 'widget' ? '组件' : '网站'}${snapshot.title}`);
};

const openDeleteModal = () => {
  if (!ui.contextMenu?.show) return;

  const {type, groupId, item} = ui.contextMenu;

  if (type === 'site' || type === 'widget') {
    if (!groupId || !item?.id) {
      toast.warning('当前项目缺少必要信息，无法删除。');
      ui.announce('当前项目缺少必要信息，无法删除');
      ui.closeContextMenu();
      return;
    }

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
  const target = deleteTarget.value;
  if (!target) {
    showDeleteModal.value = false;
    return;
  }

  let snapshot: DeleteSnapshot | null = null;

  if (target.type === 'site' || target.type === 'widget') {
    const group = store.config.layout.find((item: any) => item.id === target.groupId);
    const index = group?.items.findIndex((item: any) => item.id === target.siteId) ?? -1;
    const item = index >= 0 ? group?.items[index] : null;
    if (group && item) {
      snapshot = {
        type: target.type,
        groupId: target.groupId,
        index,
        item: cloneValue(item),
        title: item.title || (target.type === 'widget' ? item.widgetType || '未命名组件' : '未命名'),
      };
      store.removeSite(target.groupId, target.siteId);
    }
  } else if (target.type === 'group') {
    const index = store.config.layout.findIndex((group: any) => group.id === target.groupId);
    const group = index >= 0 ? store.config.layout[index] : null;
    if (group) {
      snapshot = {
        type: 'group',
        index,
        group: cloneValue(group),
        title: group.title || '未命名分组',
      };
      store.removeGroup(target.groupId);
    }
  }

  showDeleteModal.value = false;
  deleteTarget.value = null;

  if (snapshot) {
    void store.saveConfig();
    const label = snapshot.type === 'group' ? '分组' : snapshot.type === 'widget' ? '组件' : '网站';
    toast.warning(`已移除${label}「${snapshot.title}」。`, {
      duration: 6000,
      action: {
        label: '撤销',
        handler: () => restoreDeleted(snapshot),
      },
    });
    ui.announce(`已移除${label}${snapshot.title}，可在通知中选择撤销`);
  }
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
  const isDark = store.config.theme.mode === 'dark';
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

// ✅ 新增：打开设置
const handleOpenSettings = () => {
  emit('openSettings');
  ui.closeContextMenu();
};

// ✅ 新增：尝试打开 DevTools（由上层决定怎么处理）
const handleOpenDevTools = () => {
  emit('openDevTools');
  ui.closeContextMenu();
};

const deleteTitle = computed(() => '确认删除？');
const deleteMessage = computed(() => {
  const t = deleteTarget.value?.type === 'group' ? '分组' : deleteTarget.value?.type === 'widget' ? '组件' : '图标';
  return ['确认后会先移出当前列表，', `你可以在通知中点击撤销恢复这个${t}。`];
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
  window.addEventListener('pointerdown', handleClickOutside, true);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('pointerdown', handleClickOutside, true);
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
        @openSettings="handleOpenSettings"
      @openDevTools="handleOpenDevTools"
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
