<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';

import TimeWidget from '../../widgets/builtins/clock/TimeWidget.vue';
import SearchBar from '../../widgets/builtins/search/SearchBar.vue';
import MainGrid from './MainGrid.vue';

const props = defineProps<{
  isFocusMode: boolean;
  activeGroupId: string;
  isEditMode: boolean;
  sidebarPos: 'left' | 'right';
}>();

const emit = defineEmits<{
  (e: 'openSettings'): void;
}>();

const store = useConfigStore();
console.log(store)
const ui = useUiStore();

/**
 * 计算侧边栏占位间距
 */
const mainPaddingClass = computed(() => {
  if (props.isFocusMode) return '';
  if (props.sidebarPos === 'left') return 'md:pl-28';
  return 'md:pr-28';
});

/**
 * 核心逻辑：全局右键处理
 * 当点击到 main 容器或其内部空白区域时触发
 */
const handleGlobalContextMenu = (e: MouseEvent) => {
  // 阻止系统默认菜单
  e.preventDefault();

  // 只有在非 Focus 模式下才允许唤起空白菜单
  if (props.isFocusMode) return;

  // 触发 UI Store 中的 ContextMenu，类型为 'blank'
  // 传入当前的 activeGroupId，方便右键添加图标时知道加到哪个组
  ui.openContextMenu(e, null, 'blank', props.activeGroupId);
};
</script>

<template>
  <main
      data-main-scroll="1"
      :data-wheel-allow="isEditMode ? 'true' : null"
      class="flex-1 w-full h-full relative overflow-x-hidden transition-all duration-300 overflow-y-auto no-scrollbar"
      :class="[mainPaddingClass]"
      @contextmenu="handleGlobalContextMenu"
  >
    <transition name="fade">
      <div
          v-if="!isFocusMode"
          :class="isFocusMode ? 'scale-110 translate-y-[16vh]' : ''"
          class="transition-all duration-500 w-full flex flex-col items-center pt-10 md:pt-12 pb-2 shrink-0"
      >
        <TimeWidget class="scale-[0.78] md:scale-[0.82] origin-top"/>
      </div>
    </transition>

    <transition name="fade">
      <div
          class="sticky top-0 z-30 w-full flex justify-center pt-2 pb-2 transition-all duration-300 pointer-events-none"
          :class="isFocusMode ? 'translate-y-[16vh]' : ''"
      >
        <div class="pointer-events-auto w-full flex justify-center px-4">
          <SearchBar @openSettings="emit('openSettings')"/>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
          v-if="!isFocusMode"
          class="w-full px-4 md:px-12 pt-4 pb-16 min-h-[450px]"
          @contextmenu.stop="handleGlobalContextMenu"
      >
        <MainGrid :activeGroupId="activeGroupId" :isEditMode="isEditMode"/>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 隐藏滚动条，但保留滚动功能 */
.no-scrollbar {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.no-scrollbar::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
</style>