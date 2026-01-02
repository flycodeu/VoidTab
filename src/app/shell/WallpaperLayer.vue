<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{
  wallpaper: string;
  blur: number;
  opacity: number;
}>();

const isVideo = computed(() => {
  if (!props.wallpaper) return false;
  const url = props.wallpaper.toLowerCase();
  // 简单的视频格式判断，涵盖常见格式
  return url.endsWith('.mp4') || url.endsWith('.webm') || url.startsWith('data:video/');
});

// 计算动态样式，减少 template 里的逻辑
const layerStyle = computed(() => ({
  filter: `blur(${props.blur}px)`
}));

const overlayStyle = computed(() => ({
  backgroundColor: 'var(--bg-overlay)', // 使用 CSS 变量里的遮罩色
  opacity: props.opacity // 用户设置的遮罩浓度
}));
</script>

<template>
  <div class="fixed inset-0 w-full h-full overflow-hidden pointer-events-none wallpaper-container">
    <transition name="fade" mode="out-in">

      <video
          v-if="isVideo"
          :key="'video-' + wallpaper"
          autoplay loop muted playsinline
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
          :style="layerStyle"
      >
        <source :src="wallpaper" type="video/mp4"/>
      </video>

      <img
          v-else-if="wallpaper"
          :key="'img-' + wallpaper"
          :src="wallpaper"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
          :style="layerStyle"
          alt="wallpaper"
      />

      <div
          v-else
          class="absolute inset-0 w-full h-full default-bg transition-colors duration-500"
      ></div>
    </transition>

    <div
        class="absolute inset-0 transition-opacity duration-500"
        :style="overlayStyle"
    ></div>
  </div>
</template>

<style scoped>
.wallpaper-container {
  z-index: 0; /* 确保位于最底层，但在 html 背景之上 */
}

/* 默认背景样式引用 */
.default-bg {
  background-image: var(--default-wallpaper);
  background-size: cover;
  background-position: center;
}

/* 简单的淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>