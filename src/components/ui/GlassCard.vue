<script setup lang="ts">
import type { LinkItem } from '../../types';
import * as PhIcons from '@phosphor-icons/vue';
import { computed } from 'vue';

const props = defineProps<{ item: LinkItem }>();

// === 核心修复：防崩溃计算属性 ===
const IconComponent = computed(() => {
  // 1. 第一道防线：如果没有 item 对象，直接返回 Null
  if (!props.item) return null;

  // 2. 如果是文字模式，不需要加载图标组件
  if (props.item.iconType === 'text') return null;

  // 3. 获取原始图标名：
  // 修复报错：使用 (props.item as any).icon 来访问旧数据的字段，避开 TS 检查
  const raw = props.item.iconValue || (props.item as any).icon || 'Globe';

  // 4. 第二道防线：强制转为字符串，防止对 undefined/null 调用 replace
  const safeStr = String(raw);

  // 5. 去除可能重复的前缀
  const iconName = safeStr.replace(/^Ph/, '');

  // 6. 返回组件，如果找不到图标，返回默认地球
  // @ts-ignore
  return PhIcons['Ph' + iconName] || PhIcons['PhGlobe'];
});

// 计算显示的文字
const textIcon = computed(() => {
  if (!props.item) return '';
  if (props.item.iconType === 'text') {
    // 同样做防空处理
    const val = props.item.iconValue || props.item.title || 'A';
    return String(val).substring(0, 1);
  }
  return '';
});

const bgColor = computed(() => {
  return props.item?.bgColor || '#3b82f6';
});

const openUrl = () => {
  if (!props.item?.url) return;
  let url = props.item.url;
  if (!url.startsWith('http') && !url.startsWith('#')) url = 'https://' + url;
  window.open(url, '_blank');
};
</script>

<template>
  <div
      class="flex flex-col items-center gap-3 group cursor-pointer w-24 sm:w-28 transition-transform hover:-translate-y-1"
      @click="openUrl"
  >
    <div
        class="relative flex items-center justify-center shadow-lg transition-all duration-300 group-hover:shadow-2xl group-hover:brightness-110"
        :style="{
        width: 'var(--icon-size)',
        height: 'var(--icon-size)',
        borderRadius: 'var(--glass-radius)',
        backgroundColor: bgColor
      }"
    >
      <span v-if="item?.iconType === 'text'" class="text-white font-bold text-3xl select-none">
        {{ textIcon }}
      </span>

      <component
          v-else
          :is="IconComponent"
          :size="32"
          weight="fill"
          class="text-white drop-shadow-md"
      />
    </div>

    <span
        class="text-sm font-medium text-center leading-tight px-1 w-full truncate"
        style="color: var(--text-primary); text-shadow: 0 1px 4px rgba(0,0,0,0.1);"
    >
      {{ item?.title || '未命名' }}
    </span>
  </div>
</template>