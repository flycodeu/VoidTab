<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{
  wallpaper: string;
  blur: number;
  opacity: number;
}>();

const isVideo = computed(() => {
  const url = props.wallpaper || '';
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.startsWith('data:video/');
});
</script>

<template>
  <div class="fixed inset-0 z-[-1] bg-[#050505] dark:bg-[#050505] transition-colors">
    <transition name="fade">
      <video
          v-if="isVideo && wallpaper"
          autoplay
          loop
          muted
          playsinline
          class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          :style="{
          filter: `blur(${blur}px) brightness(${1 - opacity * 0.5})`
        }"
      >
        <source :src="wallpaper" type="video/mp4"/>
      </video>
    </transition>

    <transition name="fade">
      <img
          v-if="!isVideo && wallpaper"
          :src="wallpaper"
          class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          :style="{
          filter: `blur(${blur}px) brightness(${1 - opacity * 0.5})`
        }"
          loading="eager"
          alt="wallpaper"
      />
    </transition>

    <div
        class="absolute inset-0 transition-all duration-500"
        :style="{ background: 'var(--bg-overlay)', opacity }"
    ></div>
    <div class="absolute inset-0 backdrop-blur-[var(--glass-backdrop-blur)] transition-all duration-300"></div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
