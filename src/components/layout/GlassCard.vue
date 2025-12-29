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

defineEmits(['delete']);

const isAuto = computed(() => props.item.iconType === 'auto' || !props.item.iconType);

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

const {autoIconUrl, isLoaded, handleImgLoad, triggerFallback} = useAutoIcon({
  url: computed(() => props.item.url),
  isAuto,
  timeoutMs: 2500,
  onFallback: () => store.setIconFallback(props.item.id)
});

const handleClick = (e: MouseEvent) => {
  // 整理模式不打开链接（用于拖拽/右键）
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
      class="group relative flex flex-col items-center gap-2 p-1 rounded-xl transition-all duration-200"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'hover:-translate-y-1 cursor-pointer']"
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
        class="font-medium opacity-90 group-hover:opacity-100 transition-opacity truncate text-center leading-tight"
        :style="{
        width: (Number(store.config.theme.iconSize) + 16) + 'px',
        fontSize: store.config.theme.iconTextSize + 'px',
        color: 'var(--text-primary)',
        textShadow: '0 1px 2px rgba(0,0,0,0.45)'
      }"
    >
      {{ item.title }}
    </span>

  </a>
</template>

<style scoped>
</style>
