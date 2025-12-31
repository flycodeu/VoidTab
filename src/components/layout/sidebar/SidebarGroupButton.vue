<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhSquaresFour} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../stores/useConfigStore';

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

// 是否启用自定义模式
const hasCustomColor = computed(() => !!props.group.iconColor || !!props.group.iconBgColor);

// 🎨 颜色处理：确保不管用户存了什么，我们都能拿到可用的颜色
const safeColor = computed(() => props.group.iconColor || 'var(--accent-color)');

// 🎨 背景色增强：强制加深背景，避免太淡看不见
const safeBgColor = computed(() => {
  if (props.group.iconBgColor) return props.group.iconBgColor;

  // 如果没有背景色，基于前景色生成一个 20% 浓度的背景
  const c = safeColor.value;
  if (c.startsWith('#')) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.25)`; // 25% 浓度
  }
  return 'rgba(128, 128, 128, 0.2)'; // 兜底
});

// ✅ 样式计算（最高优先级）
const buttonStyle = computed(() => {
  if (!hasCustomColor.value) return {};

  if (props.active) {
    return {
      backgroundColor: safeBgColor.value, // 强制背景色
      color: safeColor.value,
      borderColor: safeColor.value,
      boxShadow: `0 0 12px -2px ${safeBgColor.value}` // 发光
    };
  } else {
    // 未选中：仅文字颜色
    return {
      color: safeColor.value,
    };
  }
});

// ✅ 类名计算
const dynamicClasses = computed(() => {
  // 基础类
  const classes = [
    'group relative w-full py-3 px-1 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all duration-300 border border-transparent outline-none select-none'
  ];

  if (props.active) {
    if (props.breathingLight) classes.push('animate-pulse');

    // ⛔️ 关键修复：只有【非自定义模式】才加默认背景
    // 自定义模式下，背景完全由 buttonStyle 接管
    if (!hasCustomColor.value) {
      classes.push('bg-white/10 dark:bg-white/5 border-white/10 shadow-sm text-[var(--accent-color)]');
    }
  } else {
    // 未选中态
    classes.push('hover:bg-black/5 dark:hover:bg-white/10 opacity-80 hover:opacity-100 hover:scale-[1.05]');

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
        class="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[4px] rounded-r-full transition-colors shadow-sm"
        :style="{ backgroundColor: hasCustomColor ? safeColor : 'var(--accent-color)' }"
    ></div>

    <div class="relative">
      <component
          :is="IconComp"
          size="26"
          :weight="active ? 'fill' : 'duotone'"
          class="transition-transform duration-300"
          :class="[
             // 只有默认模式才用 CSS 阴影
             !hasCustomColor && active ? 'drop-shadow-[0_0_8px_rgba(var(--accent-color-rgb),0.6)]' : ''
          ]"
          :style="hasCustomColor && active ? { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' } : {}"
      />

      <transition name="scale">
        <div
            v-if="count > 0 && store.config.theme.showGroupCount"
            class="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full border border-white/20 shadow-md transition-transform duration-300 group-hover:scale-110"
            :class="hasCustomColor ? '' : 'bg-[#3b3b3b] dark:bg-[#2a2a2a]'"
            :style="hasCustomColor ? { backgroundColor: safeColor, color: '#fff' } : {}"
        >
          <span class="text-[10px] font-bold leading-none text-white">{{ count }}</span>
        </div>
      </transition>
    </div>

    <span
        class="text-[11px] font-bold tracking-wide truncate max-w-full px-1 transition-colors duration-200 mt-0.5"
        :class="active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'"
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