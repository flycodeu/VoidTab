<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import MiniHomePreview from './preview/MiniHomePreview.vue';
import {PhRows, PhSquaresFour, PhGridFour, PhTextT, PhCube} from '@phosphor-icons/vue';
import {applyIconDensityPreset} from '../../../../core/theme/densityPresets';
import type {BookmarkDensity} from '../../../../core/config/types';

const store = useConfigStore();

const setDensity = (val: BookmarkDensity) => {
  applyIconDensityPreset(store.config.theme, val);
  void store.saveConfig();
};

const densityLabel = computed(() => store.config.theme.density || 'normal');

const labelH = computed(() => {
  const show = store.config.theme.showIconName || store.config.theme.showWidgetName;
  if (!show) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});

const previewKey = computed(() => {
  const t = store.config.theme;
  return [
    t.density,
    t.iconSize,
    t.radius,
    t.gap,
    t.iconTextSize,
    t.showIconName ? 1 : 0,
    // 如果你预览里也想区分 widget name，可保留
    t.showWidgetName ? 1 : 0,
  ].join('|');
});
</script>

<template>
  <div class="space-y-3 animate-fade-in pb-3">

    <!-- 预览（更小、更紧凑） -->
    <div class="panel">
      <div class="panel-h">
        <h3 class="panel-title">预览</h3>
        <div class="badge capitalize font-mono">{{ densityLabel }}</div>
      </div>

      <!-- 预览视窗：限制高度 + 裁切 -->
      <div class="preview-viewport">
        <!-- 缩放容器：把预览整体缩小 -->
        <div class="preview-scale">
          <MiniHomePreview
              :key="previewKey"
              :icon-size="store.config.theme.iconSize"
              :radius="store.config.theme.radius"
              :gap="store.config.theme.gap"
              :show-name="store.config.theme.showIconName"
              :text-size="store.config.theme.iconTextSize"
          />
        </div>
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] opacity-70">
        <div class="mini-kv">
          <span>图标名</span>
          <span class="font-mono">{{ store.config.theme.showIconName ? 'ON' : 'OFF' }}</span>
        </div>
        <div class="mini-kv">
          <span>组件名</span>
          <span class="font-mono">{{ store.config.theme.showWidgetName ? 'ON' : 'OFF' }}</span>
        </div>
      </div>
    </div>

    <!-- 密度（更扁平、更紧凑） -->
    <div class="panel space-y-2">
      <div class="panel-h">
        <label class="panel-title">布局密度</label>
        <span class="badge capitalize font-mono">{{ densityLabel }}</span>
      </div>

      <div class="grid grid-cols-3 gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
        <button
            @click="setDensity('compact')"
            class="seg"
            :class="store.config.theme.density === 'compact'
            ? 'seg-active'
            : 'seg-idle'"
            title="更紧凑"
        >
          <PhGridFour size="20" weight="duotone"/>
          <span class="text-[11px] font-medium">紧凑</span>
        </button>

        <button
            @click="setDensity('normal')"
            class="seg"
            :class="(store.config.theme.density === 'normal' || !store.config.theme.density)
            ? 'seg-active'
            : 'seg-idle'"
            title="默认"
        >
          <PhSquaresFour size="20" weight="duotone"/>
          <span class="text-[11px] font-medium">默认</span>
        </button>

        <button
            @click="setDensity('comfortable')"
            class="seg"
            :class="store.config.theme.density === 'comfortable'
            ? 'seg-active'
            : 'seg-idle'"
            title="更舒适"
        >
          <PhRows size="20" weight="duotone"/>
          <span class="text-[11px] font-medium">舒适</span>
        </button>
      </div>

      <div class="text-[11px] opacity-60 leading-relaxed">
        密度会同步调整图标尺寸、圆角、网格间距、文字大小和名称显示。
      </div>
    </div>

    <!-- 尺寸（收紧行高/间距） -->
    <div class="panel space-y-3">
      <div class="panel-h">
        <h3 class="panel-title">尺寸与间距</h3>
        <span class="badge font-mono opacity-70">labelH: {{ labelH }}px</span>
      </div>

      <div class="ctrl">
        <div class="ctrl-h">
          <label class="ctrl-title">图标尺寸</label>
          <span class="badge font-mono">{{ store.config.theme.iconSize }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.iconSize" min="44" max="96" step="2"
               class="range-input w-full"/>
      </div>

      <div class="ctrl">
        <div class="ctrl-h">
          <label class="ctrl-title">圆角半径</label>
          <span class="badge font-mono">{{ store.config.theme.radius }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.radius" min="0" max="60"
               class="range-input w-full"/>
      </div>

      <div class="ctrl">
        <div class="ctrl-h">
          <label class="ctrl-title">网格间距</label>
          <span class="badge font-mono">{{ store.config.theme.gap }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.gap" min="6" max="60"
               class="range-input w-full"/>
      </div>
    </div>

    <!-- 名称控制（紧凑卡片 + 更小开关） -->
    <div class="panel space-y-2">
      <div class="panel-h">
        <h3 class="panel-title">名称显示</h3>
        <span class="text-xs opacity-60">图标 / 组件</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <!-- 图标名称 -->
        <label class="toggle-card">
          <div class="flex items-center gap-2">
            <PhTextT :size="16" class="opacity-70"/>
            <div class="min-w-0">
              <div class="text-sm font-semibold leading-tight">图标名称</div>
              <div class="text-[11px] opacity-60 leading-tight">书签标题</div>
            </div>
          </div>
          <input
              type="checkbox"
              v-model="store.config.theme.showIconName"
              class="chk"
          />
        </label>

        <!-- 组件名称 -->
        <label class="toggle-card">
          <div class="flex items-center gap-2">
            <PhCube :size="16" class="opacity-70"/>
            <div class="min-w-0">
              <div class="text-sm font-semibold leading-tight">组件名称</div>
              <div class="text-[11px] opacity-60 leading-tight">Widget 标题</div>
            </div>
          </div>
          <input
              type="checkbox"
              v-model="store.config.theme.showWidgetName"
              class="chk"
          />
        </label>
      </div>

      <div v-if="store.config.theme.showIconName || store.config.theme.showWidgetName"
           class="space-y-2 animate-slide-down pt-1">
        <div class="flex justify-between items-center">
          <label class="text-xs opacity-70">文字大小</label>
          <span class="text-xs font-mono opacity-60">{{ store.config.theme.iconTextSize }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
               class="range-input w-full"/>
      </div>

      <div v-else class="text-[11px] opacity-60 pt-1">
        已隐藏所有名称，布局会更紧凑。
      </div>
    </div>

  </div>
</template>

<style scoped>
/* 统一 panel：更紧凑 */
.panel {
  border-radius: 16px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.04);
}

:global(.dark) .panel {
  border-color: rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.05);
}

.panel-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.panel-title {
  font-weight: 800;
  font-size: 13px;
  opacity: .86;
}

.badge {
  font-size: 11px;
  opacity: .70;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
}

:global(.dark) .badge {
  background: rgba(255, 255, 255, 0.08);
}

.mini-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.05);
}

:global(.dark) .mini-kv {
  background: rgba(255, 255, 255, 0.06);
}

/* segmented btn */
.seg {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 0;
  border-radius: 10px;
  transition: all .15s;
  border: 1px solid transparent;
  user-select: none;
}

.seg:active {
  transform: scale(0.98);
}

.seg-active {
  background: rgba(255, 255, 255, 0.92);
  color: #111;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

:global(.dark) .seg-active {
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
  box-shadow: none;
  border-color: rgba(255, 255, 255, 0.12);
}

.seg-idle {
  color: rgba(55, 65, 81, 0.8);
}

:global(.dark) .seg-idle {
  color: rgba(229, 231, 235, 0.75);
}

.seg-idle:hover {
  filter: brightness(1.05);
}

/* ctrl rows tighter */
.ctrl {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctrl-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ctrl-title {
  font-weight: 700;
  font-size: 13px;
}

/* toggle cards tighter */
.toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.05);
  cursor: pointer;
}

:global(.dark) .toggle-card {
  background: rgba(255, 255, 255, 0.06);
}

.chk {
  width: 18px;
  height: 18px;
  accent-color: var(--accent-color);
  cursor: pointer;
  border-radius: 6px;
}

/* animations */
.animate-fade-in {
  animation: fadeIn 0.22s ease-out forwards;
}

.animate-slide-down {
  animation: slideDown 0.18s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* range */
.range-input {
  -webkit-appearance: none;
  height: 6px;
  background: rgba(128, 128, 128, 0.22);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: transform 0.1s;
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.08);
}

/* 预览区域：固定高度，避免撑爆 */
.preview-viewport {
  height: 220px; /* 你想更小就 180/200 */
  overflow: hidden;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

:global(.dark) .preview-viewport {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.10);
}

/* 缩放整个预览 */
.preview-scale {
  transform: scale(0.72); /* 0.6~0.8 之间调 */
  transform-origin: top left;
  width: calc(100% / 0.72); /* 与 scale 保持一致 */
}

/* 想更紧凑：把预览下面的信息行也稍微压扁 */
.mini-kv {
  padding: 5px 8px; /* 原来 6px 也行，想更紧就 4px */
}

</style>
