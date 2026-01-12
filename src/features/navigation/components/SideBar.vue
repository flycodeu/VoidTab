<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {PhMonitor, PhPlus, PhGear} from '@phosphor-icons/vue';
import { useSystemPrefersDark } from '../../../shared/composables/theme/systemColorScheme';

import SidebarGroupButton from './sidebar/SidebarGroupButton.vue';
import {useSidebarDragHandlers} from '../composables/useSidebarDragHandlers.ts';

const ui = useUiStore();
const store = useConfigStore();
const { prefersDark: systemPrefersDark } = useSystemPrefersDark();

const props = defineProps<{ activeGroupId: string; isFocusMode: boolean }>();
const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
}>();

// 玻璃拟态样式
const sidebarStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark'
      ? true
      : store.config.theme.mode === 'light'
          ? false
          : systemPrefersDark.value;
  return {
    backgroundColor: isDark ? 'rgba(20, 20, 23, 0.65)' : 'rgba(255, 255, 255, 0.65)',
    borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)'
  };
});

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
          class="hidden md:flex pointer-events-auto h-full w-[82px] flex-col items-center shadow-2xl transition-all duration-300 overflow-hidden"
          :class="railClass"
          :style="sidebarStyle"
      >
        <div class="flex-shrink-0 pt-6 pb-4 w-full flex flex-col items-center border-b border-white/5 gap-2">

          <div
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20 transition-transform hover:scale-110"
          >
            <PhMonitor weight="fill" size="20"/>
          </div>

          <transition name="fade">
            <span
                v-if="store.config.theme.showLogoText"
                class="text-[10px] font-bold tracking-widest uppercase truncate max-w-[90%] px-1 select-none"
                style="text-shadow: 0 1px 2px rgba(0,0,0,0.1); color: var(--text-primary);"
            >
              {{ store.config.theme.customLogoText || 'VOID' }}
            </span>
          </transition>

        </div>

        <div class="flex-1 w-full flex flex-col overflow-hidden">
          <div class="px-0 py-3 text-center">
            <span
                class="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest opacity-60">分组</span>
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
                  class="group-sort-handle"
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

            <button
                @click="emit('openGroupDialog')"
                class="w-full h-12 rounded-xl border border-dashed border-white/20 hover:border-[var(--accent-color)] text-[var(--text-tertiary)] hover:text-[var(--accent-color)] hover:bg-[var(--accent-color)]/5 flex items-center justify-center transition-all group"
                aria-label="Add group"
                title="新建分组"
            >
              <PhPlus size="18" weight="bold" class="group-hover:scale-110 transition-transform"/>
            </button>
          </div>
        </div>

        <div
            class="flex-shrink-0 w-full p-4 flex justify-center border-t border-white/5 bg-black/5 dark:bg-white/5 backdrop-blur-md">
          <button
              @click="emit('openSettings')"
              class="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[var(--text-primary)] transition-all active:scale-95 shadow-sm"
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

.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-enter-from, .slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.slide-fade-right-enter-active, .slide-fade-right-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-fade-right-enter-from, .slide-fade-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>