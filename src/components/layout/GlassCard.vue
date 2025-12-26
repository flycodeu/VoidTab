<script setup lang="ts">
import type {LinkItem} from '../../types';
import * as PhIcons from '@phosphor-icons/vue';
import {computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';

const props = defineProps<{ item: LinkItem }>();
const store = useConfigStore();

// 动态获取图标组件
const IconComponent = computed(() => {
  if (!props.item || props.item.iconType === 'text') return null;
  const raw = props.item.iconValue || (props.item as any).icon || 'Globe';
  // 移除可能存在的 'Ph' 前缀以防重复，然后重新拼接
  const iconName = String(raw).replace(/^Ph/, '');
  // @ts-ignore
  return PhIcons['Ph' + iconName] || PhIcons['PhGlobe'];
});

// 计算文字图标 (首字母)
const textIcon = computed(() => {
  if (!props.item) return '';
  if (props.item.iconType === 'text') {
    const val = props.item.iconValue || props.item.title || 'A';
    return String(val).substring(0, 1).toUpperCase();
  }
  return '';
});

// 背景色 & 打开链接
const bgColor = computed(() => props.item?.bgColor || '#3b82f6');
const openUrl = () => {
  if (!props.item?.url) return;
  window.open(props.item.url.startsWith('http') ? props.item.url : 'https://' + props.item.url, '_blank');
};

// 动态样式计算
const iconStyle = computed(() => ({
  width: `${store.config.theme.iconSize}px`,
  height: `${store.config.theme.iconSize}px`,
  borderRadius: `${store.config.theme.radius}px`,
  backgroundColor: bgColor.value,
}));
</script>

<template>
  <div
      class="group flex flex-col items-center gap-2 cursor-pointer select-none"
      @click="openUrl"
  >
    <div
        class="relative flex items-center justify-center
             shadow-[0_4px_12px_rgba(0,0,0,0.1)]
             border border-white/10
             transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
             group-hover:scale-110 group-hover:shadow-[0_12px_24px_rgba(0,0,0,0.15)]
             group-active:scale-95"
        :style="iconStyle"
    >
      <span
          v-if="item?.iconType === 'text'"
          class="text-white font-bold tracking-wider"
          :style="{ fontSize: (store.config.theme.iconSize * 0.45) + 'px' }"
      >
        {{ textIcon }}
      </span>

      <component
          v-else
          :is="IconComponent"
          :size="store.config.theme.iconSize * 0.5"
          weight="fill"
          class="text-white drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
      />

      <div class="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/10 pointer-events-none"
           :style="{ borderRadius: store.config.theme.radius + 'px' }">
      </div>
    </div>

    <span
        v-if="store.config.theme.showIconName"
        class="font-medium text-center leading-tight px-1 w-full truncate transition-opacity duration-200 group-hover:text-[var(--accent-color)]"
        :style="{
        width: (store.config.theme.iconSize + 24) + 'px',
        fontSize: store.config.theme.iconTextSize + 'px',
        color: 'var(--text-secondary)'
      }"
    >
      {{ item?.title || '未命名' }}
    </span>
  </div>
</template>