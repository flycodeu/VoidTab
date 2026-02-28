<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';
import {useConfigStore} from '../../stores/useConfigStore.ts';
import {markSiteIconMiss, resolveAndCacheSiteIcon} from '../utils/siteIconCache.ts';

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
const iconSource = ref('');
const iconSourceIsObjectUrl = ref(false);
const resolveToken = ref(0);

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

const isDirectIcon = (value: string | undefined) => !!value && (value.includes('/') || value.startsWith('data:'));

const loadAutoIcon = async () => {
  const type = props.item.iconType || 'auto';
  if (type !== 'auto') {
    setIconSource('', false);
    return;
  }

  if (isDirectIcon(props.item.icon)) {
    setIconSource(String(props.item.icon), false);
    return;
  }

  if (!props.item.url) {
    setIconSource('', false);
    return;
  }

  const token = ++resolveToken.value;
  const result = await resolveAndCacheSiteIcon(props.item.url, store.config.runtime);
  if (token !== resolveToken.value) {
    if (result?.objectUrl && result.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
    return;
  }

  if (!result?.url) {
    setIconSource('', false);
    return;
  }

  setIconSource(result.url, !!result.objectUrl);
};

watch(
    () => [props.item.url, props.item.iconType, props.item.icon],
    () => {
      imgError.value = false;
      void loadAutoIcon();
    },
    {deep: true, immediate: true}
);

const displayMode = computed(() => {
  const type = props.item.iconType || 'auto';
  if (type === 'text') return 'text';
  if (type === 'icon') return 'icon';

  if (!imgError.value && iconSource.value) return 'image';
  return 'text';
});

const phosphorComp = computed(() => {
  if (displayMode.value !== 'icon') return null;
  const rawName = props.item.iconValue || props.item.icon || 'Globe';
  const name = 'Ph' + String(rawName).replace(/^Ph/, '');
  return (PhIcons as any)[name] || null;
});

const avatarBg = computed(() => props.item.bgColor || '#3b82f6');

const avatarText = computed(() => {
  if (props.item.iconType === 'text' && props.item.iconValue) {
    return props.item.iconValue.substring(0, 4);
  }

  const title = props.item.title || 'U';
  return /[\u4e00-\u9fa5]/.test(title) ? title.substring(0, 2) : title.substring(0, 2).toUpperCase();
});

const handleImgError = () => {
  if ((props.item.iconType || 'auto') === 'auto' && props.item.url && !!iconSource.value) {
    markSiteIconMiss(props.item.url, store.config.runtime, {error: 'img_error'});
  }
  imgError.value = true;
};

onUnmounted(() => {
  releaseIconObjectUrl();
});
</script>

<template>
  <div
      class="w-full h-full relative select-none group overflow-hidden rounded-2xl"
      :class="displayMode === 'image' ? 'bg-transparent shadow-none' : 'bg-white/10 shadow-inner'"
  >
    <img
        v-if="displayMode === 'image' && iconSource"
        :src="iconSource"
        @error="handleImgError"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        :alt="item.title"
    />

    <div
        v-else-if="displayMode === 'icon'"
        class="w-full h-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
        :style="{ backgroundColor: item.bgColor || '#3b82f6' }"
    >
      <component :is="phosphorComp" size="50%" weight="duotone" />
    </div>

    <div
        v-else
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
