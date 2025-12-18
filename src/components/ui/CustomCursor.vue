<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';

const store = useConfigStore();
const cursorOuter = ref<HTMLElement | null>(null);
const cursorInner = ref<HTMLElement | null>(null);
const isHovering = ref(false);

const updateCursor = (e: MouseEvent) => {
  if (!store.config.theme.customCursor) return;
  if (window.matchMedia('(pointer: fine)').matches) {
    const x = e.clientX;
    const y = e.clientY;
    if (cursorOuter.value) cursorOuter.value.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    if (cursorInner.value) cursorInner.value.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }
};

const checkHover = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('button, a, .cursor-pointer, input, select, [role="button"]')) {
    isHovering.value = true;
  } else {
    isHovering.value = false;
  }
};

onMounted(() => {
  window.addEventListener('mousemove', updateCursor, { passive: true });
  document.body.addEventListener('mouseover', checkHover);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', updateCursor);
  document.body.removeEventListener('mouseover', checkHover);
});
</script>

<template>
  <div v-if="store.config.theme.customCursor">
    <div ref="cursorOuter" class="hidden md:block fixed pointer-events-none z-[9999] rounded-full mix-blend-difference bg-white transition-opacity duration-200 ease-out will-change-transform top-0 left-0" :class="isHovering ? 'w-8 h-8 opacity-50' : 'w-4 h-4 opacity-80'"></div>
    <div ref="cursorInner" class="hidden md:block fixed pointer-events-none z-[9999] w-1 h-1 rounded-full bg-[var(--accent-color)] transition-none will-change-transform top-0 left-0"></div>
  </div>
</template>