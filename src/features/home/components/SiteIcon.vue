<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {PhGlobe} from '@phosphor-icons/vue';
import type {SiteItem, BookmarkDensity} from '../../../core/config/types.ts';

const props = defineProps<{
  item: SiteItem;
  size: number;
  radius: number;
  isAuto: boolean;
  autoIconUrl: string;
  hasError?: boolean;
  text: string;
  textFontSize: number;
  density?: BookmarkDensity;
}>();

const emit = defineEmits<{
  (e: 'loaded'): void;
  (e: 'fallback'): void;
}>();

const bg = computed(() => {
  if ((props.item.iconType === 'text' || props.hasError) && props.item.bgColor === '#ffffff') {
    return '#475569';
  }
  return props.item.bgColor || '#3b82f6';
});

const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) {
    const name = 'Ph' + props.item.iconValue.replace(/^Ph/, '');
    return (PhIcons as any)[name] || PhGlobe;
  }
  return PhGlobe;
});

//  核心逻辑：根据文字长度和密度动态计算字号
const dynamicFontSize = computed(() => {
  let baseSize = props.textFontSize;

  if (props.density === 'compact') {
    baseSize *= 0.9;
  }

  const len = props.text.length;

  // 检测是否包含中文（中文由于是方块字，4个字时需要更小的比例）
  const hasChinese = /[\u4e00-\u9fa5]/.test(props.text);

  if (hasChinese) {
    if (len <= 1) return baseSize * 1.0;
    if (len === 2) return baseSize * 0.85; // 2个字稍微小一点
    if (len === 3) return baseSize * 0.65; // 3个字显著缩小
    if (len >= 4) return baseSize * 0.50;  //  4个字：使用 50% 字号，确保一行能放下
  } else {
    // 纯英文/数字
    if (len <= 2) return baseSize * 1.0;
    if (len === 3) return baseSize * 0.8;
    if (len === 4) return baseSize * 0.6;
    if (len >= 5) return baseSize * 0.5;
  }

  return baseSize * 0.5;
});
const shouldShowText = computed(() => {
  return props.item.iconType === 'text' || (props.isAuto && (props.hasError || !props.autoIconUrl));
});

const isImageMode = computed(() => props.isAuto && !props.hasError && !!props.autoIconUrl);
</script>

<template>
  <div
      class="site-icon-container flex items-center justify-center text-white overflow-hidden relative transition-all duration-300"
      :style="{
      backgroundColor: isImageMode ? 'transparent' : bg,
      width: size + 'px',
      height: size + 'px',
      borderRadius: radius + 'px'
    }"
  >
    <img
        v-if="isAuto && !hasError && !!autoIconUrl"
        :key="autoIconUrl"
        :src="autoIconUrl"
        class="w-full h-full object-cover"
        loading="lazy"
        draggable="false"
        @load="emit('loaded')"
        @error="emit('fallback')"
        alt="icon"
    />

    <span
        v-if="shouldShowText"
        class="font-bold select-none leading-none flex items-center justify-center text-center px-0.5"
        :style="{
          fontSize: dynamicFontSize + 'px',
          maxWidth: '96%',           /* 稍微放宽一点宽度限制 */
          whiteSpace: 'nowrap',      /* 强制不换行 */
          overflow: 'hidden',
          textOverflow: 'clip',      /* 4个字时不需要省略号，直接显示 */
        }"
    >
      {{ text }}
    </span>

    <component
        v-else-if="item.iconType === 'icon'"
        :is="PhosphorIcon"
        :size="size * 0.5"
        weight="fill"
    />
  </div>
</template>
