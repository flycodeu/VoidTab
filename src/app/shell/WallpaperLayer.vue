<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {wallpaperStorage} from '../../core/wallpaper/storage';

const store = useConfigStore();

const type = computed<'image' | 'video' | ''>(() => {
  const value = (store.config.theme as any).wallpaperType;
  return value === 'image' || value === 'video' ? value : '';
});

const refStr = computed(() => (store.config.theme.wallpaper || '').trim());
const objectUrl = ref('');
const cacheState = ref<'idle' | 'cached' | 'remote' | 'error'>('idle');
const videoEl = ref<HTMLVideoElement | null>(null);
let resolveToken = 0;

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

const isRemoteHttpImage = computed(() => {
  if (type.value !== 'image' || !refStr.value || refStr.value.startsWith('idb:')) return false;
  try {
    const parsed = new URL(refStr.value, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
});

const revokeObjectUrl = () => {
  if (objectUrl.value.startsWith('blob:')) URL.revokeObjectURL(objectUrl.value);
  objectUrl.value = '';
};

const resolvedSrc = computed(() => {
  if (refStr.value.startsWith('idb:')) return objectUrl.value;
  if (isRemoteHttpImage.value && objectUrl.value) return objectUrl.value;
  return refStr.value;
});

async function fetchRemoteImageToCache(url: string, token: number) {
  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return;
    const blob = await response.blob();
    if (token !== resolveToken) return;
    await wallpaperStorage.cacheRemoteImage(url, blob, blob.type || response.headers.get('content-type') || 'image/*');
  } catch {
    return;
  }
}

async function resolveWallpaperSource() {
  const token = ++resolveToken;
  revokeObjectUrl();
  cacheState.value = 'idle';

  if (!refStr.value) return;

  if (refStr.value.startsWith('idb:')) {
    const key = refStr.value.slice(4).trim();
    if (!key) return;

    const record = await wallpaperStorage.get(key);
    if (token !== resolveToken) return;
    if (!record?.blob) {
      cacheState.value = 'error';
      (store.config.theme as any).wallpaperType = '';
      store.config.theme.wallpaper = '';
      return;
    }

    objectUrl.value = URL.createObjectURL(record.blob);
    cacheState.value = 'cached';
    return;
  }

  if (isRemoteHttpImage.value) {
    const cached = await wallpaperStorage.getCachedRemoteImage(refStr.value).catch(() => undefined);
    if (token !== resolveToken) return;
    if (cached?.blob) {
      objectUrl.value = URL.createObjectURL(cached.blob);
      cacheState.value = 'cached';
      return;
    }

    cacheState.value = 'remote';
    void fetchRemoteImageToCache(refStr.value, token);
  }
}

const handleImageLoad = () => {
  if (isRemoteHttpImage.value && !objectUrl.value) cacheState.value = 'remote';
};

const handleImageError = () => {
  if (isRemoteHttpImage.value && objectUrl.value) {
    revokeObjectUrl();
    cacheState.value = 'remote';
    return;
  }
  cacheState.value = 'error';
};

const syncVideoPlayback = () => {
  const video = videoEl.value;
  if (!video) return;
  if (document.hidden) {
    video.pause();
    return;
  }
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => null);
  }
};

const handleVideoError = () => {
  cacheState.value = 'error';
};

watch([refStr, type], () => {
  void resolveWallpaperSource();
}, {immediate: true});

watch(resolvedSrc, () => {
  if (type.value === 'video') requestAnimationFrame(syncVideoPlayback);
});

onMounted(() => {
  document.addEventListener('visibilitychange', syncVideoPlayback);
  requestAnimationFrame(syncVideoPlayback);
});

onBeforeUnmount(() => {
  resolveToken += 1;
  document.removeEventListener('visibilitychange', syncVideoPlayback);
  revokeObjectUrl();
});

const mediaStyle = computed(() => {
  return {
    opacity: String(wallpaperOpacity.value),
    filter: wallpaperBlurPx.value > 0 ? `blur(${wallpaperBlurPx.value}px)` : 'none',
    transform: wallpaperBlurPx.value > 0 ? 'scale(1.04)' : 'none',
  } as Record<string, string>;
});

const readabilityStyle = computed(() => {
  return {
    background: `rgba(var(--readability-color, 0,0,0), var(--readability-opacity, 0))`,
    backdropFilter: `blur(var(--readability-blur, 0px)) saturate(var(--readability-saturate, 1))`,
    WebkitBackdropFilter: `blur(var(--readability-blur, 0px)) saturate(var(--readability-saturate, 1))`,
    opacity: `var(--readability-enabled, 1)`,
  } as Record<string, string>;
});
</script>

<template>
  <div class="wallpaper-layer" aria-hidden="true" :data-cache-state="cacheState">
    <video
        v-if="type === 'video' && resolvedSrc"
        ref="videoEl"
        class="wallpaper-media"
        :style="mediaStyle"
        :src="resolvedSrc"
        autoplay
        muted
        loop
        playsinline
        preload="metadata"
        @canplay="syncVideoPlayback"
        @error="handleVideoError"
        @stalled="syncVideoPlayback"
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
        referrerpolicy="no-referrer"
        @load="handleImageLoad"
        @error="handleImageError"
    />

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

.wallpaper-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.readability-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
