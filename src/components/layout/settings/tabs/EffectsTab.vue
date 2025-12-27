<script setup lang="ts">
import { useConfigStore } from '../../../../stores/useConfigStore';
import { PhTextT, PhLightning, PhFrameCorners, PhCursorClick } from '@phosphor-icons/vue';

const store = useConfigStore();
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-6">
      <div class="flex justify-between items-center">
        <label class="font-bold text-sm flex items-center gap-3">
          <PhTextT size="20" weight="duotone"/>科技感数字字体
        </label>
        <input type="checkbox" v-model="store.config.theme.techFont" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>

      <hr class="border-[var(--glass-border)] opacity-50"/>

      <div class="flex justify-between items-center">
        <label class="font-bold text-sm flex items-center gap-3">
          <PhLightning size="20" weight="duotone"/>侧边栏呼吸灯
        </label>
        <input type="checkbox" v-model="store.config.theme.breathingLight" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>

      <hr class="border-[var(--glass-border)] opacity-50"/>

      <div class="flex justify-between items-center">
        <label class="font-bold text-sm flex items-center gap-3">
          <PhFrameCorners size="20" weight="duotone"/>霓虹边框发光
        </label>
        <input type="checkbox" v-model="store.config.theme.neonGlow" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>

      <hr class="border-[var(--glass-border)] opacity-50"/>

      <div class="flex justify-between items-center">
        <label class="font-bold text-sm flex items-center gap-3">
          <PhCursorClick size="20" weight="duotone"/>科技感光标
        </label>
        <input type="checkbox" v-model="store.config.theme.customCursor" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
