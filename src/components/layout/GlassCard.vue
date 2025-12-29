<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import type {SiteItem} from '../../core/config/types';
import SiteIcon from './SiteIcon.vue';
import {useAutoIcon} from '../../composables/useAutoIcon';

const store = useConfigStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
}>();

// 注意：这里不再从卡片上提供 delete 按钮，但保留 emit 以免外部依赖（你也可以删掉）
const emit = defineEmits(['delete']);

// 当前是否 auto（兼容旧数据）
const isAuto = computed(() => props.item.iconType === 'auto' || !props.item.iconType);

// text 文字兜底
const displayText = computed(() => {
  if (props.item.iconType !== 'text') return '';
  if (props.item.iconValue && props.item.iconValue.length > 0) return props.item.iconValue;

  const clean = (props.item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
  return (clean.substring(0, 4).toUpperCase() || (props.item.title || 'A').substring(0, 2));
});

const dynamicFontSize = computed(() => {
  const baseSize = Number(store.config.theme.iconSize);
  const len = (displayText.value || '').length;
  if (len >= 4) return baseSize * 0.3;
  if (len === 3) return baseSize * 0.35;
  if (len === 2) return baseSize * 0.42;
  return baseSize * 0.5;
});

// auto favicon 逻辑
const {autoIconUrl, isLoaded, handleImgLoad, triggerFallback} = useAutoIcon({
  url: computed(() => props.item.url),
  isAuto,
  timeoutMs: 2500,
  onFallback: () => store.setIconFallback(props.item.id)
});

// 整理模式下不允许打开链接（只做拖拽/右键）
const handleClick = (e: MouseEvent) => {
  if (props.isEditMode) {
    e.preventDefault();
    e.stopPropagation();
  }
};
</script>

<template>
  <a
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="group relative flex flex-col items-center gap-2 p-1 rounded-xl transition-all duration-300"
      :class="[
      isEditMode
        ? 'cursor-grab active:cursor-grabbing'
        : 'hover:-translate-y-1 cursor-pointer'
    ]"
  >
    <SiteIcon
        :item="item"
        :size="Number(store.config.theme.iconSize)"
        :radius="Number(store.config.theme.radius)"
        :isAuto="isAuto"
        :autoIconUrl="autoIconUrl"
        :isLoaded="isLoaded"
        :text="displayText"
        :textFontSize="dynamicFontSize"
        @loaded="handleImgLoad"
        @fallback="triggerFallback"
    />

    <span
        v-if="store.config.theme.showIconName"
        class="font-medium opacity-80 group-hover:opacity-100 transition-opacity truncate text-center leading-tight"
        :style="{
        width: (Number(store.config.theme.iconSize) + 16) + 'px',
        fontSize: store.config.theme.iconTextSize + 'px',
        color: 'var(--text-primary)',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
      }"
    >
      {{ item.title }}
    </span>

  </a>
</template>

<style scoped>
/* 移除了 animate-shake / pop-in，减少资源消耗 */
</style>
