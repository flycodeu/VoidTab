<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {PhPlus, PhGear} from '@phosphor-icons/vue';
import type {SidebarPosition} from '../../../core/config/types.ts';

import SidebarGroupButton from './sidebar/SidebarGroupButton.vue';
import {useSidebarDragHandlers} from '../composables/useSidebarDragHandlers.ts';
import BrandLogo from '../../../app/shell/BrandLogo.vue';

const ui = useUiStore();
const store = useConfigStore();

const props = defineProps<{ activeGroupId: string; isFocusMode: boolean }>();
const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
}>();

const handleGroupContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  e.stopPropagation();
  ui.openContextMenu(e, group, 'group', group.id);
};

const {handleDragEnter, handleDragLeave, handleDrop} = useSidebarDragHandlers({
  dragState: ui.dragState,
  getActiveGroupId: () => props.activeGroupId,
  setActiveGroupId: (id) => emit('update:activeGroupId', id),
  moveSite: (from, to, siteId) => store.moveSite(from, to, siteId),
  endDrag: () => ui.setDragState(false),
  hoverDelay: 600
});

const shouldShowDropHint = (groupId: string) => {
  return !!(ui.dragState?.isDragging && props.activeGroupId !== groupId);
};

const sidebarPos = computed<SidebarPosition>(() => {
  const value = store.config.theme.sidebarPos;
  return value === 'right' || value === 'top' || value === 'bottom' ? value : 'left';
});

const isHorizontal = computed(() => sidebarPos.value === 'top' || sidebarPos.value === 'bottom');
const sidebarOrientation = computed(() => isHorizontal.value ? 'horizontal' : 'vertical');
const shouldRenderSidebar = computed(() => !props.isFocusMode && store.config.theme.showSidebar !== false);

const listRef = ref<HTMLElement | null>(null);
let activeScrollRaf: number | null = null;

const clampScroll = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getActiveScrollBehavior = (): ScrollBehavior => {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
};

const findGroupButtonEl = (host: HTMLElement, id: string) => {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-group-id]'))
      .find((el) => el.dataset.groupId === id) || null;
};

const scrollActiveGroupIntoView = (id: string) => {
  if (activeScrollRaf != null) cancelAnimationFrame(activeScrollRaf);
  activeScrollRaf = requestAnimationFrame(() => {
    activeScrollRaf = null;

    const host = listRef.value;
    if (!host) return;

    const el = findGroupButtonEl(host, id);
    if (!el) return;

    const hostRect = host.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const behavior = getActiveScrollBehavior();

    if (isHorizontal.value) {
      const currentCenter = elRect.left - hostRect.left + host.scrollLeft + elRect.width / 2;
      const targetLeft = clampScroll(
          currentCenter - host.clientWidth / 2,
          0,
          Math.max(0, host.scrollWidth - host.clientWidth)
      );
      host.scrollTo({left: targetLeft, behavior});
      return;
    }

    const currentCenter = elRect.top - hostRect.top + host.scrollTop + elRect.height / 2;
    const targetTop = clampScroll(
        currentCenter - host.clientHeight / 2,
        0,
        Math.max(0, host.scrollHeight - host.clientHeight)
    );
    host.scrollTo({top: targetTop, behavior});
  });
};

watch(
    () => [props.activeGroupId, sidebarPos.value, store.config.layout.length],
    async ([id]) => {
      await nextTick();
      scrollActiveGroupIntoView(String(id || ''));
    },
    {immediate: true}
);

const containerClass = computed(() => {
  if (sidebarPos.value === 'top') {
    return 'fixed top-0 left-0 right-0 z-40 pointer-events-none flex justify-center px-4 pt-3';
  }
  if (sidebarPos.value === 'bottom') {
    return 'fixed bottom-0 left-0 right-0 z-40 pointer-events-none flex justify-center px-4 pb-4';
  }
  return `fixed inset-y-0 z-40 pointer-events-none flex flex-col justify-center py-4 ${sidebarPos.value === 'right' ? 'right-0' : 'left-0'}`;
});

const railClass = computed(() => {
  if (sidebarPos.value === 'top' || sidebarPos.value === 'bottom') return 'rounded-[22px]';
  return sidebarPos.value === 'right' ? 'right-0 rounded-l-[24px]' : 'left-0 rounded-r-[24px]';
});

const railLayoutClass = computed(() => {
  return isHorizontal.value
      ? 'hidden lg:flex pointer-events-auto h-[64px] flex-row items-center transition-all duration-300 overflow-hidden sidebar-rail sidebar-rail--horizontal'
      : 'hidden lg:flex pointer-events-auto h-full w-[82px] flex-col items-center transition-all duration-300 overflow-hidden sidebar-rail';
});

const brandBlockClass = computed(() => {
  return isHorizontal.value
      ? 'flex-shrink-0 h-full px-4 flex flex-row items-center border-r gap-2 sidebar-divider'
      : 'flex-shrink-0 pt-6 pb-4 w-full flex flex-col items-center border-b gap-2 sidebar-divider';
});

const listShellClass = computed(() => {
  return isHorizontal.value
      ? 'w-full min-w-0 h-full px-3 overflow-x-auto overflow-y-hidden no-scrollbar flex items-center justify-start scroll-smooth cursor-grab active:cursor-grabbing'
      : 'flex-1 w-full px-2 overflow-y-auto no-scrollbar pb-4 space-y-2';
});

const listShellStyle = computed(() => {
  return isHorizontal.value ? undefined : {
    maxHeight: 'calc(100vh - 280px)',
    minHeight: '200px',
  };
});

const draggableClass = computed(() => {
  return isHorizontal.value ? 'flex flex-row items-center gap-2 py-2 w-max min-w-max' : 'flex flex-col gap-2';
});

const addButtonClass = computed(() => {
  return isHorizontal.value
      ? 'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-all group sidebar-add-btn'
      : 'w-full h-12 rounded-xl flex items-center justify-center transition-all group sidebar-add-btn';
});

const footerClass = computed(() => {
  return isHorizontal.value
      ? 'flex-shrink-0 h-full px-4 flex items-center justify-center sidebar-footer sidebar-footer--horizontal'
      : 'flex-shrink-0 w-full p-4 flex justify-center sidebar-footer';
});

const transitionName = computed(() => {
  if (sidebarPos.value === 'right') return 'slide-fade-right';
  if (sidebarPos.value === 'top') return 'slide-fade-top';
  if (sidebarPos.value === 'bottom') return 'slide-fade-bottom';
  return 'slide-fade';
});

const breathSeconds = computed<number>(() => {
  const raw = Number((store.config.theme as any).breathingDuration ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(12, Math.max(1, raw));
});

const railStyle = computed(() => {
  const gridMaxWidth = Number(store.config.theme.gridMaxWidth || 1600);
  const horizontalMaxWidth = Math.max(720, Math.min(1160, gridMaxWidth + 80));
  return {
    '--sidebar-breath-duration': `${breathSeconds.value}s`,
    '--sidebar-horizontal-max-width': `${horizontalMaxWidth}px`,
  } as Record<string, string>;
});

const isGroupSorting = ref(false);
const HORIZONTAL_WHEEL_SPEED = 2.8;
const SORTING_WHEEL_SPEED = 1.8;
const MAX_WHEEL_STEP = 280;

const canScrollSidebarList = () => {
  const host = listRef.value;
  if (!host) return false;
  if (isHorizontal.value) return host.scrollWidth > host.clientWidth + 1;
  return host.scrollHeight > host.clientHeight + 1;
};

const normalizeWheelDelta = (e: WheelEvent, value: number) => {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 40;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return value * window.innerHeight;
  return value;
};

const clampWheelStep = (value: number, max = MAX_WHEEL_STEP) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-max, Math.min(max, value));
};

const getDominantWheelDelta = (e: WheelEvent) => {
  const dx = normalizeWheelDelta(e, e.deltaX);
  const dy = normalizeWheelDelta(e, e.deltaY);
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
};

const scrollSidebarByWheel = (e: WheelEvent) => {
  const host = listRef.value;
  if (!host || !isHorizontal.value || !canScrollSidebarList()) return false;

  const delta = clampWheelStep(getDominantWheelDelta(e) * HORIZONTAL_WHEEL_SPEED);
  if (!delta) return false;

  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  host.scrollLeft += delta;
  return true;
};

const onSidebarListWheel = (e: WheelEvent) => {
  scrollSidebarByWheel(e);
};

const onWheelWhileSorting = (e: WheelEvent) => {
  if (!isGroupSorting.value) return;
  const host = listRef.value;
  if (!host) return;
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  if (isHorizontal.value) {
    host.scrollLeft += clampWheelStep(getDominantWheelDelta(e) * SORTING_WHEEL_SPEED);
  } else {
    host.scrollTop += clampWheelStep(normalizeWheelDelta(e, e.deltaY) * SORTING_WHEEL_SPEED);
  }
};

const bindSortingWheel = () => {
  window.addEventListener('wheel', onWheelWhileSorting, {capture: true, passive: false});
};

const unbindSortingWheel = () => {
  window.removeEventListener('wheel', onWheelWhileSorting as any, true);
};

const onGroupSortStart = () => {
  isGroupSorting.value = true;
  ui.setGroupSorting(true);
  bindSortingWheel();
};

const onGroupSortEnd = () => {
  isGroupSorting.value = false;
  ui.setGroupSorting(false);
  unbindSortingWheel();
  store.saveConfig();
};

let pointerDrag:
    | { id: number; startX: number; startY: number; scrollLeft: number; moved: boolean }
    | null = null;
let suppressClickUntil = 0;

const onSidebarPointerDown = (e: PointerEvent) => {
  const host = listRef.value;
  if (!host || !isHorizontal.value || !canScrollSidebarList()) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  pointerDrag = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: host.scrollLeft,
    moved: false,
  };
  host.setPointerCapture?.(e.pointerId);
};

const onSidebarPointerMove = (e: PointerEvent) => {
  const host = listRef.value;
  if (!host || !pointerDrag || e.pointerId !== pointerDrag.id) return;

  const dx = e.clientX - pointerDrag.startX;
  const dy = e.clientY - pointerDrag.startY;
  if (Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy)) {
    pointerDrag.moved = true;
    if (e.cancelable) e.preventDefault();
    host.scrollLeft = pointerDrag.scrollLeft - dx;
  }
};

const onSidebarPointerEnd = (e: PointerEvent) => {
  const host = listRef.value;
  if (host && pointerDrag && e.pointerId === pointerDrag.id) {
    host.releasePointerCapture?.(e.pointerId);
    if (pointerDrag.moved) suppressClickUntil = performance.now() + 240;
  }
  pointerDrag = null;
};

const onSidebarClickCapture = (e: MouseEvent) => {
  if (performance.now() > suppressClickUntil) return;
  e.preventDefault();
  e.stopPropagation();
};

onBeforeUnmount(() => {
  if (activeScrollRaf != null) cancelAnimationFrame(activeScrollRaf);
  activeScrollRaf = null;
  ui.setGroupSorting(false);
  unbindSortingWheel();
  pointerDrag = null;
  suppressClickUntil = 0;
});
</script>

<template>
  <div
      v-if="shouldRenderSidebar"
      :class="containerClass"
  >
    <transition :name="transitionName">
      <aside
          :class="[
            railLayoutClass,
            railClass,
            { 'is-breathing': !!store.config.theme.breathingLight },
            { 'effect-neon': !!store.config.theme.neonGlow }
          ]"
          :data-side="sidebarPos"
          :style="railStyle"
          role="navigation"
          aria-label="分组导航"
      >
        <div v-if="!isHorizontal" :class="brandBlockClass">
          <div
              class="w-10 h-10 rounded-xl flex items-center justify-center ring-1 transition-transform hover:scale-110 sidebar-brand">
            <BrandLogo aria-hidden="true"/>
          </div>

          <transition name="fade">
            <span
                v-if="store.config.theme.showLogoText"
                class="text-[10px] font-bold tracking-widest uppercase truncate max-w-[90%] px-1 select-none sidebar-title"
            >
              {{ store.config.theme.customLogoText || 'VOID' }}
            </span>
          </transition>
        </div>

        <div :class="isHorizontal ? 'w-full h-full min-w-0 flex items-center overflow-visible' : 'flex-1 w-full flex flex-col overflow-hidden'">
          <div v-if="!isHorizontal" class="px-0 py-3 text-center">
            <span class="text-[10px] font-bold uppercase tracking-widest sidebar-muted">分组</span>
          </div>

          <div
              ref="listRef"
              data-wheel-allow="true"
              data-sidebar-list="1"
              :class="listShellClass"
              :style="listShellStyle"
              aria-label="分组列表"
              @wheel="onSidebarListWheel"
              @pointerdown="onSidebarPointerDown"
              @pointermove="onSidebarPointerMove"
              @pointerup="onSidebarPointerEnd"
              @pointercancel="onSidebarPointerEnd"
              @click.capture="onSidebarClickCapture"
          >
            <VueDraggable
                v-model="store.config.layout"
                :animation="180"
                handle=".group-sort-handle"
                ghost-class="group-ghost"
                chosen-class="group-chosen"
                drag-class="group-drag"
                :class="draggableClass"
                :disabled="!!ui.dragState?.isDragging"
                @start="onGroupSortStart"
                @end="onGroupSortEnd"
            >
              <SidebarGroupButton
                  v-for="group in store.config.layout"
                  :key="group.id"
                  :data-group-id="group.id"
                  :class="[
                  'group-sort-handle',
                  'sidebar-group-btn',
                  { 'is-active': props.activeGroupId === group.id }
                ]"
                  :group="group"
                  :active="props.activeGroupId === group.id"
                  :isDragging="!!ui.dragState?.isDragging"
                  :showDropHint="shouldShowDropHint(group.id)"
                  :breathingLight="!!store.config.theme.breathingLight"
                  :orientation="sidebarOrientation"
                  :onSelect="(id) => emit('update:activeGroupId', id)"
                  :onContextMenu="handleGroupContextMenu"
                  :onDragEnter="handleDragEnter"
                  :onDragLeave="handleDragLeave"
                  :onDrop="handleDrop"
              />
            </VueDraggable>

            <button
                type="button"
                @click="emit('openGroupDialog')"
                :class="addButtonClass"
                aria-label="新建分组"
                title="新建分组"
            >
              <PhPlus size="18" weight="bold" class="group-hover:scale-110 transition-transform" aria-hidden="true"/>
            </button>
          </div>
        </div>

        <div v-if="!isHorizontal" :class="footerClass">
          <button
              type="button"
              @click="emit('openSettings')"
              class="p-2.5 rounded-full transition-all active:scale-95 sidebar-icon-btn"
              aria-label="打开设置"
              title="系统设置"
          >
            <PhGear :size="20" weight="fill" aria-hidden="true"/>
          </button>
        </div>
      </aside>
    </transition>

    <transition name="slide-up">
      <slot name="mobile-nav"></slot>
    </transition>
  </div>
</template>

<style scoped>
.group-ghost {
  opacity: 0.3;
  transform: scale(0.95);
  filter: grayscale(1);
}

.group-chosen {
  opacity: 1;
  transform: scale(1.02);
}

.group-drag {
  cursor: grabbing;
}

.sidebar-rail {
  position: relative;
  isolation: isolate;

  background: rgba(var(--sidebar-surface-rgb), var(--sidebar-alpha));
  border: 1px solid var(--sidebar-border);
  box-shadow: var(--sidebar-shadow);
  color: var(--sidebar-text);

  backdrop-filter: blur(var(--sidebar-blur)) saturate(var(--sidebar-saturate, 120%));
  -webkit-backdrop-filter: blur(var(--sidebar-blur)) saturate(var(--sidebar-saturate, 120%));

  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.sidebar-rail--horizontal {
  width: min(var(--sidebar-horizontal-max-width, 960px), calc(100vw - 48px));
  min-width: 0;
  transform-origin: center;
}

@media (min-width: 1600px) {
  .sidebar-rail--horizontal {
    width: min(var(--sidebar-horizontal-max-width, 1680px), calc(100vw - 96px));
  }
}

.sidebar-rail.effect-neon {
  border-color: var(--accent-color) !important;

  box-shadow: 0 0 10px var(--accent-color),
  inset 0 0 5px rgba(255, 255, 255, 0.1) !important;

  z-index: 50;
}

.sidebar-rail.effect-neon[data-side='left'] {
  border-left: none !important;
}

.sidebar-rail.effect-neon[data-side='right'] {
  border-right: none !important;
}

.sidebar-rail.effect-neon[data-side='top'],
.sidebar-rail.effect-neon[data-side='bottom'] {
  border-color: var(--accent-color) !important;
}


.sidebar-rail:hover {
  background: rgba(var(--sidebar-surface-rgb), var(--sidebar-alpha));
}

.sidebar-rail[data-side='left'] {
  border-left: none;
}

.sidebar-rail[data-side='right'] {
  border-right: none;
}

.sidebar-divider {
  border-color: var(--sidebar-divider) !important;
}

.sidebar-muted {
  color: var(--sidebar-muted) !important;
}

.sidebar-title {
  color: var(--sidebar-text);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.10);
}

.sidebar-brand {
  color: var(--sidebar-text);
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.sidebar-brand:hover {
  background: rgba(255, 255, 255, 0.14);
}

html.light .sidebar-brand {
  background: rgba(0, 0, 0, 0.04);
}

html.light .sidebar-brand:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sidebar-footer {
  background: var(--sidebar-footer);
  border-top: 1px solid var(--sidebar-divider);
}

.sidebar-footer--horizontal {
  border-top: none;
  border-left: 1px solid var(--sidebar-divider);
  background: transparent;
}

.sidebar-icon-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.sidebar-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--sidebar-border);
  box-shadow: none;
}

html.light .sidebar-icon-btn {
  background: rgba(0, 0, 0, 0.04);
}

html.light .sidebar-icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sidebar-rail::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
}

.sidebar-rail.is-breathing[data-side='left'] {
  animation: rail-border-breath-left var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

.sidebar-rail.is-breathing[data-side='right'] {
  animation: rail-border-breath-right var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

.sidebar-rail.is-breathing[data-side='top'] {
  animation: rail-border-breath-top var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

.sidebar-rail.is-breathing[data-side='bottom'] {
  animation: rail-border-breath-bottom var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

.sidebar-rail.is-breathing::after {
  opacity: 1;
  animation: rail-innerline-breath var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

@keyframes rail-border-breath-left {
  0%, 100% {
    border-right-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-right-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

@keyframes rail-border-breath-right {
  0%, 100% {
    border-left-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-left-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

@keyframes rail-border-breath-top {
  0%, 100% {
    border-bottom-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-bottom-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

@keyframes rail-border-breath-bottom {
  0%, 100% {
    border-top-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-top-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

@keyframes rail-innerline-breath {
  0%, 100% {
    box-shadow: inset 0 0 0 1px rgba(var(--accent-color-rgb), 0.10),
    inset 0 0 10px rgba(var(--accent-color-rgb), 0.06);
  }
  50% {
    box-shadow: inset 0 0 0 1px rgba(var(--accent-color-rgb), 0.28),
    inset 0 0 14px rgba(var(--accent-color-rgb), 0.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-rail.is-breathing {
    animation: none !important;
  }

  .sidebar-rail.is-breathing::after {
    animation: none !important;
    opacity: 0.6;
  }
}

:deep(.sidebar-group-btn) {
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 16px !important;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

:deep(.sidebar-group-btn:hover) {
  background: rgba(255, 255, 255, 0.10) !important;
  border-color: transparent !important;
  transform: translateY(-1px);
}

.sidebar-rail--horizontal[data-side='top'] :deep(.sidebar-group-btn:hover) {
  transform: translateY(2px) scale(1.08) !important;
}

.sidebar-rail--horizontal[data-side='bottom'] :deep(.sidebar-group-btn:hover) {
  transform: translateY(-2px) scale(1.08) !important;
}

html.light :deep(.sidebar-group-btn:hover) {
  background: rgba(0, 0, 0, 0.04) !important;
}

:deep(.sidebar-group-btn.is-active) {
  position: relative !important;
  background: rgba(255, 255, 255, 0.22) !important;
  border-color: transparent !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14),
  0 0 0 1px rgba(0, 0, 0, 0.06) inset !important;
}

.sidebar-rail--horizontal[data-side='top'] :deep(.sidebar-group-btn.is-active) {
  transform: translateY(1px) scale(1.04) !important;
}

.sidebar-rail--horizontal[data-side='bottom'] :deep(.sidebar-group-btn.is-active) {
  transform: translateY(-1px) scale(1.04) !important;
}

.sidebar-rail--horizontal[data-side='top'] :deep(.sidebar-group-btn.is-active:hover) {
  transform: translateY(2px) scale(1.08) !important;
}

.sidebar-rail--horizontal[data-side='bottom'] :deep(.sidebar-group-btn.is-active:hover) {
  transform: translateY(-2px) scale(1.08) !important;
}

html.light :deep(.sidebar-group-btn.is-active) {
  background: rgba(0, 0, 0, 0.06) !important;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08),
  0 0 0 1px rgba(255, 255, 255, 0.55) inset !important;
}

:deep(.sidebar-group-btn.is-active)::before {
  content: none !important;
}

:deep(.sidebar-group-btn.is-active span),
:deep(.sidebar-group-btn.is-active .group-title) {
  opacity: 1 !important;
  font-weight: 800 !important;
}

:deep(.sidebar-group-btn:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.10);
}

html.light :deep(.sidebar-group-btn:focus-visible) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
}

.sidebar-add-btn {
  border: 1px dashed var(--sidebar-border);
  color: var(--sidebar-muted);
  background: transparent;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.sidebar-add-btn:hover {
  border-color: var(--sidebar-border);
  color: var(--sidebar-text);
  background: rgba(255, 255, 255, 0.08);
}

html.light .sidebar-add-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

.slide-fade-top-enter-active,
.slide-fade-top-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-top-enter-from,
.slide-fade-top-leave-to {
  transform: translateY(-18px);
  opacity: 0;
}

.slide-fade-bottom-enter-active,
.slide-fade-bottom-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-bottom-enter-from,
.slide-fade-bottom-leave-to {
  transform: translateY(18px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
