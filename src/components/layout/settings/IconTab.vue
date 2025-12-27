<script setup lang="ts">
import {useConfigStore} from '../../../stores/useConfigStore.ts';

const store = useConfigStore();
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">图标大小</label>
      <span class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120"
           class="w-full accent-[var(--accent-color)]"/>

    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">圆角程度</label>
      <span class="text-xs opacity-60">{{ store.config.theme.radius }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.radius" min="0" max="60"
           class="w-full accent-[var(--accent-color)]"/>

    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">网格间距</label>
      <span class="text-xs opacity-60">{{ store.config.theme.gap }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.gap" min="10" max="80"
           class="w-full accent-[var(--accent-color)]"/>

    <hr class="border-[var(--modal-border)] opacity-50"/>

    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">显示名称</label>
      <input type="checkbox" v-model="store.config.theme.showIconName" class="w-5 h-5 accent-[var(--accent-color)]"/>
    </div>

    <div v-if="store.config.theme.showIconName">
      <div class="flex justify-between items-center mb-2">
        <label class="font-bold text-sm">文字大小</label>
        <span class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span>
      </div>
      <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
             class="w-full accent-[var(--accent-color)]"/>
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
