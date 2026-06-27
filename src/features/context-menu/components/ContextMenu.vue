<script setup lang="ts">
import {computed, inject, onMounted, onUnmounted, ref, nextTick, watch} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {useToast} from '../../../shared/composables/useToast.ts';
import {cloneConfigSnapshot} from '../../../shared/utils/configSnapshot.ts';
import {tileStylePresets} from '../../../core/tiles/style.ts';
import type {TileSize} from '../../../core/tiles/contracts.ts';
import {resolveTileDefinition} from '../../../core/tiles/registry.ts';
import {
  cloneRuntimeTile,
  getLegacyWidgetType,
  getTileDesktopSize,
  getWorkspaceTiles,
  removeTile,
} from '../../../core/tiles/tileAccess.ts';
import {
  cleanupDeletedMusicEmbedTile,
  restoreMusicEmbedWidgetState,
  type MusicEmbedCleanupSnapshot,
} from '../../widgets/builtins/music-embed/cleanup.ts';

// 组件
import ContextMenuPanel from './ContextMenuPanel.vue';
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';

const store = useConfigStore();
const ui = useUiStore();
const toast = useToast();
const dialog = inject('dialog') as { openAddDialog: (gid: string) => void } | undefined;

// 菜单容器 Ref
const menuRef = ref<HTMLElement | null>(null);
const tileImportInput = ref<HTMLInputElement | null>(null);
const importTargetGroupId = ref('');

// ✅ 新增 emits：openSettings / openDevTools
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'toggleEdit'): void;
  (e: 'editWidgetSettings', item: any): void;
  (e: 'openWidgets', groupId?: string): void;

  (e: 'openSettings'): void;     // ✅ 打开设置
  (e: 'openDevTools'): void;     // ✅ 尝试打开 DevTools（F12）
}>();

// ========== 删除弹窗状态 ==========
type DeleteTarget =
    | { type: 'site' | 'widget'; groupId: string; siteId: string; title?: string }
    | { type: 'group'; groupId: string; title?: string }
    | null;

const showDeleteModal = ref(false);
const deleteTarget = ref<DeleteTarget>(null);

type DeleteSnapshot =
    | { type: 'site' | 'widget'; groupId: string; index: number; item: any; title: string; music?: MusicEmbedCleanupSnapshot | null }
    | { type: 'group'; index: number; group: any; title: string };

const restoreDeleted = (snapshot: DeleteSnapshot) => {
  if (snapshot.type === 'group') {
    if (store.config.layout.some((group: any) => group.id === snapshot.group.id)) {
      toast.info(`「${snapshot.title}」已经在列表中。`);
      return;
    }
    const index = Math.max(0, Math.min(snapshot.index, store.config.layout.length));
    store.config.layout.splice(index, 0, cloneConfigSnapshot(snapshot.group));
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
  const tiles = getWorkspaceTiles(group);
  if (tiles.some((item: any) => item.id === snapshot.item.id)) {
    toast.info(`「${snapshot.title}」已经在分组中。`);
    return;
  }
  const index = Math.max(0, Math.min(snapshot.index, tiles.length));
  tiles.splice(index, 0, cloneRuntimeTile(cloneConfigSnapshot(snapshot.item)));
  restoreMusicEmbedWidgetState(store.config, snapshot.music);
  void store.saveConfig();
  toast.success(`已恢复「${snapshot.title}」。`);
  ui.announce(`已恢复${snapshot.type === 'widget' ? '组件' : '网站'}${snapshot.title}`);
};

const getRuntimeItemTitle = (item: any, type: 'site' | 'widget') => {
  if (item?.title) return item.title;
  if (type === 'widget' && item) {
    return getLegacyWidgetType(item) || '未命名组件';
  }
  return '未命名';
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
      title: getRuntimeItemTitle(item, type),
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
    const tiles = group ? getWorkspaceTiles(group) : [];
    const index = tiles.findIndex((item: any) => item.id === target.siteId);
    const item = index >= 0 ? tiles[index] : null;
    if (group && item) {
      const music = cleanupDeletedMusicEmbedTile(store.config, item);
      snapshot = {
        type: target.type,
        groupId: target.groupId,
        index,
        item: cloneRuntimeTile(cloneConfigSnapshot(item)),
        title: getRuntimeItemTitle(item, target.type),
        music,
      };
      removeTile(group, target.siteId);
      void store.saveConfig();
    }
  } else if (target.type === 'group') {
    const index = store.config.layout.findIndex((group: any) => group.id === target.groupId);
    const group = index >= 0 ? store.config.layout[index] : null;
    if (group) {
      snapshot = {
        type: 'group',
        index,
        group: cloneConfigSnapshot(group),
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

type SizeEditor = {
  current: TileSize;
  default: TileSize;
  min: TileSize;
  max: TileSize;
  mobileFallback?: TileSize;
  allowed?: TileSize[];
};

const clampSizeValue = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};

const cloneSize = (size: TileSize): TileSize => ({w: size.w, h: size.h});

const sizeKey = (size: TileSize) => `${size.w}x${size.h}`;

const uniqueSizes = (sizes: (TileSize | undefined)[]) => {
  const seen = new Set<string>();
  const result: TileSize[] = [];
  for (const size of sizes) {
    if (!size) continue;
    const key = sizeKey(size);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneSize(size));
  }
  return result;
};

const sizeEditor = computed<SizeEditor | null>(() => {
  const {type, item} = ui.contextMenu;
  // Site icons render at a fixed 1×1 cell in icon mode, so a size editor there is
  // misleading. Only components (built-in/declarative/sandbox) expose sizing.
  if (type !== 'widget' || !item?.id || !item.tileType) return null;
  const definition = resolveTileDefinition(item.tileType, store.config.tileInstalls);
  if (!('sizes' in definition)) return null;
  const rules = definition.sizes;
  const cap = clampSizeValue(store.config.theme?.maxTileSpan, 6, 1, 16);
  const min = cloneSize(rules.min);
  const max = {
    w: Math.max(min.w, Math.min(rules.max.w, cap)),
    h: Math.max(min.h, Math.min(rules.max.h, cap)),
  };
  const current = getTileDesktopSize(item);
  return {
    current: {
      w: clampSizeValue(current.w, rules.default.w, min.w, max.w),
      h: clampSizeValue(current.h, rules.default.h, min.h, max.h),
    },
    default: cloneSize(rules.default),
    min,
    max,
    ...(rules.mobileFallback ? {mobileFallback: cloneSize(rules.mobileFallback)} : {}),
    ...(rules.allowed?.length ? {allowed: uniqueSizes(rules.allowed)} : {}),
  };
});

const normalizeRequestedSize = (item: any, w: number, h: number): TileSize | null => {
  const definition = resolveTileDefinition(item.tileType, store.config.tileInstalls);
  if (!('sizes' in definition)) {
    return {
      w: clampSizeValue(w, 1, 1, 16),
      h: clampSizeValue(h, 1, 1, 16),
    };
  }
  const rules = definition.sizes;
  const cap = clampSizeValue(store.config.theme?.maxTileSpan, 6, 1, 16);
  const min = rules.min;
  const max = {
    w: Math.max(min.w, Math.min(rules.max.w, cap)),
    h: Math.max(min.h, Math.min(rules.max.h, cap)),
  };
  const requested = {
    w: clampSizeValue(w, rules.default.w, min.w, max.w),
    h: clampSizeValue(h, rules.default.h, min.h, max.h),
  };
  if (rules.allowed?.length && !rules.allowed.some((size) => size.w === requested.w && size.h === requested.h)) {
    return null;
  }
  return requested;
};

// --- 事件处理 ---
const moveTo = (targetGroupId: string) => {
  if (targetGroupId === ui.contextMenu.groupId) return;
  if ((ui.contextMenu.type === 'site' || ui.contextMenu.type === 'widget') && ui.contextMenu.item) {
    store.moveSite(ui.contextMenu.groupId, targetGroupId, ui.contextMenu.item.id);
  }
  ui.closeContextMenu();
};

const handleAddSite = () => {
  if (dialog && ui.contextMenu.groupId) dialog.openAddDialog(ui.contextMenu.groupId);
  ui.closeContextMenu();
};

const handleAddWidgetRequest = () => {
  emit('openWidgets', ui.contextMenu.groupId);
  ui.closeContextMenu();
};

const handleOpenDesigner = () => {
  window.dispatchEvent(new CustomEvent('voidtab:open-designer'));
  ui.closeContextMenu();
};

const safeFilename = (value: string) =>
    String(value || 'tile')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'tile';

const handleExportTile = () => {
  const {groupId, item} = ui.contextMenu;
  if (!groupId || !item?.id) {
    toast.warning('当前项目缺少必要信息，无法导出。');
    ui.closeContextMenu();
    return;
  }

  const payload = store.exportTileInstanceForShare(groupId, item.id);
  if (!payload) {
    toast.warning('这个卡片已经不在当前分组中。');
    ui.closeContextMenu();
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(item.title || item.id)}.voidtile-instance`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  const removedCount = payload.sanitized.sensitiveFieldsRemoved.length;
  toast.success(removedCount > 0 ? `已导出卡片实例，并移除 ${removedCount} 个敏感字段。` : '已导出卡片实例。');
  ui.closeContextMenu();
};

const handleImportTileRequest = () => {
  if (!ui.contextMenu.groupId) {
    toast.warning('请先选择要导入到的分组。');
    ui.closeContextMenu();
    return;
  }
  importTargetGroupId.value = ui.contextMenu.groupId;
  tileImportInput.value && (tileImportInput.value.value = '');
  tileImportInput.value?.click();
  ui.closeContextMenu();
};

const handleTileImportFile = async (event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const raw = JSON.parse(await file.text());
    const result = store.importTileInstanceToGroup(importTargetGroupId.value, raw);
    if (result.success) {
      toast.success('已导入卡片实例。');
      return;
    }
    toast.error(result.message || '导入卡片实例失败。');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导入卡片实例失败。');
  } finally {
    if (input) input.value = '';
  }
};

const handleStylePreset = (preset: 'clean' | 'soft' | 'vivid') => {
  const {groupId, item} = ui.contextMenu;
  if (!groupId || !item?.id) {
    toast.warning('当前项目缺少必要信息，无法设置外观。');
    ui.closeContextMenu();
    return;
  }
  const success = store.updateTileStyleOverride(groupId, item.id, {...tileStylePresets[preset]});
  toast[success ? 'success' : 'warning'](success ? '已更新这个卡片的实例外观。' : '这个卡片已经不在当前分组中。');
  ui.closeContextMenu();
};

const handleResizeItem = (w: number, h: number) => {
  if (ui.contextMenu.item && ui.contextMenu.groupId) {
    const nextSize = normalizeRequestedSize(ui.contextMenu.item, w, h);
    if (!nextSize) {
      toast.warning('这个尺寸不在该卡片允许范围内。');
      ui.closeContextMenu();
      return;
    }
    const success = store.updateItemSize(ui.contextMenu.groupId, ui.contextMenu.item.id, nextSize.w, nextSize.h);
    if (success === false) toast.warning('这个尺寸不在该卡片允许范围内。');
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
        :sizeEditor="sizeEditor"
        :showAppearance="store.config.theme?.showTileAppearanceMenu !== false"
        :showSizeEditor="store.config.theme?.showTileSizeMenu !== false"
        :showDesigner="store.config.theme?.showDesignerMenu !== false"
        :showImportTile="store.config.theme?.showImportTileMenu !== false"
        :showDevTools="store.config.theme?.showDevToolsMenu !== false"
        @toggleGlobalEdit="handleToggleGlobalEdit"
        @move="moveTo"
        @delete="openDeleteModal"
        @resize="handleResizeItem"
        @addSite="handleAddSite"
        @addWidget="handleAddWidgetRequest"
        @openDesigner="handleOpenDesigner"
        @importTile="handleImportTileRequest"
        @exportTile="handleExportTile"
        @stylePreset="handleStylePreset"
        @configWidget="handleConfigWidget"
        @openSettings="handleOpenSettings"
        @openDevTools="handleOpenDevTools"
        @edit="() => { emit('edit'); ui.closeContextMenu(); }"
    />
  </div>
  <input
      ref="tileImportInput"
      class="hidden"
      type="file"
      accept=".voidtile-instance,.json,.voidtab-tile.json,application/json"
      @change="handleTileImportFile"
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
