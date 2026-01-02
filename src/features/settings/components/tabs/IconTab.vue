<script setup lang="ts">
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import MiniHomePreview from './preview/MiniHomePreview.vue';
import {PhRows, PhSquaresFour, PhGridFour} from '@phosphor-icons/vue';

const store = useConfigStore();

// ✅ 密度切换逻辑：Compact 模式下自动隐藏文字，提升整洁度
const setDensity = (val: 'compact' | 'normal' | 'comfortable') => {
  store.config.theme.density = val;
  if (val === 'compact') {
    store.config.theme.showIconName = false;
  } else {
    store.config.theme.showIconName = true;
  }
};
</script>

<template>
  <div class="space-y-6 animate-fade-in pb-4">

    <div class="w-full">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm opacity-80">控制台预览</h3>
      </div>
      <MiniHomePreview
          :icon-size="store.config.theme.iconSize"
          :radius="store.config.theme.radius"
          :gap="store.config.theme.gap"
          :show-name="store.config.theme.showIconName"
          :text-size="store.config.theme.iconTextSize"
      />
    </div>

    <hr class="border-[var(--modal-border)] opacity-30"/>

    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <label class="font-bold text-sm">布局密度</label>
        <span class="text-xs opacity-60 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded capitalize font-mono">
          {{ store.config.theme.density || 'normal' }}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
        <button
            @click="setDensity('compact')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="store.config.theme.density === 'compact' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="仅图标，间距更小"
        >
          <PhGridFour size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">紧凑</span>
        </button>

        <button
            @click="setDensity('normal')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="(store.config.theme.density === 'normal' || !store.config.theme.density) ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="图标 + 标题"
        >
          <PhSquaresFour size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">默认</span>
        </button>

        <button
            @click="setDensity('comfortable')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="store.config.theme.density === 'comfortable' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="宽卡片布局"
        >
          <PhRows size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">舒适</span>
        </button>
      </div>
    </div>

    <div class="space-y-6">
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">图标尺寸</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{{
              store.config.theme.iconSize
            }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120" step="2"
               class="range-input w-full"/>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">圆角半径</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{{
              store.config.theme.radius
            }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.radius" min="0" max="60" class="range-input w-full"/>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">网格间距</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{{
              store.config.theme.gap
            }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.gap" min="10" max="80" class="range-input w-full"/>
      </div>

      <div class="bg-black/5 dark:bg-white/5 rounded-xl p-4 space-y-4 border border-black/5 dark:border-white/5">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm cursor-pointer select-none" for="showNameToggle">显示名称</label>
          <input id="showNameToggle" type="checkbox" v-model="store.config.theme.showIconName"
                 class="w-5 h-5 accent-[var(--accent-color)] cursor-pointer rounded"/>
        </div>

        <div v-if="store.config.theme.showIconName" class="space-y-2 animate-slide-down">
          <div class="flex justify-between items-center">
            <label class="text-xs opacity-70">文字大小</label>
            <span class="text-xs font-mono opacity-60">{{ store.config.theme.iconTextSize }}px</span>
          </div>
          <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
                 class="range-input w-full"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

.animate-slide-down {
  animation: slideDown 0.2s ease-out forwards;
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

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.range-input {
  -webkit-appearance: none;
  height: 6px;
  background: rgba(128, 128, 128, 0.2);
  border-radius: 5px;
  outline: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: var(--accent-color);
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s;
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}
</style>