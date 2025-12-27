<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '../../../../stores/useConfigStore';

const store = useConfigStore();
const greetingWidget = computed(() => (store.config.widgets as any[])?.find((w: any) => w.id === 'greeting'));
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">侧边栏位置</label>
      <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
        <button
            @click="store.config.theme.sidebarPos = 'left'"
            class="px-3 py-1 rounded-md text-xs font-bold transition-all"
            :class="store.config.theme.sidebarPos === 'left' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'"
        >左侧</button>
        <button
            @click="store.config.theme.sidebarPos = 'right'"
            class="px-3 py-1 rounded-md text-xs font-bold transition-all"
            :class="store.config.theme.sidebarPos === 'right' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'"
        >右侧</button>
      </div>
    </div>

    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">时间组件</label>
      <input type="checkbox" v-model="store.config.theme.showTime" class="w-5 h-5 accent-[var(--accent-color)]"/>
    </div>

    <div v-if="greetingWidget" class="flex justify-between items-center">
      <label class="font-bold text-sm">问候语组件</label>
      <input type="checkbox" v-model="greetingWidget.visible" class="w-5 h-5 accent-[var(--accent-color)]"/>
    </div>

    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">最大宽度</label>
      <span class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span>
    </div>
    <input type="range" v-model.number="store.config.theme.gridMaxWidth" min="800" max="2000" class="w-full accent-[var(--accent-color)]"/>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
