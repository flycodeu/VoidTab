<script setup lang="ts">
import {useConfigStore} from '../../stores/useConfigStore';
import {PhMonitor, PhPlus, PhGear} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import {computed} from 'vue';

const store = useConfigStore();
const props = defineProps<{ activeGroupId: string, isFocusMode: boolean }>();
const emit = defineEmits(['update:activeGroupId', 'openSettings', 'openGroupDialog']);

let hoverTimer: any = null;

// 样式逻辑
const sidebarStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    backgroundColor: isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(255, 255, 255, 0.65)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.4)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)'
  };
});

// 拖拽逻辑
const handleDragEnter = (groupId: string) => {
  if (store.dragState && store.dragState.isDragging && groupId !== props.activeGroupId) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      emit('update:activeGroupId', groupId);
      hoverTimer = null;
    }, 600);
  }
};
const handleDragLeave = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
};
const handleDrop = (targetGroupId: string) => {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (store.dragState && store.dragState.isDragging && store.dragState.item) {
    store.moveSite(store.dragState.fromGroupId, targetGroupId, store.dragState.item.id);
    emit('update:activeGroupId', targetGroupId);
    store.setDragState(false);
  }
};
</script>

<template>
  <div v-if="!isFocusMode"
       class="absolute top-0 h-full z-40 pointer-events-none flex flex-col justify-center"
       :class="store.config.theme.sidebarPos === 'right' ? 'right-0' : 'left-0'">

    <transition :name="store.config.theme.sidebarPos === 'right' ? 'slide-fade-right' : 'slide-fade'">
      <aside
          class="hidden md:flex pointer-events-auto w-[90px] h-[96%] rounded-[24px] flex-col items-center py-6 shadow-2xl transition-all duration-300"
          :class="store.config.theme.sidebarPos === 'right' ? 'mr-4' : 'ml-4'"
          :style="sidebarStyle"
      >
        <div
            class="mb-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
          <PhMonitor weight="fill" size="24"/>
        </div>

        <div class="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto no-scrollbar">
          <button
              v-for="group in store.config.layout"
              :key="group.id"
              @click="emit('update:activeGroupId', group.id)"

              @contextmenu.stop="(e) => store.openContextMenu(e, group, 'group')"

              @dragenter.prevent="handleDragEnter(group.id)"
              @dragleave.prevent="handleDragLeave"
              @dragover.prevent
              @drop="handleDrop(group.id)"
              class="sidebar-drop-zone relative w-full aspect-square rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group/btn border-2"
              :class="[
                activeGroupId === group.id
                  ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)] border-transparent'
                  : 'hover:bg-[var(--sidebar-active)] opacity-60 hover:opacity-100 border-transparent',
                { 'effect-breathe': store.config.theme.breathingLight && activeGroupId === group.id },
                (store.dragState && store.dragState.isDragging && activeGroupId !== group.id)
                  ? '!opacity-100 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                  : ''
              ]"
              :data-group-id="group.id"
          >
            <div class="pointer-events-none flex flex-col items-center gap-1">
              <component :is="(PhIcons as any)['Ph' + group.icon]" size="26" weight="duotone"
                         class="transition-transform group-hover/btn:scale-110"/>
              <span class="text-[10px] font-bold tracking-wide truncate max-w-full px-1">{{ group.title }}</span>
            </div>
            <div v-if="activeGroupId === group.id"
                 class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"></div>
          </button>

          <button @click="emit('openGroupDialog')"
                  class="w-full aspect-square rounded-2xl border-2 border-dashed border-current opacity-20 hover:opacity-60 flex items-center justify-center mt-2">
            <PhPlus size="24"/>
          </button>
        </div>

        <button @click="emit('openSettings')"
                class="mt-4 p-3 rounded-xl hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100 transition-all">
          <PhGear :size="26" weight="duotone"/>
        </button>
      </aside>
    </transition>

    <transition name="slide-up">
      <nav class="md:hidden ...">...</nav>
    </transition>
  </div>
</template>

<style scoped>
/* 保持你的 Slide 动画样式不变 */
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from, .slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.slide-fade-right-enter-active, .slide-fade-right-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-right-enter-from, .slide-fade-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}
</style>