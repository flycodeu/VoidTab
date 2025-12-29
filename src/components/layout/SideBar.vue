<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {useUiStore} from '../../stores/useUiStore';
import {PhMonitor, PhPlus, PhGear} from '@phosphor-icons/vue';

import SidebarGroupButton from './sidebar/SidebarGroupButton.vue';
import {useSidebarDragHandlers} from '../../composables/useSidebarDragHandlers';

const ui = useUiStore();
const store = useConfigStore();

const props = defineProps<{ activeGroupId: string; isFocusMode: boolean }>();
const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
}>();

/** 更轻量的玻璃（减少 blur 半径） */
const sidebarStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    backgroundColor: isDark ? 'rgba(18, 18, 18, 0.55)' : 'rgba(255, 255, 255, 0.55)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.10)' : '1px solid rgba(0, 0, 0, 0.08)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)'
  };
});

/** 右键菜单 */
const handleGroupContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  e.stopPropagation();
  ui.openContextMenu(e, group, 'group', group.id);
};

/** 拖拽：hover 切组 + drop 移动 */
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

/** active 变化时自动把按钮滚动到可视范围（配合“滚轮切组”） */
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

/** 侧栏贴边：根据 sidebarPos 决定左右与圆角 */
const railClass = computed(() => {
  const isRight = store.config.theme.sidebarPos === 'right';
  return isRight
      ? 'right-0 rounded-l-[26px] border-l'
      : 'left-0 rounded-r-[26px] border-r';
});

const transitionName = computed(() => {
  return store.config.theme.sidebarPos === 'right' ? 'slide-fade-right' : 'slide-fade';
});
</script>

<template>
  <div
      v-if="!isFocusMode"
      class="fixed inset-y-0 z-40 pointer-events-none flex flex-col justify-center"
      :class="store.config.theme.sidebarPos === 'right' ? 'right-0' : 'left-0'"
  >
    <transition :name="transitionName">
      <aside
          class="hidden md:flex pointer-events-auto h-[96%] w-[76px] flex-col items-center py-5 shadow-2xl transition-all duration-300"
          :class="railClass"
          :style="sidebarStyle"
      >
        <!-- 顶部 Logo -->
        <div
            class="mb-5 w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"
        >
          <PhMonitor weight="fill" size="22"/>
        </div>

        <!-- 分组列表 -->
        <div
            ref="listRef"
            class="flex-1 flex flex-col gap-2 w-full px-2 overflow-y-auto no-scrollbar"
        >
          <SidebarGroupButton
              v-for="group in store.config.layout"
              :key="group.id"
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

          <!-- 新建分组 -->
          <button
              @click="emit('openGroupDialog')"
              class="w-full h-[54px] rounded-2xl border border-dashed opacity-25 hover:opacity-70 flex items-center justify-center mt-1"
              style="border-color: color-mix(in srgb, currentColor 40%, transparent);"
              aria-label="Add group"
              title="Add group"
          >
            <PhPlus size="22"/>
          </button>
        </div>

        <!-- 设置 -->
        <button
            @click="emit('openSettings')"
            class="mt-3 p-3 rounded-2xl opacity-75 hover:opacity-100 transition-all hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Settings"
            title="Settings"
        >
          <PhGear :size="24" weight="duotone"/>
        </button>
      </aside>
    </transition>

    <transition name="slide-up">
      <nav class="md:hidden ...">...</nav>
    </transition>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.26s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-14px);
  opacity: 0;
}

.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: all 0.26s ease;
}

.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  transform: translateX(14px);
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
