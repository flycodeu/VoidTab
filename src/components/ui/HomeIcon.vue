<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import * as PhIcons from '@phosphor-icons/vue';

const props = defineProps<{
  item: {
    id?: string;
    title?: string;
    url?: string;
    icon?: string;
    bgColor?: string;
    iconType?: 'auto' | 'text' | 'icon'; // 必须尊重这个字段
    iconValue?: string; // 文字内容 或 图标名
    [key: string]: any;
  }
}>();

const imgError = ref(false);

// 监听 item 变化，重置错误状态
watch(() => props.item, () => {
  imgError.value = false;
}, {deep: true});

// 1. 计算最终显示模式 (Priority: text > icon > auto-image > auto-text)
const displayMode = computed(() => {
  const type = props.item.iconType || 'auto';

  // 强制模式
  if (type === 'text') return 'text';
  if (type === 'icon') return 'icon';

  // 自动模式：如果图片加载失败，降级为 text
  if (imgError.value) return 'text';
  // 自动模式：如果有有效图片 URL，显示图片
  if (iconSource.value) return 'image';

  return 'text';
});

// 2. 计算图片 URL (仅 auto 模式有效)
const iconSource = computed(() => {
  const {icon, url} = props.item;

  // A. 用户手动填写的图片 URL
  if (icon && (icon.includes('/') || icon.startsWith('data:'))) {
    return icon;
  }

  // B. 自动获取 (Google Favicon)
  if (url) {
    try {
      const domain = new URL(url).hostname;
      if (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(domain)) return null;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch {
      return null;
    }
  }
  return null;
});

// 3. Phosphor 图标组件
const phosphorComp = computed(() => {
  if (displayMode.value !== 'icon') return null;

  // 优先用 iconValue，兼容旧数据 icon
  const rawName = props.item.iconValue || props.item.icon || 'Globe';
  const name = 'Ph' + rawName.replace(/^Ph/, '');
  return (PhIcons as any)[name] || null;
});

// 4. 文字背景色
const avatarBg = computed(() => {
  if (props.item.bgColor) return props.item.bgColor;
  return '#3b82f6';
});

// 5. 文字内容
const avatarText = computed(() => {
  // 如果是 Text 模式，优先用 iconValue
  if (props.item.iconType === 'text' && props.item.iconValue) {
    return props.item.iconValue.substring(0, 4);
  }

  // 否则自动提取首字母
  const title = props.item.title || 'U';
  return /[\u4e00-\u9fa5]/.test(title)
      ? title.substring(0, 2)
      : title.substring(0, 2).toUpperCase();
});

const handleImgError = () => {
  imgError.value = true;
};
</script>

<template>
  <div class="w-full h-full relative select-none group overflow-hidden rounded-2xl bg-white/10 shadow-inner">

    <img
        v-if="displayMode === 'image' && iconSource"
        :src="iconSource"
        @error="handleImgError"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        loading="lazy"
        :alt="item.title"
    />

    <div
        v-else-if="displayMode === 'icon'"
        class="w-full h-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
        :style="{ backgroundColor: item.bgColor || '#3b82f6' }"
    >
      <component :is="phosphorComp" size="50%" weight="duotone"/>
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