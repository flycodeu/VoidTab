<!-- src/components/WallpaperLayer.vue -->
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {wallpaperStorage} from '../../core/wallpaper/storage';

const store = useConfigStore();

const type = computed<'image' | 'video' | ''>(() => {
  return ((store.config.theme as any).wallpaperType || '') as any;
});

const refStr = computed(() => (store.config.theme.wallpaper || '').trim());

// 你的主题本来就有 blur/opacity，这里直接使用
const wallpaperBlurPx = computed(() => {
  const n = Number(store.config.theme.blur ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(60, n));
});

const wallpaperOpacity = computed(() => {
  const n = Number(store.config.theme.opacity ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
});

// idb:xxx -> objectURL
const objectUrl = ref<string>('');

const revoke = () => {
  if (objectUrl.value && objectUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(objectUrl.value);
  }
  objectUrl.value = '';
};

const resolvedSrc = computed(() => {
  // 1) 上传文件：idb:key -> objectUrl
  if (refStr.value.startsWith('idb:')) return objectUrl.value;

  // 2) 用户手动输入 URL：直接用
  return refStr.value;
});

async function resolveIdbIfNeeded() {
  revoke();

  if (!refStr.value.startsWith('idb:')) return;

  const key = refStr.value.slice(4).trim();
  if (!key) return;

  const record = await wallpaperStorage.get(key);
  if (!record?.blob) {
    // 本地 idb 丢了，就清空（避免页面一直尝试）
    (store.config.theme as any).wallpaperType = '';
    store.config.theme.wallpaper = '';
    return;
  }

  objectUrl.value = URL.createObjectURL(record.blob);
}

watch(refStr, () => {
  resolveIdbIfNeeded();
}, {immediate: true});

onBeforeUnmount(() => revoke());

// 给 wallpaper-media 喂样式（blur + opacity）
const mediaStyle = computed(() => {
  return {
    opacity: String(wallpaperOpacity.value),
    filter: wallpaperBlurPx.value > 0 ? `blur(${wallpaperBlurPx.value}px)` : 'none',
    transform: wallpaperBlurPx.value > 0 ? 'scale(1.04)' : 'none', // 避免 blur 出现黑边
  } as Record<string, string>;
});

/**
 * Readability overlay 样式
 * 由 useThemeRuntimeSync 写入的 CSS 变量驱动：
 *  - --readability-enabled: 0/1
 *  - --readability-opacity: 0~1
 *  - --readability-color: '0,0,0' or '255,255,255'
 *  - --readability-blur: '0px'~'12px'
 *  - --readability-saturate: 0~1（如果你后续想作用到 wallpaper，可扩展）
 */
const readabilityStyle = computed(() => {
  // 注意：这里不从 store 读取，全部走 CSS 变量，保证运行时同步统一入口
  return {
    background: `rgba(var(--readability-color, 0,0,0), var(--readability-opacity, 0))`,
    backdropFilter: `blur(var(--readability-blur, 0px))`,
    WebkitBackdropFilter: `blur(var(--readability-blur, 0px))`,
    opacity: `var(--readability-enabled, 1)`,
  } as Record<string, string>;
});
</script>

<template>
  <div class="wallpaper-layer" aria-hidden="true">
    <video
        v-if="type === 'video' && resolvedSrc"
        class="wallpaper-media"
        :style="mediaStyle"
        :src="resolvedSrc"
        autoplay
        muted
        loop
        playsinline
        preload="metadata"
    />

    <img
        v-else-if="type === 'image' && resolvedSrc"
        class="wallpaper-media"
        :style="mediaStyle"
        :src="resolvedSrc"
        alt=""
        loading="eager"
        decoding="async"
        draggable="false"
    />

    <!-- 新增：可读性遮罩层（始终存在，由 CSS 变量控制强度/是否启用） -->
    <div class="readability-layer" :style="readabilityStyle"></div>
  </div>
</template>

<style scoped>
.wallpaper-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

/* 背景媒体 */
.wallpaper-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 可读性遮罩层 */
.readability-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
