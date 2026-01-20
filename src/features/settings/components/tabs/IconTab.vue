<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import MiniHomePreview from './preview/MiniHomePreview.vue';
import {PhRows, PhSquaresFour, PhGridFour, PhTextT, PhCube} from '@phosphor-icons/vue';

const store = useConfigStore();

/**
 *   密度切换：不再“强行覆盖用户的开关”
 * - compact：推荐关闭名称（但只在当前为开启时才关闭，避免用户反复调）
 * - normal/comfortable：推荐开启（如果用户之前关了，也不强制打开）
 *
 * 如果你希望“密度切换强制行为”，把 if 条件去掉即可。
 */
const setDensity = (val: 'compact' | 'normal' | 'comfortable') => {
  store.config.theme.density = val;

  if (val === 'compact') {
    // 推荐：紧凑模式下关闭名称
    if (store.config.theme.showIconName) store.config.theme.showIconName = false;
    if (store.config.theme.showWidgetName) store.config.theme.showWidgetName = false;
  }
};

const densityLabel = computed(() => store.config.theme.density || 'normal');

// 统一 label 高度逻辑（复用你主页上的算法）
const labelH = computed(() => {
  const show = store.config.theme.showIconName || store.config.theme.showWidgetName;
  if (!show) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});
</script>

<template>
  <div class="space-y-6 animate-fade-in pb-4">

    <!-- 预览 -->
    <div class="rounded-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-sm opacity-80">控制台预览</h3>
        <div class="text-xs opacity-60 font-mono bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded capitalize">
          {{ densityLabel }}
        </div>
      </div>

      <MiniHomePreview
          :icon-size="store.config.theme.iconSize"
          :radius="store.config.theme.radius"
          :gap="store.config.theme.gap"
          :show-name="store.config.theme.showIconName"
          :text-size="store.config.theme.iconTextSize"
      />

      <div class="mt-3 grid grid-cols-2 gap-2 text-[11px] opacity-70">
        <div class="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1">
          <span>图标名称</span>
          <span class="font-mono">{{ store.config.theme.showIconName ? 'ON' : 'OFF' }}</span>
        </div>
        <div class="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1">
          <span>组件名称</span>
          <span class="font-mono">{{ store.config.theme.showWidgetName ? 'ON' : 'OFF' }}</span>
        </div>
      </div>
    </div>

    <!-- 密度 -->
    <div class="rounded-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 space-y-3">
      <div class="flex justify-between items-center">
        <label class="font-bold text-sm">布局密度</label>
        <span class="text-xs opacity-60 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded capitalize font-mono">
          {{ densityLabel }}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
        <button
            @click="setDensity('compact')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="store.config.theme.density === 'compact'
            ? 'bg-white shadow-sm text-black'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="更紧凑"
        >
          <PhGridFour size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">紧凑</span>
        </button>

        <button
            @click="setDensity('normal')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="(store.config.theme.density === 'normal' || !store.config.theme.density)
            ? 'bg-white shadow-sm text-black'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="默认"
        >
          <PhSquaresFour size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">默认</span>
        </button>

        <button
            @click="setDensity('comfortable')"
            class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg transition-all border border-transparent active:scale-95"
            :class="store.config.theme.density === 'comfortable'
            ? 'bg-white shadow-sm text-black'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
            title="更舒适"
        >
          <PhRows size="22" weight="duotone"/>
          <span class="text-[11px] font-medium">舒适</span>
        </button>
      </div>

      <div class="text-[11px] opacity-60 leading-relaxed">
        提示：紧凑模式会<strong>建议</strong>隐藏名称以获得更高密度（不会强制覆盖你的选择）。
      </div>
    </div>

    <!-- 尺寸 -->
    <div class="rounded-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 space-y-5">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm">尺寸与间距</h3>
        <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded">
          labelH: {{ labelH }}px
        </span>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">图标尺寸</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            {{ store.config.theme.iconSize }}px
          </span>
        </div>
        <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120" step="2"
               class="range-input w-full"/>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">圆角半径</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            {{ store.config.theme.radius }}px
          </span>
        </div>
        <input type="range" v-model.number="store.config.theme.radius" min="0" max="60" class="range-input w-full"/>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">网格间距</label>
          <span class="text-xs font-mono opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            {{ store.config.theme.gap }}px
          </span>
        </div>
        <input type="range" v-model.number="store.config.theme.gap" min="6" max="60" class="range-input w-full"/>
      </div>
    </div>

    <!-- 名称控制 -->
    <div class="rounded-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm">名称显示</h3>
        <span class="text-xs opacity-60">分别控制图标与组件</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <!-- 图标名称 -->
        <label
            class="flex items-center justify-between gap-3 rounded-xl bg-black/5 dark:bg-white/5 px-3 py-3 cursor-pointer">
          <div class="flex items-center gap-2">
            <PhTextT :size="18" class="opacity-70"/>
            <div>
              <div class="text-sm font-semibold">图标名称</div>
              <div class="text-[11px] opacity-60">书签/站点标题</div>
            </div>
          </div>
          <input type="checkbox" v-model="store.config.theme.showIconName"
                 class="w-5 h-5 accent-[var(--accent-color)] cursor-pointer rounded"/>
        </label>

        <!-- 组件名称 -->
        <label
            class="flex items-center justify-between gap-3 rounded-xl bg-black/5 dark:bg-white/5 px-3 py-3 cursor-pointer">
          <div class="flex items-center gap-2">
            <PhCube :size="18" class="opacity-70"/>
            <div>
              <div class="text-sm font-semibold">组件名称</div>
              <div class="text-[11px] opacity-60">Widget 标题</div>
            </div>
          </div>
          <input type="checkbox" v-model="store.config.theme.showWidgetName"
                 class="w-5 h-5 accent-[var(--accent-color)] cursor-pointer rounded"/>
        </label>
      </div>

      <div v-if="store.config.theme.showIconName || store.config.theme.showWidgetName"
           class="space-y-2 animate-slide-down">
        <div class="flex justify-between items-center">
          <label class="text-xs opacity-70">文字大小</label>
          <span class="text-xs font-mono opacity-60">{{ store.config.theme.iconTextSize }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
               class="range-input w-full"/>
      </div>

      <div v-else class="text-[11px] opacity-60">
        已隐藏所有名称，布局会更紧凑。
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
