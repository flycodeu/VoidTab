<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhGlobe} from '@phosphor-icons/vue';
import type {SiteItem} from '../../core/config/types';

const props = defineProps<{
  item: SiteItem;
  size: number;
  radius: number;
  // auto 模式占位是否显示（由 composable 控制）
  isAuto: boolean;
  autoIconUrl: string;
  isLoaded: boolean;
  text: string;              // text 模式要显示的文字（外部传入，保证一致）
  textFontSize: number;      // text 模式字号
}>();

const emit = defineEmits<{
  (e: 'loaded'): void;
  (e: 'fallback'): void;
}>();

const bg = computed(() => {
  // 保留你原逻辑：白底 + text => 用灰底防止“白字白底”
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
    <!-- auto favicon -->
    <img
        v-if="isAuto && autoIconUrl"
        :src="autoIconUrl"
        class="w-full h-full object-cover bg-white"
        loading="lazy"
        @load="emit('loaded')"
        @error="emit('fallback')"
        alt="icon"
    />

    <!-- auto placeholder -->
    <PhGlobe
        v-if="isAuto && (!isLoaded || !autoIconUrl)"
        :size="size * 0.5"
        weight="duotone"
        class="absolute z-[-1]"
    />

    <!-- text -->
    <span
        v-else-if="item.iconType === 'text'"
        class="font-bold select-none leading-none flex items-center justify-center text-center break-all px-0.5"
        :style="{ fontSize: textFontSize + 'px' }"
    >
      {{ text }}
    </span>

    <!-- icon -->
    <component
        v-else
        :is="PhosphorIcon"
        :size="size * 0.5"
        weight="fill"
    />
  </div>
</template>
