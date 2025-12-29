<script setup lang="ts">
import {computed} from 'vue';

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

// 侧栏变窄后主区域 padding 同步变小
const mainPaddingClass = computed(() => {
  if (props.isFocusMode) return '';
  if (props.sidebarPos === 'left') return 'md:pl-24';
  return 'md:pr-24';
});
</script>

<template>
  <main class="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden scroll-smooth custom-main-scroll"
      :class="mainPaddingClass"
  >
    <!-- 顶部：时间 + 问候 -->
    <div
        class="w-full flex flex-col items-center pt-16 md:pt-24 pb-6 shrink-0 transition-all duration-500"
        :class="isFocusMode ? 'scale-110 translate-y-[18vh] opacity-95' : ''"
    >
      <TimeWidget/>
      <div v-if="showGreeting && !isFocusMode" class="mt-4">
        <GreetingWidget/>
      </div>
    </div>

    <!-- 搜索：居中 -->
    <div
        class="w-full flex justify-center pb-8 transition-all duration-300 pointer-events-none"
        :class="isFocusMode ? 'translate-y-[18vh]' : ''"
    >
      <div class="pointer-events-auto w-full flex justify-center px-4">
        <SearchBar @openSettings="emit('openSettings')"/>
      </div>
    </div>

    <div v-if="!isFocusMode" class="w-full flex justify-center px-4 md:px-10 pb-16">
      <div class="w-full max-w-6xl">
        <MainGrid :activeGroupId="activeGroupId" :isEditMode="isEditMode"/>
      </div>
    </div>
  </main>
</template>

<style scoped>

:deep(.site-tile) {
  transition: transform 160ms ease, opacity 160ms ease;
  will-change: transform;
}

:deep(.site-tile:hover) {
  transform: translateY(-3px) scale(1.03);
}

:deep(.site-tile:active) {
  transform: translateY(-1px) scale(1.01);
}

/* “图标+文字”整体承托层（你可以放在 site-tile 内部的 .site-unit 上） */
:deep(.site-unit) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
}

:global(.dark) :deep(.site-unit) {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
}

:deep(.site-title) {
  max-width: 110px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
</style>
