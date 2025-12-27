<script setup lang="ts">
import {computed} from 'vue';
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

/** 玻璃样式（保留你的逻辑） */
const sidebarStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    backgroundColor: isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(255, 255, 255, 0.65)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.4)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)'
  };
});

/** 右键菜单 */
const handleGroupContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  e.stopPropagation();
  ui.openContextMenu(e, group, 'group', group.id);
};

/** 拖拽：hover 切组 + drop 移动（抽到 composable） */
const {handleDragEnter, handleDragLeave, handleDrop} = useSidebarDragHandlers({
  dragState: ui.dragState,
  getActiveGroupId: () => props.activeGroupId,
  setActiveGroupId: (id) => emit('update:activeGroupId', id),
  moveSite: (from, to, siteId) => store.moveSite(from, to, siteId),
  endDrag: () => ui.setDragState(false),
  hoverDelay: 600
});

/** 计算某个 group 是否显示 drop hint（你原逻辑：拖拽中且不是 active） */
const shouldShowDropHint = (groupId: string) => {
  return !!(ui.dragState?.isDragging && props.activeGroupId !== groupId);
};
</script>

<template>
  <div
      v-if="!isFocusMode"
      class="absolute top-0 h-full z-40 pointer-events-none flex flex-col justify-center"
      :class="store.config.theme.sidebarPos === 'right' ? 'right-0' : 'left-0'"
  >
    <transition :name="store.config.theme.sidebarPos === 'right' ? 'slide-fade-right' : 'slide-fade'">
      <aside
          class="hidden md:flex pointer-events-auto w-[90px] h-[96%] rounded-[24px] flex-col items-center py-6 shadow-2xl transition-all duration-300"
          :class="store.config.theme.sidebarPos === 'right' ? 'mr-4' : 'ml-4'"
          :style="sidebarStyle"
      >
        <!-- 顶部 Logo -->
        <div
            class="mb-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"
        >
          <PhMonitor weight="fill" size="24"/>
        </div>

        <!-- 分组列表 -->
        <div class="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto no-scrollbar">
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
              class="w-full aspect-square rounded-2xl border-2 border-dashed border-current opacity-20 hover:opacity-60 flex items-center justify-center mt-2"
          >
            <PhPlus size="24"/>
          </button>
        </div>

        <!-- 设置 -->
        <button
            @click="emit('openSettings')"
            class="mt-4 p-3 rounded-xl hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100 transition-all"
        >
          <PhGear :size="26" weight="duotone"/>
        </button>
      </aside>
    </transition>

    <!-- mobile nav 你原来用 ... 占位，我不动，避免你结构丢失 -->
    <transition name="slide-up">
      <nav class="md:hidden ...">...</nav>
    </transition>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  transform: translateX(20px);
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
