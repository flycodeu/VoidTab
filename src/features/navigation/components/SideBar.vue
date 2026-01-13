<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {PhMonitor, PhPlus, PhGear} from '@phosphor-icons/vue';

import SidebarGroupButton from './sidebar/SidebarGroupButton.vue';
import {useSidebarDragHandlers} from '../composables/useSidebarDragHandlers.ts';

const ui = useUiStore();
const store = useConfigStore();

const props = defineProps<{ activeGroupId: string; isFocusMode: boolean }>();
const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
}>();

// 右键菜单
const handleGroupContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  e.stopPropagation();
  ui.openContextMenu(e, group, 'group', group.id);
};

// 拖拽逻辑
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

// 滚动定位
const listRef = ref<HTMLElement | null>(null);
watch(
    () => props.activeGroupId,
    async (id) => {
      await nextTick();
      const host = listRef.value;
      if (!host) return;
      const el = host.querySelector(`[data-group-id="${id}"]`) as HTMLElement | null;
      el?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    },
    {immediate: true}
);

// 贴边样式
const railClass = computed(() => {
  const isRight = store.config.theme.sidebarPos === 'right';
  return isRight ? 'right-0 rounded-l-[24px]' : 'left-0 rounded-r-[24px]';
});

const transitionName = computed(() => {
  return store.config.theme.sidebarPos === 'right' ? 'slide-fade-right' : 'slide-fade';
});

const onGroupSortEnd = () => {
  store.saveConfig();
};
</script>

<template>
  <div
      v-if="!isFocusMode"
      class="fixed inset-y-0 z-40 pointer-events-none flex flex-col justify-center py-4"
      :class="store.config.theme.sidebarPos === 'right' ? 'right-0' : 'left-0'"
  >
    <transition :name="transitionName">
      <aside
          class="hidden md:flex pointer-events-auto h-full w-[82px] flex-col items-center transition-all duration-300 overflow-hidden sidebar-rail"
          :class="railClass"
          :data-side="store.config.theme.sidebarPos"
      >
        <!-- 顶部 -->
        <div class="flex-shrink-0 pt-6 pb-4 w-full flex flex-col items-center border-b gap-2 sidebar-divider">
          <div
              class="w-10 h-10 rounded-xl flex items-center justify-center text-white ring-1 transition-transform hover:scale-110 sidebar-brand"
          >
            <PhMonitor weight="fill" size="20"/>
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

        <!-- 中部 -->
        <div class="flex-1 w-full flex flex-col overflow-hidden">
          <div class="px-0 py-3 text-center">
            <span class="text-[10px] font-bold uppercase tracking-widest opacity-60 sidebar-muted">分组</span>
          </div>

          <div ref="listRef" class="flex-1 w-full px-2 overflow-y-auto no-scrollbar pb-4 space-y-2">
            <VueDraggable
                v-model="store.config.layout"
                :animation="180"
                handle=".group-sort-handle"
                ghost-class="group-ghost"
                chosen-class="group-chosen"
                drag-class="group-drag"
                class="flex flex-col gap-2"
                :disabled="!!ui.dragState?.isDragging"
                @end="onGroupSortEnd"
            >
              <SidebarGroupButton
                  v-for="group in store.config.layout"
                  :key="group.id"
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
                  :onSelect="(id) => emit('update:activeGroupId', id)"
                  :onContextMenu="handleGroupContextMenu"
                  :onDragEnter="handleDragEnter"
                  :onDragLeave="handleDragLeave"
                  :onDrop="handleDrop"
              />
            </VueDraggable>

            <!-- 新建分组按钮（同样 Edge 风格：细边框 + 柔底） -->
            <button
                @click="emit('openGroupDialog')"
                class="w-full h-12 rounded-xl flex items-center justify-center transition-all group sidebar-add-btn"
                aria-label="Add group"
                title="新建分组"
            >
              <PhPlus size="18" weight="bold" class="group-hover:scale-110 transition-transform"/>
            </button>
          </div>
        </div>

        <!-- 底部 -->
        <div class="flex-shrink-0 w-full p-4 flex justify-center sidebar-footer">
          <button
              @click="emit('openSettings')"
              class="p-2.5 rounded-full transition-all active:scale-95 sidebar-icon-btn"
              aria-label="Settings"
              title="系统设置"
          >
            <PhGear :size="20" weight="fill"/>
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
/* ------------------------------ */
/* Drag 状态（保留你原来的）      */
/* ------------------------------ */
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

/* ------------------------------ */
/* Rail：固定不透明，不吃壁纸     */
/* 用你现有变量：settings-panel / border / shadow */
/* ------------------------------ */
.sidebar-rail {
  background: var(--settings-panel);
  border: 1px solid var(--settings-border-soft);
  box-shadow: var(--settings-shadow-soft);
  color: var(--settings-text);

  /* 关键：禁止 glass blur，避免文字发灰/壁纸混色 */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.sidebar-rail:hover {
  /* 很轻的 hover 提亮，避免“整块变色” */
  background: var(--settings-panel);
}

/* 贴边那侧不画边框（更像 Edge 贴边面板） */
.sidebar-rail[data-side='left'] {
  border-left: none;
}

.sidebar-rail[data-side='right'] {
  border-right: none;
}

.sidebar-divider {
  border-color: var(--settings-border-soft) !important;
}

.sidebar-muted {
  color: var(--text-tertiary) !important;
}

.sidebar-title {
  color: var(--text-primary);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* 顶部 logo：建议和 accent 联动，不再固定蓝紫渐变 */
.sidebar-brand {
  background: rgba(var(--accent-color-rgb), 0.18);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
  ring-color: rgba(var(--accent-color-rgb), 0.22);
  border: 1px solid rgba(var(--accent-color-rgb), 0.22);
}

/* 底部 footer：不透明 + 细分割线 */
.sidebar-footer {
  background: rgba(127, 127, 127, 0.04);
  border-top: 1px solid var(--settings-border-soft);
}

/* 设置按钮：中性底，hover 给一点 accent */
.sidebar-icon-btn {
  background: rgba(127, 127, 127, 0.10);
  border: 1px solid var(--settings-border-soft);
  color: var(--text-primary);
}

.sidebar-icon-btn:hover {
  background: rgba(var(--accent-color-rgb), 0.12);
  border-color: rgba(var(--accent-color-rgb), 0.25);
}

/* ------------------------------ */
/* ✅ Edge 风格：组按钮 hover/active */
/* 注意：SidebarGroupButton 是子组件，必须用 :deep  */
/* ------------------------------ */
:deep(.sidebar-group-btn) {
  /* 先把它原本的 glass/背景压掉，统一成“细边框”路线 */
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 16px !important;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

:deep(.sidebar-group-btn:hover) {
  /* Hover：细描边 + 极轻底色（不会整块染色） */
  border-color: rgba(var(--accent-color-rgb), 0.28) !important;
  background: rgba(var(--accent-color-rgb), 0.06) !important;
  transform: translateY(-1px);
}

:deep(.sidebar-group-btn.is-active) {
  /* Active：更明确一点点（Edge 的感觉：细边框 + 柔底） */
  border-color: rgba(var(--accent-color-rgb), 0.45) !important;
  background: rgba(var(--accent-color-rgb), 0.10) !important;
  box-shadow: 0 0 0 1px rgba(var(--accent-color-rgb), 0.08) inset;
}

:deep(.sidebar-group-btn:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

/* 新建分组按钮同一套视觉逻辑 */
.sidebar-add-btn {
  border: 1px dashed var(--settings-border-soft);
  color: var(--text-tertiary);
  background: transparent;
}

.sidebar-add-btn:hover {
  border-color: rgba(var(--accent-color-rgb), 0.28);
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.06);
}

/* ------------------------------ */
/* 动效（保留你原来的）           */
/* ------------------------------ */
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
