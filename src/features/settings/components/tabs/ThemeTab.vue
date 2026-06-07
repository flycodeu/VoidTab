<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useConfigStore } from '../../../../stores/useConfigStore';
import {
  PhSun,
  PhMoon,
  PhUploadSimple,
  PhPalette,
  PhImage,
  PhTrash,
  PhFileImage
} from '@phosphor-icons/vue';
import { wallpaperStorage } from '../../../../core/wallpaper/storage';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const toast = useToast();

/** -----------------------------
 * Theme mode
 * ----------------------------- */
type ThemeMode = 'light' | 'dark';

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
 * Accent presets
 * ----------------------------- */
const presetAccents = [
  '#64748B',
  '#6B7280',
  '#0F766E',
  '#2563EB',
  '#007AFF', '#A3A3A3', '#5AA7FF', '#35C2C1', '#4ECDC4',
  '#7AA7FF', '#E5B1A8', '#FF5CA8', '#D7B84C', '#F59E0B',
  '#111827', '#475569', '#0B3B8F', '#5B21B6', '#B91C1C', '#166534'
];

const rgbToLuma = (r: number, g: number, b: number) => {
  const srgb = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

const accentInk = (hex: string) => {
  const v = hex.replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = rgbToLuma(r, g, b);
  return luma > 0.62 ? '#111827' : '#ffffff';
};

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

function isVideoUrl(url: string) {
  const u = url.toLowerCase();
  return (
      u.endsWith('.mp4') ||
      u.endsWith('.webm') ||
      u.endsWith('.ogg') ||
      u.includes('video')
  );
}

const applyCssVars = () => {
  const el = document.documentElement;

  // accent
  const accent = store.config.theme.accent || '#007AFF';
  el.style.setProperty('--accent-color', accent);
  el.style.setProperty('--accent-color-rgb', hexToRgb(accent));
  el.style.setProperty('--glass-blur', `${store.config.theme.blur ?? 40}px`);
  el.style.setProperty('--overlay-alpha', `${store.config.theme.opacity ?? 0.55}`);
  el.style.setProperty('--accent-ink', accentInk(accent));

  //   壁纸：不再用 CSS 变量去塞 video（video 无法作为 background-image 播放）
  // 如果你项目其它地方还依赖 --user-wallpaper（仅图片），这里保留图片情况：
  const wp = (store.config.theme.wallpaper || '').trim();
  const wpType = (store.config.theme as any).wallpaperType;

  if (wp && wpType === 'image' && !wp.startsWith('idb:')) {
    // URL 图片可以走 background-image（也可完全依赖 WallpaperLayer）
    el.style.setProperty('--user-wallpaper', `url("${wp}")`);
  } else {
    el.style.removeProperty('--user-wallpaper');
  }
};

const applyTheme = () => {
  setRootClass(effectiveMode.value);
  applyCssVars();
};

onMounted(() => {
  if (!store.config.theme.mode) store.config.theme.mode = 'system' as any;
  if (!store.config.theme.accent) store.config.theme.accent = '#007AFF' as any;
  if (!(store.config.theme as any).wallpaperType) (store.config.theme as any).wallpaperType = '';
  applyTheme();
});

/** Watchers */
watch(
    () => [
      store.config.theme.mode,
      store.config.theme.accent,
      store.config.theme.blur,
      store.config.theme.opacity,
      store.config.theme.wallpaper,
      (store.config.theme as any).wallpaperType,
      (store.config.theme as any).customLogoUrl,
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

// --- 壁纸上传：存 IndexedDB，config 只存 idb:key ---

const handleWallpaperUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    toast.warning('文件过大，请上传 10MB 以内的图片或视频');
    input.value = '';
    return;
  }

  const mime = file.type || '';

  const isVideo = mime.startsWith('video/');
  const isImage = mime.startsWith('image/');

  if (!isVideo && !isImage) {
    toast.warning('不支持的文件类型');
    input.value = '';
    return;
  }

  //   存到 IndexedDB：避免 pinia/config 里出现巨大 base64 字符串
  let key = '';
  try {
    key = await wallpaperStorage.save(file, mime);
  } catch {
    toast.error('壁纸保存失败，请稍后重试');
    input.value = '';
    return;
  }

  store.config.theme.wallpaper = `idb:${key}`;
  (store.config.theme as any).wallpaperType = isVideo ? 'video' : 'image';
  toast.success('壁纸已更新');

  input.value = '';
};

const removeWallpaper = async () => {
  const wp = (store.config.theme.wallpaper || '').trim();

  // 如果是 idb:xxx，顺便删掉本地 blob
  if (wp.startsWith('idb:')) {
    const key = wp.slice(4).trim();
    if (key) {
      try {
        await wallpaperStorage.remove(key);
      } catch {
        toast.error('壁纸缓存删除失败，请稍后重试');
      }
    }
  }

  store.config.theme.wallpaper = '';
  (store.config.theme as any).wallpaperType = '';
};

//   用户手动输入 URL：自动判断 image/video
watch(
    () => store.config.theme.wallpaper,
    (val) => {
      const v = (val || '').trim();
      if (!v) {
        (store.config.theme as any).wallpaperType = '';
        return;
      }
      if (v.startsWith('idb:')) return; // 上传的已设置 type

      // 仅对 URL/路径做粗略判断
      (store.config.theme as any).wallpaperType = isVideoUrl(v) ? 'video' : 'image';
    }
);

// --- Logo 上传仍可保持 base64（小图片没问题） ---
const handleLogoUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    toast.warning('Logo 图片建议小于 2MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      (store.config.theme as any).customLogoUrl = e.target.result as string;
      toast.success('Logo 已更新');
    }
  };
  reader.onerror = () => toast.error('Logo 读取失败，请重新选择文件');
  reader.readAsDataURL(file);
  (event.target as HTMLInputElement).value = '';
};

const removeLogo = () => {
  (store.config.theme as any).customLogoUrl = '';
};

const colorInputRef = ref<HTMLInputElement | null>(null);
const openColorPicker = () => colorInputRef.value?.click();
</script>

<template>
  <div class="space-y-6 animate-fade-in" style="color: var(--settings-text);">
    <div
        class="inline-flex w-full p-1 rounded-2xl border"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <button
          class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
          :class="store.config.theme.mode === 'light' ? 'opacity-100' : 'opacity-75 hover:opacity-100'"
          :style="store.config.theme.mode === 'light'
          ? { background: 'rgba(var(--accent-color-rgb),0.14)', color: 'var(--accent-color)' }
          : {}"
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

    <div
        class="p-5 rounded-2xl border space-y-4"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm opacity-80">颜色主题</h3>
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

        <button
            type="button"
            class="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer hover:opacity-90 transition"
            style="border-color: var(--settings-border); background: var(--settings-panel);"
            title="自定义颜色"
            @click="openColorPicker"
        >
          <PhPalette size="16" weight="bold" />
        </button>
      </div>
    </div>

    <div
        class="p-5 rounded-2xl border transition-colors space-y-5"
        style="background-color: var(--settings-panel); border-color: var(--settings-border);"
    >
      <h3 class="font-bold text-sm opacity-80 mb-1">侧边栏样式</h3>

      <div class="space-y-4">
        <div class="space-y-2">
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

        <div class="space-y-2 pt-2 border-t border-[var(--settings-border)] opacity-90">
          <div class="flex justify-between items-center">
            <label class="font-bold text-sm flex items-center gap-2">
              <PhImage size="16" weight="bold" />
              自定义 Logo 图片
            </label>

            <button
                v-if="(store.config.theme as any).customLogoUrl"
                @click="removeLogo"
                class="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <PhTrash size="14" /> 清除
            </button>
          </div>

          <div class="flex items-center gap-3 mt-2">
            <div
                class="w-10 h-10 rounded-lg border flex items-center justify-center overflow-hidden bg-gray-100/10"
                style="border-color: var(--settings-border);"
            >
              <img
                  v-if="(store.config.theme as any).customLogoUrl"
                  :src="(store.config.theme as any).customLogoUrl"
                  class="w-full h-full object-contain"
              />
              <PhFileImage v-else size="20" class="opacity-30" />
            </div>

            <label
                class="flex-1 px-4 py-2 rounded-lg border border-dashed flex items-center justify-center cursor-pointer hover:bg-[rgba(var(--accent-color-rgb),0.05)] transition-colors text-xs font-bold"
                style="border-color: var(--settings-border);"
            >
              <PhUploadSimple class="mr-2" size="16" weight="bold" />
              <span>点击上传</span>
              <span class="ml-2 font-normal opacity-50 scale-90">(.png, .svg)</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" class="hidden" @change="handleLogoUpload" />
            </label>
          </div>
        </div>
      </div>

      <hr class="border-[var(--settings-border)] opacity-50" />

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
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm">壁纸设置</h3>
        <button
            v-if="store.config.theme.wallpaper"
            @click="removeWallpaper"
            class="text-xs opacity-60 hover:text-red-500 transition-colors flex items-center gap-1"
        >
          <PhTrash size="12" /> 清除壁纸
        </button>
      </div>

      <div class="flex gap-2 mb-2">
        <input
            type="text"
            v-model="store.config.theme.wallpaper"
            placeholder="输入图片/视频 URL..."
            class="flex-1 bg-transparent border-b-2 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
            style="border-color: var(--settings-border); color: var(--settings-text);"
        />
        <label
            class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95 whitespace-nowrap"
        >
          <PhUploadSimple class="mr-2" size="16" weight="bold" />
          上传
          <input type="file" accept="image/*,video/mp4,video/webm" class="hidden" @change="handleWallpaperUpload" />
        </label>
      </div>
      <p class="text-[10px] opacity-40 text-right">支持 JPG, PNG, GIF, MP4, WebM (建议 &lt; 10MB)</p>
    </div>

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

    <input
        ref="colorInputRef"
        type="color"
        :value="store.config.theme.accent || '#007AFF'"
        @input="setAccent(($event.target as HTMLInputElement).value)"
        class="fixed opacity-0 pointer-events-none"
        style="z-index: -1;"
    />
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
.animate-slide-down { animation: slideDown 0.2s ease-out forwards; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.range-input {
  background: var(--settings-border);
  border-radius: 999px;
  height: 6px;
}
</style>
