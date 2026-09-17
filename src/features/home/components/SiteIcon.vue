<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import {PhGlobe} from '@phosphor-icons/vue';
import type {SiteItem, BookmarkDensity} from '../../../core/config/types.ts';
import {resolvePhosphorIcon} from '../../../shared/icons/phosphorIconMap';
import {warmBrowserIconUrl} from '../../../shared/utils/iconPreloader';
import {matchBrandPreset, getFallbackGradient} from '../../../shared/utils/brandIcons';

const props = defineProps<{
  item: SiteItem;
  size: number;
  radius: number;
  isAuto: boolean;
  autoIconUrl: string;
  hasError?: boolean;
  lowQuality?: boolean;
  text: string;
  textFontSize: number;
  density?: BookmarkDensity;
  priority?: 'high' | 'low';
}>();

const emit = defineEmits<{
  (e: 'loaded'): void;
  (e: 'fallback'): void;
}>();

const imageLoaded = ref(false);
let imageFallbackTimer: ReturnType<typeof setTimeout> | null = null;

const brandPreset = computed(() => {
  if (props.item.iconType && props.item.iconType !== 'auto') return null;
  return matchBrandPreset(props.item.url || '', props.item.title || '');
});

const clearImageFallbackTimer = () => {
  if (!imageFallbackTimer) return;
  clearTimeout(imageFallbackTimer);
  imageFallbackTimer = null;
};

const getImageFallbackDelayMs = (url: string) => {
  return url.includes('/api/favicon') ? 5200 : 1600;
};

const startImageFallbackTimer = () => {
  clearImageFallbackTimer();
  imageLoaded.value = false;
  if (!props.isAuto || props.hasError || !props.autoIconUrl) return;
  if (brandPreset.value?.svg) return; // If brand preset has high-def SVG, no need to fallback
  if (props.lowQuality) return;
  if (props.priority !== 'high') return;

  imageFallbackTimer = setTimeout(() => {
    if (!imageLoaded.value && props.isAuto && !props.hasError && props.autoIconUrl) {
      emit('fallback');
    }
  }, getImageFallbackDelayMs(props.autoIconUrl));
};

const hasBrandSvg = computed(() => !!brandPreset.value?.svg);

const bg = computed(() => {
  if (brandPreset.value?.bgColor) {
    return brandPreset.value.bgColor;
  }
  if (props.item.bgColor && props.item.bgColor !== '#ffffff') {
    return props.item.bgColor;
  }
  const usesFallbackSurface = props.item.iconType === 'text'
      || props.hasError
      || props.lowQuality
      || (props.isAuto && !imageLoaded.value && !hasBrandSvg.value);

  if (usesFallbackSurface) {
    return getFallbackGradient(props.text || props.item.title || props.item.url || 'Site');
  }
  return props.item.bgColor || '#3b82f6';
});

const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) {
    return resolvePhosphorIcon(props.item.iconValue, 'Globe');
  }
  if (brandPreset.value?.iconName) {
    return resolvePhosphorIcon(brandPreset.value.iconName, 'Globe');
  }
  return PhGlobe;
});

// 核心逻辑：根据文字长度和密度动态计算字号
const dynamicFontSize = computed(() => {
  let baseSize = props.textFontSize;

  if (props.density === 'compact') {
    baseSize *= 0.9;
  }

  const len = (props.text || '').length;
  const hasChinese = /[\u4e00-\u9fa5]/.test(props.text || '');

  if (hasChinese) {
    if (len <= 1) return baseSize * 1.0;
    if (len === 2) return baseSize * 0.88;
    if (len === 3) return baseSize * 0.68;
    if (len >= 4) return baseSize * 0.52;
  } else {
    if (len <= 2) return baseSize * 1.0;
    if (len === 3) return baseSize * 0.82;
    if (len === 4) return baseSize * 0.65;
    if (len >= 5) return baseSize * 0.52;
  }

  return baseSize * 0.5;
});

const shouldShowText = computed(() => {
  if (hasBrandSvg.value) return false;
  return props.item.iconType === 'text'
      || (props.isAuto && (props.hasError || props.lowQuality || !props.autoIconUrl || !imageLoaded.value));
});

const hasAutoImage = computed(() =>
    !hasBrandSvg.value && props.isAuto && !props.hasError && !props.lowQuality && !!props.autoIconUrl
);
const isImageMode = computed(() => hasAutoImage.value && imageLoaded.value);
const imageLoading = computed(() => props.priority === 'high' ? 'eager' : 'lazy');
const imageFetchPriority = computed(() => props.priority === 'high' ? 'high' : 'low');

const handleImageLoad = () => {
  imageLoaded.value = true;
  clearImageFallbackTimer();
  emit('loaded');
};

const handleImageError = () => {
  clearImageFallbackTimer();
  emit('fallback');
};

watch(
  () => props.autoIconUrl,
  (url) => {
    if (hasBrandSvg.value) return;
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
    if (props.lowQuality) return;
    if (props.priority !== 'high') return;
    void warmBrowserIconUrl(url, {linkRel: 'preload', timeoutMs: 1000});
  },
  {immediate: true}
);

watch(
  () => [props.autoIconUrl, props.hasError, props.isAuto, props.lowQuality],
  startImageFallbackTimer,
  {immediate: true}
);

onUnmounted(() => {
  clearImageFallbackTimer();
});
</script>

<template>
  <div
      class="site-icon-container flex items-center justify-center text-white overflow-hidden relative select-none transition-all duration-300"
      :style="{
      background: isImageMode ? 'transparent' : bg,
      width: size + 'px',
      height: size + 'px',
      borderRadius: radius + 'px'
    }"
  >
    <!-- 1. 品牌级官方高清 SVG -->
    <div
        v-if="hasBrandSvg && brandPreset"
        class="w-[58%] h-[58%] flex items-center justify-center pointer-events-none drop-shadow-sm"
        :style="{ color: brandPreset.color || '#ffffff' }"
        v-html="brandPreset.svg"
    />

    <!-- 2. 网络自动抓取的图片 -->
    <img
        v-else-if="hasAutoImage"
        :key="autoIconUrl"
        :src="autoIconUrl"
        class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
        :loading="imageLoading"
        decoding="async"
        :fetchpriority="imageFetchPriority"
        referrerpolicy="no-referrer"
        draggable="false"
        @load="handleImageLoad"
        @error="handleImageError"
        alt="icon"
    />

    <!-- 3. 文字降级 (采用优雅渐变与轻微立体投影) -->
    <span
        v-else-if="shouldShowText"
        class="relative z-10 font-bold select-none leading-none flex items-center justify-center text-center px-0.5 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        :style="{
          fontSize: dynamicFontSize + 'px',
          maxWidth: '96%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'clip',
        }"
    >
      {{ text }}
    </span>

    <!-- 4. 自定义 Phosphor 图标 -->
    <component
        v-else-if="item.iconType === 'icon'"
        :is="PhosphorIcon"
        :size="size * 0.52"
        weight="fill"
        class="drop-shadow-sm"
    />
  </div>
</template>

<style scoped>
.site-icon-container {
  box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.08),
      0 1px 2px rgba(0, 0, 0, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.group:hover .site-icon-container {
  box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.14),
      0 2px 4px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
</style>
