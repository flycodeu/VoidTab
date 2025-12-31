<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref, computed} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';

import {useConfigStore} from '../../stores/useConfigStore';
import {useUiStore} from '../../stores/useUiStore';

import GlassCard from './GlassCard.vue';
import AddCard from './AddCard.vue';
import GroupHeaderBar from '../layout/widget-panel/GroupHeaderBar.vue';

import {useGridLayout} from '../../composables/useGridLayout';
import {useVisibleGroups} from '../../composables/useVisibleGroups';
import ConfirmDialog from '../ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';
import {useDeleteConfirm} from '../../composables/useDeleteConfirm';

const del = useDeleteConfirm();

const props = defineProps<{
  activeGroupId: string;
  isEditMode: boolean;
}>();

const store = useConfigStore();
const ui = useUiStore();

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

// ✅ 新增：根据密度模式动态调整网格样式
const densityStyle = computed(() => {
  const mode = store.config.theme.density || 'normal';
  const baseGap = store.config.theme.gap;

  if (mode === 'compact') {
    return {
      // 紧凑模式：减小间距
      gap: `${Math.max(8, baseGap * 0.6)}px`,
      // 保持列宽逻辑不变，但因为间距小了，会更紧密
      ...gridStyle.value
    };
  } else if (mode === 'comfortable') {
    return {
      // 舒适模式：增大间距，强制拉宽列宽以容纳长卡片
      gap: `${baseGap * 1.2}px`,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'
    };
  }
  // Normal 模式：使用默认配置
  return gridStyle.value;
});

// ✅ 新增：传递给卡片的容器样式（用于舒适模式）
const densityItemClass = computed(() => {
  const mode = store.config.theme.density || 'normal';
  return `density-mode-${mode}`;
});

/** ------------------------------
 * 滚动逻辑保持不变
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
  if (!scrollEl.value) return;
  if (!props.isEditMode) return;
  if (!holdActive && !autoScrollOn) return;
  if (!e.cancelable) return;
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
  if (holdActive || autoScrollOn) return;
  if (!wheelBound) return;
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
              :disabled="!isEditMode"
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

            <div
                :style="itemContainerStyle"
                class="site-tile ignore-drag"
                :class="{ 'arrange-mode': isEditMode }"
            >
              <div class="site-wrap">
                <AddCard
                    class="ignore-drag"
                    :size="Number(store.config.theme.iconSize)"
                    :radius="Number(store.config.theme.radius)"
                    :showName="!!store.config.theme.showIconName"
                    :textSize="Number(store.config.theme.iconTextSize)"
                    @click="openAddDialog(group.id)"
                />
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
  /* 确保 comfortable 模式下容器充满 */
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

/* ✅ Comfortable 模式下的特殊样式：强制卡片左对齐（假设 GlassCard 内部布局能响应宽度） */
.density-mode-comfortable .site-wrap {
  padding: 8px;
  border-radius: 12px;
}
</style>