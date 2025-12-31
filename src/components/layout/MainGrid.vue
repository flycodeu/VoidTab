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

// ✅ 新增：计算当前激活的分组信息（用于 Header 展示）
// 如果 activeGroupId 为空或其他情况，尝试取 layout 第一个或返回 null
const activeGroupData = computed(() => {
  return store.config.layout.find(g => g.id === props.activeGroupId);
});

/** ------------------------------
 * ✅ 拖拽/按住期间：自动滚动（边缘）+ 滚轮强制滚动 main 容器
 * 滚动容器是 HomeMain 的 <main data-main-scroll="1">
 * ------------------------------ */
const scrollEl = ref<HTMLElement | null>(null);

let autoScrollOn = false;
let holdActive = false;
let rafId = 0;
let lastClientY = -1;

// 边缘自动滚动参数
const EDGE = 90;       // 顶/底触发区域高度
const MIN_SPEED = 6;   // 最小滚动速度
const MAX_SPEED = 22;  // 最大滚动速度

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

/** ✅ 关键：按住/拖拽期间，滚轮强制滚动 main（即便库阻止了默认滚动） */
let wheelBound = false;

function onWheelWhileHoldOrDrag(e: WheelEvent) {
  if (!scrollEl.value) return;
  // 只在整理模式且「按住图标」或「正在拖拽」时接管
  if (!props.isEditMode) return;
  if (!holdActive && !autoScrollOn) return;
  if (!e.cancelable) return;

  e.preventDefault();
  e.stopPropagation();

  // 让滚轮控制视口移动
  scrollEl.value.scrollTop += e.deltaY;

  // 同步一下 pointerY，边缘自动滚动更稳
  updatePointerY(e);
}

function bindWheel() {
  if (wheelBound) return;
  wheelBound = true;
  // capture + passive:false 才能 preventDefault
  window.addEventListener('wheel', onWheelWhileHoldOrDrag, {capture: true, passive: false});
}

function unbindWheelIfIdle() {
  // 如果既不按住也不拖拽，就撤掉 wheel 监听，避免常驻消耗
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

/** ✅ 新增：按住图标（未拖拽也算）也可以滚轮滚动 */
function onHoldStart(e: PointerEvent) {
  if (!props.isEditMode) return;
  holdActive = true;
  bindWheel();

  // 松开鼠标时取消 hold
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

// drag logic
const onDragStart = (event: any, group: any) => {
  const item = group.items?.[event.oldIndex];
  if (item) ui.setDragState(true, group.id, item);

  // ✅ 拖拽开始：开启边缘自动滚动 + 滚轮滚动
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

// delete modal state（如果右键删除已处理，可后续删掉）
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
              :class="{ 'bg-white/5 rounded-xl border border-dashed border-white/10 p-4': isEditMode }"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="gridStyle"
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
                :class="{ 'arrange-mode': isEditMode }"
                @pointerdown="onHoldStart"
            >
              <div class="site-wrap">
                <GlassCard
                    :item="item"
                    :isEditMode="isEditMode"
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
</style>