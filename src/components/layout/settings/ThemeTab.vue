<script setup lang="ts">
import { useConfigStore } from '../../../stores/useConfigStore.ts';
import { PhSun, PhMoon, PhCheckCircle, PhUploadSimple } from '@phosphor-icons/vue';

const store = useConfigStore();

const toggleTheme = (mode: 'light' | 'dark') => {
  store.config.theme.mode = mode;
  document.documentElement.classList.toggle('light', mode === 'light');
};

const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) store.config.theme.wallpaper = e.target.result as string;
  };
  reader.readAsDataURL(file);
  (event.target as HTMLInputElement).value = '';
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="grid grid-cols-2 gap-4">
      <button
          @click="toggleTheme('light')"
          class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
          :class="store.config.theme.mode === 'light'
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]'
          : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'"
      >
        <PhSun weight="fill" size="32"/>
        <span class="font-bold text-sm">浅色模式</span>
        <div v-if="store.config.theme.mode === 'light'" class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
          <PhCheckCircle size="20" weight="fill"/>
        </div>
      </button>

      <button
          @click="toggleTheme('dark')"
          class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
          :class="store.config.theme.mode === 'dark'
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]'
          : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'"
      >
        <PhMoon weight="fill" size="32"/>
        <span class="font-bold text-sm">深色模式</span>
        <div v-if="store.config.theme.mode === 'dark'" class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
          <PhCheckCircle size="20" weight="fill"/>
        </div>
      </button>
    </div>

    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
      <h3 class="font-bold text-sm mb-3">壁纸设置</h3>
      <div class="flex gap-2">
        <input
            type="text"
            v-model="store.config.theme.wallpaper"
            placeholder="输入图片或视频(mp4) URL..."
            class="flex-1 bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
        />
        <label class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95">
          <PhUploadSimple class="mr-2" size="16" weight="bold"/>上传
          <input type="file" accept="image/*,video/mp4" class="hidden" @change="handleFileUpload"/>
        </label>
      </div>
    </div>

    <div class="space-y-6">
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-bold text-sm">磨砂模糊度</label>
          <span class="text-xs opacity-60">{{ store.config.theme.blur }}px</span>
        </div>
        <input type="range" v-model.number="store.config.theme.blur" min="0" max="50" class="w-full accent-[var(--accent-color)]"/>
      </div>

      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-bold text-sm">背景遮罩浓度</label>
          <span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span>
        </div>
        <input type="range" v-model.number="store.config.theme.opacity" min="0" max="1" step="0.05" class="w-full accent-[var(--accent-color)]"/>
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
