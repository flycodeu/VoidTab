<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref, computed} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';

// Stores
import {useConfigStore} from '../../stores/useConfigStore';
import {useUiStore} from '../../stores/useUiStore';
import {useStatsStore} from '../../stores/useStatsStore'; // ✅ 引入统计 Store

// Components
import GlassCard from './GlassCard.vue';
import AddCard from './AddCard.vue';
import GroupHeaderBar from '../layout/widget-panel/GroupHeaderBar.vue';
import ConfirmDialog from '../ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';

// Composables
import {useGridLayout} from '../../composables/useGridLayout';
import {useVisibleGroups} from '../../composables/useVisibleGroups';
import {useDeleteConfirm} from '../../composables/useDeleteConfirm';

const del = useDeleteConfirm();

const props = defineProps<{
  activeGroupId: string;
  isEditMode: boolean;
}>();

const store = useConfigStore();
const ui = useUiStore();
const statsStore = useStatsStore(); // ✅ 初始化统计 Store

const dialog = inject('dialog') as { openAddDialog: (gid: string) => void } | undefined;
const openAddDialog = (gid: string) => dialog?.openAddDialog?.(gid);

const {gridStyle, itemContainerStyle} = useGridLayout(store.config.theme);

const {visibleGroups} = useVisibleGroups({
  groups: store.config.layout || [],
  isEditMode: () => props.isEditMode,
  activeGroupId: () => props.activeGroupId,
  dragState: ui.dragState
});

const activeGroupData = computed(() => {
  return store.config.layout.find(g => g.id === props.activeGroupId);
});

// --- 样式计算 ---
const densityStyle = computed(() => {
  const mode = store.config.theme.density || 'normal';
  const baseGap = store.config.theme.gap;

  if (mode === 'compact') {
    return {gap: `${Math.max(8, baseGap * 0.6)}px`, ...gridStyle.value};
  } else if (mode === 'comfortable') {
    return {gap: `${baseGap * 1.2}px`, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'};
  }
  return gridStyle.value;
});

const densityItemClass = computed(() => `density-mode-${store.config.theme.density || 'normal'}`);

/** ------------------------------
 * ✅ 排序核心逻辑 (Store 响应式版)
 * ------------------------------ */

// 1. 获取当前 SortKey (默认为 custom)
const currentSortKey = computed(() => activeGroupData.value?.sortKey || 'custom');

// 2. 计算最终显示列表
const displayItems = computed({
  get() {
    if (!activeGroupData.value) return [];

    // ⚠️ 浅拷贝：防止 sort 污染原数据
    const items = [...activeGroupData.value.items];
    const key = currentSortKey.value;

    // 按名称 A-Z
    if (key === 'name') {
      return items.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
    }

    // 按最近访问 (降序)
    if (key === 'lastVisited') {
      return items.sort((a, b) => {
        // ✅ 直接从 Store 获取响应式数据
        const timeA = statsStore.getLastVisited(a.id);
        const timeB = statsStore.getLastVisited(b.id);

        // 时间相同则按名称兜底 (防止顺序随机跳动)
        if (timeB !== timeA) return timeB - timeA;
        return (a.title || '').localeCompare(b.title || '');
      });
    }

    // custom: 返回原始顺序
    return items;
  },
  set(val) {
    // 只有 custom 模式允许回写 Store
    if (currentSortKey.value === 'custom' && activeGroupData.value) {
      activeGroupData.value.items = val;
    }
  }
});

// 仅在 custom 模式且编辑模式下允许拖拽 (用于 displayItems 的绑定)
const isDragEnabled = computed(() => {
  return !props.isEditMode && currentSortKey.value === 'custom';
});
console.log(isDragEnabled)
/** ------------------------------
 * 滚动与拖拽辅助逻辑
 * ------------------------------ */
const scrollEl = ref<HTMLElement | null>(null);
let autoScrollOn = false;
let holdActive = false;
let rafId = 0;
let lastClientY = -1;
const EDGE = 90;
const MIN_SPEED = 6;
const MAX_SPEED = 22;

function findScrollEl() {
  scrollEl.value = document.querySelector('[data-main-scroll="1"]') as HTMLElement | null;
}

function updatePointerY(e: any) {
  if (typeof e?.clientY === 'number') lastClientY = e.clientY;
  if (typeof e?.originalEvent?.clientY === 'number') lastClientY = e.originalEvent.clientY;
}

function calcSpeed(distance: number) {
  const t = Math.min(1, Math.max(0, distance / EDGE));
  return Math.max(MIN_SPEED, Math.floor(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * t));
}

function tickAutoScroll() {
  if (!autoScrollOn || !scrollEl.value) return;
  const el = scrollEl.value;
  const rect = el.getBoundingClientRect();
  const y = lastClientY;
  if (y >= 0) {
    const topZone = rect.top + EDGE;
    const bottomZone = rect.bottom - EDGE;
    let dy = 0;
    if (y < topZone) dy = -calcSpeed(topZone - y);
    else if (y > bottomZone) dy = calcSpeed(y - bottomZone);
    if (dy !== 0) el.scrollTop += dy;
  }
  rafId = requestAnimationFrame(tickAutoScroll);
}

let wheelBound = false;

function onWheelWhileHoldOrDrag(e: WheelEvent) {
  if (!scrollEl.value || !props.isEditMode || (!holdActive && !autoScrollOn) || !e.cancelable) return;
  e.preventDefault();
  e.stopPropagation();
  scrollEl.value.scrollTop += e.deltaY;
  updatePointerY(e);
}

function bindWheel() {
  if (wheelBound) return;
  wheelBound = true;
  window.addEventListener('wheel', onWheelWhileHoldOrDrag, {capture: true, passive: false});
}

function unbindWheelIfIdle() {
  if (holdActive || autoScrollOn || !wheelBound) return;
  wheelBound = false;
  window.removeEventListener('wheel', onWheelWhileHoldOrDrag, true);
}

function startAutoScroll(e?: any) {
  if (autoScrollOn) return;
  findScrollEl();
  if (!scrollEl.value) return;
  autoScrollOn = true;
  updatePointerY(e);
  window.addEventListener('pointermove', updatePointerY, {passive: true});
  window.addEventListener('dragover', updatePointerY, {passive: true});
  bindWheel();
  rafId = requestAnimationFrame(tickAutoScroll);
}

function stopAutoScroll() {
  if (!autoScrollOn) return;
  autoScrollOn = false;
  window.removeEventListener('pointermove', updatePointerY as any);
  window.removeEventListener('dragover', updatePointerY as any);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastClientY = -1;
  unbindWheelIfIdle();
}

function onHoldStart(e: PointerEvent) {
  if (!props.isEditMode) return;
  // 仅在 Custom 模式下允许长按
  if (currentSortKey.value !== 'custom') return;
  holdActive = true;
  bindWheel();
  const end = () => {
    holdActive = false;
    unbindWheelIfIdle();
    window.removeEventListener('pointerup', end as any, true);
    window.removeEventListener('pointercancel', end as any, true);
  };
  window.addEventListener('pointerup', end as any, true);
  window.addEventListener('pointercancel', end as any, true);
  updatePointerY(e);
}

onMounted(() => {
  findScrollEl();
});
onBeforeUnmount(() => {
  stopAutoScroll();
  holdActive = false;
  unbindWheelIfIdle();
});
const onDragStart = (event: any, group: any) => {
  const item = group.items?.[event.oldIndex];
  if (item) ui.setDragState(true, group.id, item);
  startAutoScroll(event?.originalEvent || event);
};
const onDragEnd = () => {
  stopAutoScroll();
  requestAnimationFrame(() => {
    setTimeout(() => ui.setDragState(false), 200);
  });
};
const handleContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  ui.openContextMenu(e, item, 'site', groupId);
};
const showDeleteModal = ref(false);
const deleteTarget = ref<{ groupId: string; siteId: string } | null>(null);
const handleDelete = (groupId: string, siteId: string, title?: string) => {
  del.open({kind: 'site', groupId, siteId, title});
};
const confirmDelete = () => {
  if (!deleteTarget.value) return;
  store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  showDeleteModal.value = false;
  deleteTarget.value = null;
};
</script>

<template>
  <div class="w-full flex flex-col items-center pb-20">
    <div class="w-full transition-all duration-300 px-4" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">

      <GroupHeaderBar
          v-if="!isEditMode && activeGroupData"
          :group-name="activeGroupData.title"
          :count="activeGroupData.items?.length || 0"
          :sort-key="currentSortKey"
          @update:sortKey="(key) => store.updateGroupSort(activeGroupId, key)"
          :key="activeGroupId"
      />

      <template v-for="group in visibleGroups" :key="group.id">
        <div class="transition-all duration-300 mb-8 animate-fade-in">

          <div
              v-if="isEditMode"
              class="px-2 mb-3 text-[var(--accent-color)] font-bold tracking-wider text-sm flex items-center gap-2"
          >
            <div class="w-1 h-4 bg-[var(--accent-color)] rounded-full"></div>
            {{ group.title }}
          </div>

          <VueDraggable
              v-if="isEditMode"
              :key="'edit-' + group.id"
              v-model="group.items"
              :animation="200"
              group="voidtab-shared-group"
              filter=".ignore-drag"
              class="grid items-start content-start min-h-[100px]"
              :class="[{ 'bg-white/5 rounded-xl border border-dashed border-white/10 p-4': isEditMode }]"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="densityStyle"
              :disabled="false"
              :scroll="true"
              :scrollSensitivity="90"
              :scrollSpeed="14"
          >
            <div
                v-for="item in group.items"
                :key="item.id"
                :style="itemContainerStyle"
                class="site-tile"
                :class="[{ 'arrange-mode': isEditMode }, densityItemClass]"
                @pointerdown="onHoldStart"
            >
              <div class="site-wrap">
                <GlassCard
                    :item="item"
                    :isEditMode="isEditMode"
                    :density="store.config.theme.density"
                    @delete="handleDelete(group.id, item.id, item.title)"
                    @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"
                />
              </div>
            </div>

            <div :style="itemContainerStyle" class="site-tile ignore-drag" :class="{ 'arrange-mode': isEditMode }">
              <div class="site-wrap">
                <AddCard class="ignore-drag" :size="Number(store.config.theme.iconSize)"
                         :radius="Number(store.config.theme.radius)" :showName="!!store.config.theme.showIconName"
                         :textSize="Number(store.config.theme.iconTextSize)" @click="openAddDialog(group.id)"/>
              </div>
            </div>
          </VueDraggable>

          <VueDraggable
              v-else
              :key="'view-' + group.id + '-' + currentSortKey"
              v-model="displayItems"
              :animation="200"
              group="voidtab-shared-group"
              filter=".ignore-drag"
              class="grid items-start content-start min-h-[100px]"
              ghost-class="sortable-ghost"
              :style="densityStyle"
              :disabled="true"
          >
            <div
                v-for="item in displayItems"
                :key="item.id"
                :style="itemContainerStyle"
                class="site-tile"
                :class="densityItemClass"
            >
              <div class="site-wrap">
                <GlassCard
                    :item="item"
                    :isEditMode="false"
                    :density="store.config.theme.density"
                    @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"
                />
              </div>
            </div>

            <div :style="itemContainerStyle" class="site-tile ignore-drag">
              <div class="site-wrap">
                <AddCard class="ignore-drag" :size="Number(store.config.theme.iconSize)"
                         :radius="Number(store.config.theme.radius)" :showName="!!store.config.theme.showIconName"
                         :textSize="Number(store.config.theme.iconTextSize)" @click="openAddDialog(group.id)"/>
              </div>
            </div>
          </VueDraggable>

        </div>
      </template>
    </div>

    <ConfirmDialog
        :show="showDeleteModal"
        title="确认删除？"
        :message="['删除后无法恢复，', '确定要移除这个图标吗？']"
        confirmText="确认删除"
        cancelText="取消"
        :danger="true"
        @cancel="showDeleteModal = false"
        @confirm="confirmDelete"
    >
      <template #icon>
        <PhTrash :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.sortable-ghost {
  opacity: 0.4;
  background: var(--accent-color);
  border-radius: 16px;
  filter: grayscale(100%);
}

.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.site-tile {
  transition: transform 120ms ease;
  will-change: transform;
}

.site-tile:hover {
  transform: translateY(-1px);
}

.site-wrap {
  border-radius: 18px;
  padding: 6px;
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
  height: 100%;
  width: 100%;
}

.site-tile:hover .site-wrap {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.04);
}

:global(.dark) .site-tile:hover .site-wrap {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(255, 255, 255, 0.04);
}

.arrange-mode .site-wrap {
  background: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.05);
}

:global(.dark) .arrange-mode .site-wrap {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(255, 255, 255, 0.05);
}

.density-mode-comfortable .site-wrap {
  padding: 8px;
  border-radius: 12px;
}
</style>