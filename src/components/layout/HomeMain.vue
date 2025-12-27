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

const store = useConfigStore();

const mainPaddingClass = computed(() => {
  if (props.isFocusMode) return '';
  if (props.sidebarPos === 'left') return 'md:pl-28';
  return 'md:pr-28';
});
</script>

<template>
  <main
      class="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden scroll-smooth custom-main-scroll transition-all duration-300"
      :class="mainPaddingClass"
  >
    <transition name="fade">
      <div
          :class="isFocusMode ? 'scale-110 translate-y-[20vh]' : ''"
          class="transition-all duration-500 w-full flex flex-col items-center pt-16 md:pt-24 pb-4 shrink-0"
      >
        <TimeWidget/>
        <div v-if="showGreeting && !isFocusMode" class="mt-4 mb-2">
          <GreetingWidget/>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
          class="sticky top-0 z-20 w-full h-[120px] -mb-[120px] pointer-events-none soft-mist-layer"
          :class="isFocusMode ? 'translate-y-[20vh]' : ''"
      ></div>
    </transition>

    <transition name="fade">
      <div
          class="sticky top-0 z-30 w-full flex justify-center pt-6 pb-4 transition-all duration-300 pointer-events-none"
          :class="isFocusMode ? 'translate-y-[20vh]' : ''"
      >
        <div class="pointer-events-auto w-full flex justify-center px-4">
          <SearchBar @openSettings="emit('openSettings')"/>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="!isFocusMode" class="w-full px-4 md:px-12 pb-32 md:pb-20 pt-2 min-h-[500px]">
        <MainGrid :activeGroupId="activeGroupId" :isEditMode="isEditMode"/>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ✨✨✨ 单独定义的磨砂层样式 ✨✨✨ */
.soft-mist-layer {
  background-color: rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);

  -webkit-mask-image: -webkit-linear-gradient(top, black 20%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 20%, transparent 100%);
}

:global(.dark) .soft-mist-layer {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
