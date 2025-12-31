<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhSquaresFour} from '@phosphor-icons/vue';

// 定义接口，确保 items 存在以便计数
interface GroupProps {
  id: string;
  title: string;
  icon: string;
  items?: any[];
}

const props = defineProps<{
  group: GroupProps;
  active: boolean;
  isDragging: boolean;
  showDropHint: boolean;
  breathingLight: boolean;

  onSelect: (groupId: string) => void;
  onContextMenu: (e: MouseEvent, group: any) => void;
  onDragEnter: (groupId: string) => void;
  onDragLeave: () => void;
  onDrop: (groupId: string) => void;
}>();

const IconComp = computed(() => {
  const iconName = 'Ph' + String(props.group?.icon || '').replace(/^Ph/, '');
  return (PhIcons as any)[iconName] || PhSquaresFour;
});

const count = computed(() => props.group.items?.length || 0);
</script>

<template>
  <button
      @click="onSelect(group.id)"
      @contextmenu="(e) => onContextMenu(e, group)"
      @dragenter.prevent="onDragEnter(group.id)"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent
      @drop="onDrop(group.id)"
      :title="`${group.title} (${count})`"
      class="group relative w-full py-3 px-1 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all duration-300 border border-transparent outline-none select-none"
      :class="[
        active
          ? 'bg-white/10 dark:bg-white/5 border-white/10 shadow-sm'
          : 'hover:bg-white/5 hover:border-white/5 opacity-60 hover:opacity-100 hover:scale-[1.02]',
        { 'animate-pulse': breathingLight && active },
        showDropHint ? '!opacity-100 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10' : ''
      ]"
  >
    <div
        v-if="active"
        class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] bg-[var(--accent-color)] rounded-r-full shadow-[0_0_8px_var(--accent-color)]"
    ></div>

    <div class="relative">
      <component
          :is="IconComp"
          size="24"
          :weight="active ? 'fill' : 'duotone'"
          class="transition-transform duration-300"
          :class="[
            active ? 'text-[var(--accent-color)] drop-shadow-[0_0_5px_rgba(var(--accent-color-rgb),0.5)]' : 'text-[var(--text-primary)] group-hover:text-white'
          ]"
      />

      <div
          v-if="count > 0"
          class="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full bg-[#3b3b3b] dark:bg-[#2a2a2a] border border-white/10 shadow-md transition-transform duration-300 group-hover:scale-110"
      >
        <span class="text-[9px] font-bold text-white/80 leading-none">{{ count }}</span>
      </div>
    </div>

    <span
        class="text-[10px] font-medium tracking-wide truncate max-w-full px-1 transition-colors duration-200"
        :class="active ? 'text-[var(--text-primary)] opacity-100' : 'text-[var(--text-primary)] opacity-80'"
    >
      {{ group.title }}
    </span>
  </button>
</template>

<style scoped>
/* 呼吸灯动画微调 */
@keyframes pulse-subtle {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--accent-color-rgb), 0);
  }
  50% {
    box-shadow: 0 0 10px 0 rgba(var(--accent-color-rgb), 0.2);
  }
}

.animate-pulse {
  animation: pulse-subtle 3s infinite ease-in-out;
}
</style>