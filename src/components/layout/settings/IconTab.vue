<script setup lang="ts">
import {computed} from 'vue';
import * as PhIcons from '@phosphor-icons/vue'; // 导入所有图标
import {PhSquaresFour} from '@phosphor-icons/vue'; // 导入默认的图标

import {useConfigStore} from '../../../stores/useConfigStore.ts';

const store = useConfigStore();

// 动态计算图标大小、背景透明度、圆角等样式
const iconSize = computed(() => `${store.config.theme.iconSize}px`);
const borderRadius = computed(() => `${store.config.theme.radius}px`);
const gridGap = computed(() => `${store.config.theme.gap}px`);

// 动态计算图标的大小
const iconStyle = computed(() => ({
  fontSize: iconSize.value,
  borderRadius: borderRadius.value,
  margin: gridGap.value,
}));

// 获取图标显示的组件
const IconComp = computed(() => {
  const iconName = 'Ph' + String(store.config.theme.icon || 'Folder').replace(/^Ph/, '');
  return (PhIcons as any)[iconName] || PhSquaresFour; // 如果没有找到相应图标，使用默认图标 PhSquaresFour
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- 图标大小调整 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">图标大小</label>
      <span class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120"
           class="w-full accent-[var(--accent-color)]"/>

    <!-- 圆角程度调整 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">圆角程度</label>
      <span class="text-xs opacity-60">{{ store.config.theme.radius }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.radius" min="0" max="60"
           class="w-full accent-[var(--accent-color)]"/>

    <!-- 网格间距调整 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">网格间距</label>
      <span class="text-xs opacity-60">{{ store.config.theme.gap }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.gap" min="10" max="80"
           class="w-full accent-[var(--accent-color)]"/>

    <hr class="border-[var(--modal-border)] opacity-50"/>

    <!-- 显示名称 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">显示名称</label>
      <input type="checkbox" v-model="store.config.theme.showIconName" class="w-5 h-5 accent-[var(--accent-color)]"/>
    </div>

    <!-- 文字大小调整 -->
    <div v-if="store.config.theme.showIconName">
      <div class="flex justify-between items-center mb-2">
        <label class="font-bold text-sm">文字大小</label>
        <span class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span>
      </div>
      <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
             class="w-full accent-[var(--accent-color)]"/>
    </div>

    <!-- 实时效果展示 -->
    <div class="mt-6">
      <h3 class="font-bold text-lg">实时效果展示</h3>
      <div class="flex gap-4">
        <!-- 展示图标大小变化 -->
        <div :style="iconStyle" class="w-16 h-16 rounded-lg bg-blue-500 flex items-center justify-center text-white">
          <span v-if="store.config.theme.showIconName" :style="{ fontSize: store.config.theme.iconTextSize + 'px' }">
            文字
          </span>
          <IconComp v-else size="24"/>
        </div>

        <!-- 展示图标和文字 -->
        <div :style="iconStyle" class="w-16 h-16 rounded-lg bg-green-500 flex items-center justify-center text-white">
          <span v-if="store.config.theme.showIconName" :style="{ fontSize: store.config.theme.iconTextSize + 'px' }">
            图标
          </span>
          <PhGlobe v-else size="24"/>
        </div>

        <!-- 展示其他示例 -->
        <div :style="iconStyle" class="w-16 h-16 rounded-lg bg-red-500 flex items-center justify-center text-white">
          <span v-if="store.config.theme.showIconName" :style="{ fontSize: store.config.theme.iconTextSize + 'px' }">
            示例
          </span>
          <PhSquaresFour v-else size="24"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
