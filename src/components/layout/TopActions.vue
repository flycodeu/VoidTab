<script setup lang="ts">
import {
  PhEye,
  PhEyeSlash,
  PhCards,
  PhArrowsLeftRight,
  PhPencilSimple,
  PhCheck
} from '@phosphor-icons/vue';

import {PhRobot} from '@phosphor-icons/vue';

const props = defineProps<{
  sidebarPos: 'left' | 'right';
  isFocusMode: boolean;
  isEditMode: boolean;
}>();
props;
const emit = defineEmits<{
  (e: 'toggleSidebarPos'): void;
  (e: 'toggleEdit'): void;
  (e: 'openWidgets'): void;
  (e: 'toggleFocus'): void;
  (e: 'toggleAi'): void;
}>();
</script>

<template>
  <div
      class="fixed top-6 z-50 flex items-center gap-3 transition-all duration-500"
      :class="sidebarPos === 'right' ? 'left-6' : 'right-6'"
  >
    <button
        @click="emit('toggleSidebarPos')"
        class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95 group"
        :title="sidebarPos === 'left' ? '切换到右侧布局' : '切换到左侧布局'"
    >
      <PhArrowsLeftRight
          size="20"
          weight="bold"
          class="group-hover:rotate-180 transition-transform duration-500"
      />
    </button>

    <button
        @click="emit('toggleAi')"
        class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95 group relative"
        title="AI 助手"
    >
      <PhRobot size="20" weight="bold"/>
    </button>
    <button
        @click="emit('toggleEdit')"
        class="p-3 rounded-full apple-glass transition-all shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center gap-1"
        :class="isEditMode ? 'bg-white text-black scale-110 ring-4 ring-black/10' : 'hover:bg-white/10 text-[var(--text-primary)]'"
        title="整理桌面"
    >
      <component :is="isEditMode ? PhCheck : PhPencilSimple" size="20" weight="bold"/>
    </button>

    <button
        @click="emit('openWidgets')"
        class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95"
        title="小组件控制台"
    >
      <PhCards size="20" weight="bold"/>
    </button>

    <button
        @click="emit('toggleFocus')"
        class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all shadow-lg hover:scale-110 active:scale-95"
        :class="isFocusMode ? 'text-[var(--accent-color)] bg-white/5' : 'text-[var(--text-primary)]'"
        title="专注模式"
    >
      <component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold"/>
    </button>
  </div>
</template>
