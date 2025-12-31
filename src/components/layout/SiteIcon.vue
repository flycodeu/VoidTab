<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhGlobe} from '@phosphor-icons/vue';
import type {SiteItem, BookmarkDensity} from '../../core/config/types';

const props = defineProps<{
  item: SiteItem;
  size: number;
  radius: number;
  isAuto: boolean;
  autoIconUrl: string;
  isLoaded: boolean;
  text: string;
  textFontSize: number;
  // ✅ 新增
  density?: BookmarkDensity;
}>();

const emit = defineEmits<{
  (e: 'loaded'): void;
  (e: 'fallback'): void;
}>();

const bg = computed(() => {
  if (props.item.iconType === 'text' && props.item.bgColor === '#ffffff') return '#475569';
  return props.item.bgColor || '#3b82f6';
});

const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) {
    const name = 'Ph' + props.item.iconValue.replace(/^Ph/, '');
    return (PhIcons as any)[name] || PhGlobe;
  }
  return PhGlobe;
});

// ✅ 根据 density 微调字体大小
const adjustedFontSize = computed(() => {
  if (props.density === 'compact' && props.item.iconType === 'text') {
    return props.textFontSize * 0.9; // 紧凑模式稍微缩小文字
  }
  return props.textFontSize;
});
</script>

<template>
  <div
      class="site-icon-container flex items-center justify-center text-white shadow-lg overflow-hidden relative transition-all duration-300"
      :style="{
      backgroundColor: bg,
      width: size + 'px',
      height: size + 'px',
      borderRadius: radius + 'px'
    }"
  >
    <img
        v-if="isAuto && autoIconUrl"
        :src="autoIconUrl"
        class="w-full h-full object-cover bg-white"
        loading="lazy"
        @load="emit('loaded')"
        @error="emit('fallback')"
        alt="icon"
    />

    <PhGlobe
        v-if="isAuto && (!isLoaded || !autoIconUrl)"
        :size="size * 0.5"
        weight="duotone"
        class="absolute z-[-1]"
    />

    <span
        v-else-if="item.iconType === 'text'"
        class="font-bold select-none leading-none flex items-center justify-center text-center break-all px-0.5"
        :style="{ fontSize: adjustedFontSize + 'px' }"
    >
      {{ text }}
    </span>

    <component
        v-else
        :is="PhosphorIcon"
        :size="size * 0.5"
        weight="fill"
    />
  </div>
</template>