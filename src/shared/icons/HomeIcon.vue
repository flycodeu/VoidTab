<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore.ts';
import {markSiteIconMiss, resolveAndCacheSiteIcon} from '../utils/siteIconCache.ts';
import {resolvePhosphorIcon} from './phosphorIconMap';

const props = defineProps<{
  item: {
    id?: string;
    title?: string;
    url?: string;
    icon?: string;
    bgColor?: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    [key: string]: any;
  }
}>();

const store = useConfigStore();
const imgError = ref(false);
const imageLoaded = ref(false);
const iconSource = ref('');
const iconSourceIsObjectUrl = ref(false);
const resolveToken = ref(0);
const hasTriedForceRefresh = ref(false);
const sourceMode = ref<'auto' | 'none'>('none');
let imageFallbackTimer: ReturnType<typeof setTimeout> | null = null;
const normalizedType = computed<'auto' | 'text' | 'icon'>(() => {
  const type = props.item.iconType;
  if (type === 'text' || type === 'icon') return type;
  return 'auto';
});

const releaseIconObjectUrl = () => {
  if (iconSourceIsObjectUrl.value && iconSource.value.startsWith('blob:')) {
    URL.revokeObjectURL(iconSource.value);
  }
  iconSourceIsObjectUrl.value = false;
};

const setIconSource = (value: string, isObjectUrl = false) => {
  releaseIconObjectUrl();
  iconSource.value = value;
  iconSourceIsObjectUrl.value = isObjectUrl;
};

const clearImageFallbackTimer = () => {
  if (!imageFallbackTimer) return;
  clearTimeout(imageFallbackTimer);
  imageFallbackTimer = null;
};

const startImageFallbackTimer = () => {
  clearImageFallbackTimer();
  imageLoaded.value = false;
  if (normalizedType.value !== 'auto' || imgError.value || !iconSource.value) return;

  imageFallbackTimer = setTimeout(() => {
    if (!imageLoaded.value && normalizedType.value === 'auto' && iconSource.value && !imgError.value) {
      handleImgError();
    }
  }, 2200);
};

const loadAutoIcon = async (forceRefresh = false) => {
  const type = normalizedType.value;
  if (type !== 'auto') {
    setIconSource('', false);
    sourceMode.value = 'none';
    return;
  }

  if (!props.item.url) {
    sourceMode.value = 'none';
    setIconSource('', false);
    return;
  }

  const token = ++resolveToken.value;
  const result = await resolveAndCacheSiteIcon(props.item.url, store.config.runtime, {
    forceRefresh,
    fastFirst: true,
    fastTimeoutMs: 700,
  });
  if (token !== resolveToken.value) {
    if (result?.objectUrl && result.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
    return;
  }

  if (!result?.url) {
    sourceMode.value = 'none';
    setIconSource('', false);
    return;
  }

  sourceMode.value = 'auto';
  setIconSource(result.url, !!result.objectUrl);
};

watch(
    () => [props.item.url, props.item.iconType],
    () => {
      imgError.value = false;
      hasTriedForceRefresh.value = false;
      void loadAutoIcon(false);
    },
    {deep: true, immediate: true}
);

const displayMode = computed(() => {
  const type = normalizedType.value;
  if (type === 'text') return 'text';
  if (type === 'icon') return 'icon';

  if (!imgError.value && iconSource.value && imageLoaded.value) return 'image';
  return 'text';
});

const hasAutoImage = computed(() => normalizedType.value === 'auto' && !imgError.value && !!iconSource.value);

const phosphorComp = computed(() => {
  if (displayMode.value !== 'icon') return null;
  const rawName = props.item.iconValue || props.item.icon || 'Globe';
  return resolvePhosphorIcon(String(rawName), 'Globe');
});

const avatarBg = computed(() => {
  const color = props.item.bgColor || '#3b82f6';
  if (displayMode.value === 'text' && color === '#ffffff') return '#475569';
  return color;
});

const avatarText = computed(() => {
  if (normalizedType.value === 'text' && props.item.iconValue) {
    return props.item.iconValue.substring(0, 4);
  }

  const title = props.item.title || 'U';
  return /[\u4e00-\u9fa5]/.test(title) ? title.substring(0, 2) : title.substring(0, 2).toUpperCase();
});

const handleImgError = () => {
  clearImageFallbackTimer();
  if (normalizedType.value !== 'auto') {
    imgError.value = true;
    return;
  }

  if (sourceMode.value === 'auto' && props.item.url && !!iconSource.value) {
    markSiteIconMiss(props.item.url, store.config.runtime, {error: 'img_error', preserveExisting: true});
    if (!hasTriedForceRefresh.value) {
      hasTriedForceRefresh.value = true;
      void loadAutoIcon(true);
      return;
    }
  }

  imgError.value = true;
};

const handleImgLoad = () => {
  imageLoaded.value = true;
  clearImageFallbackTimer();
};

watch(
    () => [iconSource.value, imgError.value, normalizedType.value],
    startImageFallbackTimer,
    {immediate: true}
);

onUnmounted(() => {
  clearImageFallbackTimer();
  releaseIconObjectUrl();
});
</script>

<template>
  <div
      class="w-full h-full relative select-none group overflow-hidden rounded-2xl"
      :class="displayMode === 'image' ? 'bg-transparent shadow-none' : 'bg-white/10 shadow-inner'"
  >
    <img
        v-if="hasAutoImage"
        :src="iconSource"
        @load="handleImgLoad"
        @error="handleImgError"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        :alt="item.title"
    />

    <div
        v-if="displayMode === 'icon'"
        class="w-full h-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
        :style="{ backgroundColor: item.bgColor || '#3b82f6' }"
    >
      <component :is="phosphorComp" size="50%" weight="duotone" />
    </div>

    <div
        v-else-if="displayMode === 'text'"
        class="w-full h-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
        :style="{ backgroundColor: avatarBg }"
    >
      <span
          class="font-bold text-white drop-shadow-md select-none tracking-wider text-center leading-none px-1"
          :style="{ fontSize: avatarText.length > 2 ? '14px' : '22px' }"
      >
        {{ avatarText }}
      </span>
    </div>
  </div>
</template>
