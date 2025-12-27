<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhSquaresFour} from '@phosphor-icons/vue';

const props = defineProps<{
  group: any;
  active: boolean;

  // 拖拽态：由父组件传入（逻辑集中在 composable）
  isDragging: boolean;
  showDropHint: boolean; // 非当前 active 的按钮，在拖拽时显示虚线提示
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
</script>

<template>
  <button
      @click="onSelect(group.id)"
      @contextmenu="(e) => onContextMenu(e, group)"

      @dragenter.prevent="onDragEnter(group.id)"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent
      @drop="onDrop(group.id)"

      class="sidebar-drop-zone relative w-full aspect-square rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group/btn border-2"
      :class="[
      active
        ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)] border-transparent'
        : 'hover:bg-[var(--sidebar-active)] opacity-60 hover:opacity-100 border-transparent',

      { 'effect-breathe': breathingLight && active },

      showDropHint
        ? '!opacity-100 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10'
        : ''
    ]"
      :data-group-id="group.id"
  >
    <div class="pointer-events-none flex flex-col items-center gap-1">
      <component
          :is="IconComp"
          size="26"
          weight="duotone"
          class="transition-transform group-hover/btn:scale-110"
      />
      <span class="text-[10px] font-bold tracking-wide truncate max-w-full px-1">
        {{ group.title }}
      </span>
    </div>

    <div
        v-if="active"
        class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"
    />
  </button>
</template>
