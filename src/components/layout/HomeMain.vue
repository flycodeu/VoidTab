<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';

import TimeWidget from '../widgets/TimeWidget.vue';
import SearchBar from '../widgets/SearchBar.vue';
import MainGrid from './MainGrid.vue';
import GreetingWidget from '../widgets/GreetingWidget.vue';

const props = defineProps<{
  isFocusMode: boolean;
  activeGroupId: string;
  isEditMode: boolean;
  showGreeting: boolean;
  sidebarPos: 'left' | 'right';
}>();

const emit = defineEmits<{
  (e: 'openSettings'): void;
}>();

useConfigStore();

const mainPaddingClass = computed(() => {
  if (props.isFocusMode) return '';
  if (props.sidebarPos === 'left') return 'md:pl-28';
  return 'md:pr-28';
});
</script>

<template>
  <main
      data-main-scroll="1"
      :data-wheel-allow="isEditMode ? 'true' : null"
      class="flex-1 w-full h-full relative overflow-x-hidden transition-all duration-300"
      :class="[mainPaddingClass,'overflow-y-auto no-scrollbar']"
  >
    <!-- ✅ 顶部信息区：压缩高度（不再占半屏） -->
    <transition name="fade">
      <div
          :class="isFocusMode ? 'scale-110 translate-y-[16vh]' : ''"
          class="transition-all duration-500 w-full flex flex-col items-center pt-10 md:pt-12 pb-2 shrink-0"
      >
        <!-- TimeWidget 仍用你的组件，但外层空间减小 -->
        <TimeWidget class="scale-[0.78] md:scale-[0.82] origin-top"/>

      </div>
    </transition>

    <!-- ✅ 搜索框上移，减少 sticky padding -->
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

    <!-- ✅ 主区域：站点更靠上 -->
    <transition name="fade">
      <div v-if="!isFocusMode" class="w-full px-4 md:px-12 pt-4 pb-16 min-h-[420px]">
        <MainGrid :activeGroupId="activeGroupId" :isEditMode="isEditMode"/>
      </div>
    </transition>

    <!-- ✅ 金句/语句移动到底部，不占主空间 -->
    <div
        v-if="!isFocusMode && showGreeting"
        class="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none"
    >
      <div class="max-w-[820px] px-6 opacity-55">
        <div class="truncate text-center">
          <div class="origin-center scale-[0.72]">
            <GreetingWidget/>
          </div>
        </div>
      </div>
    </div>

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

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.no-scrollbar::-webkit-scrollbar {
  width: 0;
  height: 0;
}
</style>
