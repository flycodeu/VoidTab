<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useConfigStore } from '../../../../stores/useConfigStore.ts';
import {
  PhSun,
  PhMoon,
  PhUploadSimple,
  PhPalette
} from '@phosphor-icons/vue';

const store = useConfigStore();

/** -----------------------------
 * Edge 风格：主题模式（light/dark）
 * ----------------------------- */
type ThemeMode =  'light' | 'dark';

const systemMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
const systemIsDark = ref(!!systemMedia?.matches);

const onSystemChange = (e: MediaQueryListEvent) => {
  systemIsDark.value = e.matches;
};

onMounted(() => {
  systemMedia?.addEventListener?.('change', onSystemChange);
});

onBeforeUnmount(() => {
  systemMedia?.removeEventListener?.('change', onSystemChange);
});

const effectiveMode = computed<'light' | 'dark'>(() => {
  const mode = store.config.theme.mode as ThemeMode;
  return mode;
});

/** -----------------------------
 * Edge 风格：主题色（圆点 + 自定义）
 * ----------------------------- */
const presetAccents = [
  '#007AFF', '#A3A3A3', '#5AA7FF', '#35C2C1', '#4ECDC4',
  '#7AA7FF', '#E5B1A8', '#FF5CA8', '#D7B84C', '#F59E0B',
  '#111827', '#475569', '#0B3B8F', '#5B21B6', '#B91C1C', '#166534'
];

const hexToRgb = (hex: string) => {
  const v = hex.replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r}, ${g}, ${b}`;
};

const setRootClass = (mode: 'light' | 'dark') => {
  const el = document.documentElement;
  el.classList.toggle('dark', mode === 'dark');
  el.classList.toggle('light', mode === 'light');
};

const applyCssVars = () => {
  const el = document.documentElement;

  // accent
  const accent = store.config.theme.accent || '#007AFF';
  el.style.setProperty('--accent-color', accent);
  el.style.setProperty('--accent-color-rgb', hexToRgb(accent));

  // blur / overlay
  // 你 CSS 里用的是 --glass-blur / --overlay-alpha
  el.style.setProperty('--glass-blur', `${store.config.theme.blur ?? 40}px`);
  el.style.setProperty('--overlay-alpha', `${store.config.theme.opacity ?? 0.55}`);

  // wallpaper（图片：用 CSS background-image）
  // 视频壁纸建议用一个 <video class="fixed inset-0 ..."> 单独渲染（这里先不展开）
  const wp = (store.config.theme.wallpaper || '').trim();
  if (wp) {
    // 用一个变量覆盖默认壁纸
    el.style.setProperty('--user-wallpaper', `url("${wp}")`);
  } else {
    el.style.removeProperty('--user-wallpaper');
  }
};

const applyTheme = () => {
  setRootClass(effectiveMode.value);
  applyCssVars();
};

// 初始化时应用一次
onMounted(() => {
  // 如果你 store 里没初始化 mode/accent，这里兜底一下
  if (!store.config.theme.mode) store.config.theme.mode = 'system' as any;
  if (!store.config.theme.accent) store.config.theme.accent = '#007AFF' as any;
  applyTheme();
});

/** 当配置变化时，自动同步到 DOM */
watch(
    () => [
      store.config.theme.mode,
      store.config.theme.accent,
      store.config.theme.blur,
      store.config.theme.opacity,
      store.config.theme.wallpaper,
      effectiveMode.value
    ],
    applyTheme,
    { deep: false }
);

/** UI handlers */
const setMode = (mode: ThemeMode) => {
  store.config.theme.mode = mode as any;
};

const setAccent = (hex: string) => {
  store.config.theme.accent = hex as any;
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
  <div class="space-y-6 animate-fade-in" style="color: var(--settings-text);">

    <!--Edge 风格：浅色/深色 2段 -->
    <div
        class="inline-flex w-full p-1 rounded-2xl border"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >

      <button
          class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
          :class="store.config.theme.mode === 'light'
          ? 'bg-[rgba(var(--accent-color-rgb),0.14)] text-[var(--accent-color)]'
          : 'opacity-75 hover:opacity-100'"
          @click="setMode('light')"
      >
        <PhSun weight="fill" size="18" />
        浅色
      </button>

      <button
          class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
          :class="store.config.theme.mode === 'dark'
          ? 'bg-[rgba(var(--accent-color-rgb),0.14)] text-[var(--accent-color)]'
          : 'opacity-75 hover:opacity-100'"
          @click="setMode('dark')"
      >
        <PhMoon weight="fill" size="18" />
        深色
      </button>
    </div>

    <!-- ✅ Edge 风格：主题色（圆点 + 取色器） -->
    <div
        class="p-5 rounded-2xl border space-y-4"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm opacity-80">颜色主题</h3>

        <!-- 可选：还原默认 -->
        <button
            class="text-xs font-bold opacity-70 hover:opacity-100 transition"
            @click="store.config.theme.accent = '#007AFF'; store.config.theme.mode = 'system'"
        >
          还原默认
        </button>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <button
            v-for="hex in presetAccents"
            :key="hex"
            class="w-7 h-7 rounded-full border transition-transform hover:scale-105 active:scale-95"
            :style="{
            backgroundColor: hex,
            borderColor: (store.config.theme.accent === hex)
              ? 'rgba(var(--accent-color-rgb),0.9)'
              : 'rgba(0,0,0,0.08)'
          }"
            :class="store.config.theme.accent === hex ? 'ring-2 ring-[rgba(var(--accent-color-rgb),0.35)] ring-offset-2 ring-offset-[var(--settings-panel)]' : ''"
            @click="setAccent(hex)"
            aria-label="set accent"
        />

        <!-- 自定义取色 -->
        <label
            class="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer hover:opacity-90 transition"
            style="border-color: var(--settings-border); background: var(--settings-panel);"
            title="自定义颜色"
        >
          <PhPalette size="16" weight="bold" />
          <input
              type="color"
              class="hidden"
              :value="store.config.theme.accent || '#007AFF'"
              @input="setAccent(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <!-- 侧边栏样式（你原来的，基本不用动） -->
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

    <!-- 壁纸设置（你原来的，保持） -->
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
            class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95"
        >
          <PhUploadSimple class="mr-2" size="16" weight="bold" />
          上传
          <input type="file" accept="image/*,video/mp4" class="hidden" @change="handleFileUpload" />
        </label>
      </div>
    </div>

    <!-- blur / opacity（你原来的，保持） -->
    <div class="space-y-6">
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-bold text-sm">磨砂模糊度</label>
          <span class="text-xs opacity-60">{{ store.config.theme.blur }}px</span>
        </div>
        <input
            type="range"
            v-model.number="store.config.theme.blur"
            min="0"
            max="50"
            class="w-full accent-[var(--accent-color)] range-input"
        />
      </div>

      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-bold text-sm">背景遮罩浓度</label>
          <span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span>
        </div>
        <input
            type="range"
            v-model.number="store.config.theme.opacity"
            min="0"
            max="1"
            step="0.05"
            class="w-full accent-[var(--accent-color)] range-input"
        />
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