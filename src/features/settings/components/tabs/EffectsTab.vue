<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {PhTextT, PhLightning, PhFrameCorners} from '@phosphor-icons/vue';

const store = useConfigStore();

type FontOption = { label: string; value: any };

const fontOptions: FontOption[] = [
  {label: '默认（Inter）', value: 'default'},
  {label: 'JetBrains Mono', value: 'JetBrains Mono'},
  {label: 'Fira Code', value: 'Fira Code'},
  {label: 'Orbitron', value: 'Orbitron'},
  {label: 'Space Grotesk', value: 'Space Grotesk'},
  {label: 'Roboto Mono', value: 'Roboto Mono'},
  {label: 'IBM Plex Sans', value: 'IBM Plex Sans'},
  {label: 'Noto Sans SC', value: 'Noto Sans SC'}
];

// 字体是否启用：不选=default
const techEnabled = computed({
  get: () => store.config.theme.techFontFamily !== 'default',
  set: (v: boolean) => {
    if (!v) store.config.theme.techFontFamily = 'default';
    else if (store.config.theme.techFontFamily === 'default') store.config.theme.techFontFamily = 'JetBrains Mono';
  }
});

// 呼吸灯频率（秒）
const breathSeconds = computed({
  get: () => Number(store.config.theme.breathingDuration || 3),
  set: (v: number) => {
    const n = Math.min(10, Math.max(1, Number(v)));
    store.config.theme.breathingDuration = Number.isFinite(n) ? n : 3;
  }
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-6">

      <!-- 科技字体 -->
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm flex items-center gap-3">
            <PhTextT size="20" weight="duotone"/>
            科技感字体
          </label>
          <input
              type="checkbox"
              v-model="techEnabled"
              class="w-5 h-5 accent-[var(--accent-color)]"
          />
        </div>

        <select
            v-model="store.config.theme.techFontFamily"
            class="w-full h-10 rounded-xl px-3 text-sm font-bold outline-none border"
            :disabled="!techEnabled"
            style="background: var(--modal-input-bg); color: var(--modal-text); border-color: var(--modal-border);"
        >
          <option v-for="f in fontOptions" :key="f.value" :value="f.value">
            {{ f.label }}
          </option>
        </select>

        <p class="text-xs opacity-60 leading-relaxed">
          不选择则为默认 Inter。开启后通过 <code>.theme-tech-font</code> 全局应用（也可只在时钟组件里使用）。
        </p>
      </div>

      <hr class="border-[var(--glass-border)] opacity-50"/>

      <!-- 呼吸灯 -->
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm flex items-center gap-3">
            <PhLightning size="20" weight="duotone"/>
            侧边栏呼吸灯
          </label>
          <input
              type="checkbox"
              v-model="store.config.theme.breathingLight"
              class="w-5 h-5 accent-[var(--accent-color)]"
          />
        </div>

        <div class="flex items-center justify-between gap-4">
          <div class="text-xs opacity-70">频率（秒）</div>
          <div class="text-xs font-bold opacity-80 w-14 text-right">{{ breathSeconds.toFixed(1) }}s</div>
        </div>

        <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            v-model.number="breathSeconds"
            class="w-full accent-[var(--accent-color)]"
            :disabled="!store.config.theme.breathingLight"
        />

        <p class="text-xs opacity-60">
          通过 CSS 变量 <code>--sidebar-breath-duration</code> 控制动画时长。
        </p>
      </div>

      <hr class="border-[var(--glass-border)] opacity-50"/>

      <!-- 霓虹 -->
      <div class="flex justify-between items-center">
        <label class="font-bold text-sm flex items-center gap-3">
          <PhFrameCorners size="20" weight="duotone"/>
          霓虹边框发光
        </label>
        <input
            type="checkbox"
            v-model="store.config.theme.neonGlow"
            class="w-5 h-5 accent-[var(--accent-color)]"
        />
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
