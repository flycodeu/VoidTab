<script setup lang="ts">
import { computed } from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import { PhSquaresFour } from '@phosphor-icons/vue';

const props = defineProps<{
  group: any;
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
</script>

<template>
  <button
      @click="onSelect(group.id)"
      @contextmenu="(e) => onContextMenu(e, group)"
      @dragenter.prevent="onDragEnter(group.id)"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent
      @drop="onDrop(group.id)"
      class="relative w-full h-[54px] rounded-2xl transition-all flex flex-col items-center justify-center gap-[3px] border"
      :class="[
      active
        ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)] border-transparent'
        : 'hover:bg-[var(--sidebar-active)] border-transparent opacity-70 hover:opacity-100',
      { 'effect-breathe': breathingLight && active },
      showDropHint ? '!opacity-100 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10' : ''
    ]"
      :data-group-id="group.id"
      :aria-current="active ? 'page' : undefined"
      :title="group.title"
  >
    <!-- icon + text 做成整体，文字增强清晰度 -->
    <div class="pointer-events-none flex flex-col items-center leading-none">
      <component
          :is="IconComp"
          size="22"
          weight="duotone"
          class="transition-transform duration-200"
          :class="active ? '' : 'group-hover:scale-110'"
      />
      <span
          class="mt-1 text-[11px] font-semibold tracking-wide truncate max-w-full px-1"
          style="text-shadow: 0 1px 2px rgba(0,0,0,0.25);"
      >
        {{ group.title }}
      </span>
    </div>

    <div
        v-if="active"
        class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"
    />
  </button>
</template>

<style scoped>
</style>
