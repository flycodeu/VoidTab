<script setup lang="ts">
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {PhSun, PhMoon, PhMonitor, PhCheckCircle, PhUploadSimple} from '@phosphor-icons/vue';

const store = useConfigStore();

// 切换深浅主题
const toggleTheme = (mode: 'light' | 'dark' | 'system') => {
  store.config.theme.mode = mode;
};

// 处理壁纸上传
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
  <div class="space-y-6 animate-fade-in" style="color: var(--settings-text);">

    <div class="grid grid-cols-3 gap-4">
      <button
          @click="toggleTheme('light')"
          class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
          :class="store.config.theme.mode === 'light'
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]'
          : 'border-transparent opacity-70 hover:opacity-100'"
          style="background-color: var(--settings-panel);"
      >
        <PhSun weight="fill" size="32"/>
        <span class="font-bold text-sm">浅色模式</span>
        <div v-if="store.config.theme.mode === 'light'"
             class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
          <PhCheckCircle size="20" weight="fill"/>
        </div>
      </button>

      <button
          @click="toggleTheme('dark')"
          class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
          :class="store.config.theme.mode === 'dark'
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]'
          : 'border-transparent opacity-70 hover:opacity-100'"
          style="background-color: var(--settings-panel);"
      >
        <PhMoon weight="fill" size="32"/>
        <span class="font-bold text-sm">深色模式</span>
        <div v-if="store.config.theme.mode === 'dark'"
             class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
          <PhCheckCircle size="20" weight="fill"/>
        </div>
      </button>

      <button
          @click="toggleTheme('system')"
          class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
          :class="store.config.theme.mode === 'system'
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]'
          : 'border-transparent opacity-70 hover:opacity-100'"
          style="background-color: var(--settings-panel);"
      >
        <PhMonitor weight="fill" size="32"/>
        <span class="font-bold text-sm">跟随系统</span>
        <div v-if="store.config.theme.mode === 'system'"
             class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
          <PhCheckCircle size="20" weight="fill"/>
        </div>
      </button>
    </div>

    <div
        class="p-5 rounded-2xl border transition-colors space-y-5"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <h3 class="font-bold text-sm opacity-80 mb-1">侧边栏样式</h3>

      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">显示顶部标题</label>
          <input
              type="checkbox"
              v-model="store.config.theme.showLogoText"
              class="w-5 h-5 accent-[var(--accent-color)] cursor-pointer rounded"
          />
        </div>

        <div v-if="store.config.theme.showLogoText" class="animate-slide-down">
          <input
              type="text"
              v-model="store.config.theme.customLogoText"
              placeholder="请输入标题 (建议4个字以内)"
              class="w-full bg-transparent border-b-2 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
              style="border-color: var(--settings-border); color: var(--settings-text);"
              maxlength="8"
          />
        </div>
      </div>

      <hr class="border-[var(--settings-border)] opacity-50"/>

      <div class="flex justify-between items-center">
        <label class="font-bold text-sm">显示分组数量角标</label>
        <input
            type="checkbox"
            v-model="store.config.theme.showGroupCount"
            class="w-5 h-5 accent-[var(--accent-color)] cursor-pointer rounded"
        />
      </div>
    </div>

    <div
        class="p-5 rounded-2xl border transition-colors"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <h3 class="font-bold text-sm mb-3">壁纸设置</h3>
      <div class="flex gap-2">
        <input
            type="text"
            v-model="store.config.theme.wallpaper"
            placeholder="输入图片或视频(mp4) URL..."
            class="flex-1 bg-transparent border-b-2 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
            style="border-color: var(--settings-border); color: var(--settings-text);"
        />
        <label
            class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95">
          <PhUploadSimple class="mr-2" size="16" weight="bold"/>
          上传
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
        <input type="range" v-model.number="store.config.theme.blur" min="0" max="50"
               class="w-full accent-[var(--accent-color)] range-input"/>
      </div>

      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-bold text-sm">背景遮罩浓度</label>
          <span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span>
        </div>
        <input type="range" v-model.number="store.config.theme.opacity" min="0" max="1" step="0.05"
               class="w-full accent-[var(--accent-color)] range-input"/>
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
  background: var(--settings-border);
  border-radius: 999px;
  height: 6px;
}
</style>