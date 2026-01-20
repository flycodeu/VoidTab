<!-- src/components/WallpaperLayer.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import { wallpaperStorage } from '../../core/wallpaper/storage';

const store = useConfigStore();

const type = computed<'image' | 'video' | ''>(() => {
  return ((store.config.theme as any).wallpaperType || '') as any;
});

const refStr = computed(() => (store.config.theme.wallpaper || '').trim());

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
  // 异步解引用 idb
  resolveIdbIfNeeded();
}, { immediate: true });

onBeforeUnmount(() => revoke());
</script>

<template>
  <div class="wallpaper-layer" aria-hidden="true">
    <video
        v-if="type === 'video' && resolvedSrc"
        class="wallpaper-media"
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
        :src="resolvedSrc"
        alt=""
        loading="eager"
        decoding="async"
        draggable="false"
    />
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
</style>
