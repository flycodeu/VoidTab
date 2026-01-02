<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhSquaresFour} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';

interface GroupProps {
  id: string;
  title: string;
  icon: string;
  items?: any[];
  iconColor?: string;
  iconBgColor?: string;
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

const store = useConfigStore();

const IconComp = computed(() => {
  const iconName = 'Ph' + String(props.group?.icon || '').replace(/^Ph/, '');
  return (PhIcons as any)[iconName] || PhSquaresFour;
});

const count = computed(() => props.group.items?.length || 0);

// 是否有自定义颜色
const hasCustomColor = computed(() => !!props.group.iconColor);

// 获取安全颜色
const safeColor = computed(() => props.group.iconColor || 'var(--accent-color)');

// ✅ 样式计算：仅改变文本颜色 (color)，不改变背景
const buttonStyle = computed(() => {
  if (!hasCustomColor.value) return {};
  return {
    color: safeColor.value,
  };
});

// ✅ 类名计算
const dynamicClasses = computed(() => {
  const classes = [
    'group relative w-full py-3 px-1 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all duration-300 border border-transparent outline-none select-none'
  ];

  if (props.active) {
    if (props.breathingLight) classes.push('animate-pulse');

    // ✅ 背景统一：始终使用半透明白/黑，保持界面整洁
    classes.push('bg-white/10 dark:bg-white/5 border-white/10 shadow-sm');

    // 如果没有自定义颜色，文字默认使用主题色
    if (!hasCustomColor.value) {
      classes.push('text-[var(--accent-color)]');
    }
  } else {
    // 未选中
    classes.push('hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100 hover:scale-[1.05]');
    if (!hasCustomColor.value) {
      classes.push('text-[var(--text-primary)]');
    }
  }

  if (props.showDropHint) {
    classes.push('!opacity-100 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10');
  }

  return classes;
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
      :title="`${group.title} (${count})`"
      :class="dynamicClasses"
      :style="buttonStyle"
  >
    <div
        v-if="active"
        class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full transition-colors shadow-sm"
        :style="{ backgroundColor: hasCustomColor ? safeColor : 'var(--accent-color)' }"
    ></div>

    <div class="relative">
      <component
          :is="IconComp"
          size="26"
          :weight="active ? 'fill' : 'duotone'"
          class="transition-transform duration-300"
          :class="[
             // 仅在默认模式下使用 CSS 阴影，自定义颜色模式下使用下方 filter
             (!hasCustomColor && active) ? 'drop-shadow-[0_0_5px_rgba(var(--accent-color-rgb),0.5)]' : ''
          ]"
          :style="hasCustomColor && active ? { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' } : {}"
      />

      <transition name="scale">
        <div
            v-if="count > 0 && store.config.theme.showGroupCount"
            class="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full border border-white/20 shadow-md transition-transform duration-300 group-hover:scale-110"
            :class="hasCustomColor ? '' : 'bg-[#3b3b3b] dark:bg-[#2a2a2a]'"
            :style="hasCustomColor ? { backgroundColor: safeColor, color: '#fff' } : {}"
        >
          <span class="text-[9px] font-bold leading-none text-white">{{ count }}</span>
        </div>
      </transition>
    </div>

    <span
        class="text-[10px] font-medium tracking-wide truncate max-w-full px-1 transition-colors duration-200 mt-0.5"
        :class="active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'"
    >
      {{ group.title }}
    </span>
  </button>
</template>

<style scoped>
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

.scale-enter-active, .scale-leave-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}

.scale-enter-from, .scale-leave-to {
  transform: scale(0);
  opacity: 0;
}
</style>