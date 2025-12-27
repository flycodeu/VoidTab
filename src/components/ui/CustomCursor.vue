<script setup lang="ts">
import {ref, onMounted, onUnmounted, watch} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';

const store = useConfigStore();

const cursorOuter = ref<HTMLElement | null>(null);
const cursorInner = ref<HTMLElement | null>(null);
const isHovering = ref(false);

let enabled = false;
let rafId: number | null = null;

// 当前位置（inner 直接跟随）
let mouseX = 0;
let mouseY = 0;

// outer 缓动位置
let outerX = 0;
let outerY = 0;

const isFinePointer = () => window.matchMedia('(pointer: fine)').matches;

const applyTransform = (el: HTMLElement | null, x: number, y: number) => {
  if (!el) return;
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
};

const tick = () => {
  // outer 做缓动（越小越“粘”，越大越“跟手”）
  const ease = isHovering.value ? 0.22 : 0.16;
  outerX += (mouseX - outerX) * ease;
  outerY += (mouseY - outerY) * ease;

  applyTransform(cursorOuter.value, outerX, outerY);

  rafId = requestAnimationFrame(tick);
};

const updateCursor = (e: MouseEvent) => {
  if (!enabled) return;

  mouseX = e.clientX;
  mouseY = e.clientY;

  // inner 精准跟随
  applyTransform(cursorInner.value, mouseX, mouseY);

  // 第一次移动时初始化 outer，避免从 (0,0) 飞过来
  if (outerX === 0 && outerY === 0) {
    outerX = mouseX;
    outerY = mouseY;
    applyTransform(cursorOuter.value, outerX, outerY);
  }
};

const isInteractiveTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return !!el.closest(
      'button, a, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"]), .cursor-pointer'
  );
};

const setHoveringFromEvent = (e: Event) => {
  if (!enabled) return;
  isHovering.value = isInteractiveTarget(e.target);
};

const bind = () => {
  if (enabled) return;
  if (!store.config.theme.customCursor) return;
  if (!isFinePointer()) return;

  enabled = true;

  window.addEventListener('mousemove', updateCursor, {passive: true});
  document.addEventListener('mouseover', setHoveringFromEvent, true);
  document.addEventListener('focusin', setHoveringFromEvent, true);
  document.addEventListener('pointerdown', setHoveringFromEvent, true);

  // 启动 raf
  if (rafId === null) rafId = requestAnimationFrame(tick);
};

const unbind = () => {
  if (!enabled) return;
  enabled = false;

  window.removeEventListener('mousemove', updateCursor);
  document.removeEventListener('mouseover', setHoveringFromEvent, true);
  document.removeEventListener('focusin', setHoveringFromEvent, true);
  document.removeEventListener('pointerdown', setHoveringFromEvent, true);

  isHovering.value = false;

  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  outerX = 0;
  outerY = 0;
};

onMounted(() => {
  // 初次挂载
  bind();

  // pointer 类型变化（例如插入鼠标/触控）也能自适应
  const mq = window.matchMedia('(pointer: fine)');
  const onChange = () => {
    // fine -> coarse：关；coarse -> fine：按开关决定是否启用
    if (!isFinePointer()) unbind();
    else bind();
  };

  // 兼容旧浏览器
  // @ts-ignore
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);

  onUnmounted(() => {
    // @ts-ignore
    mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
  });
});

watch(
    () => store.config.theme.customCursor,
    (v) => {
      if (v) bind();
      else unbind();
    }
);

onUnmounted(() => {
  unbind();
});
</script>

<template>
  <!-- 只在桌面端显示（你原来是 md:block），这里继续保持 -->
  <div v-if="store.config.theme.customCursor">
    <!-- outer -->
    <div
        ref="cursorOuter"
        class="hidden md:block fixed pointer-events-none z-[9999] rounded-full mix-blend-difference bg-white will-change-transform top-0 left-0 transition-[width,height,opacity] duration-150 ease-out"
        :class="isHovering ? 'w-8 h-8 opacity-50' : 'w-4 h-4 opacity-80'"
    ></div>

    <!-- inner -->
    <div
        ref="cursorInner"
        class="hidden md:block fixed pointer-events-none z-[9999] w-1 h-1 rounded-full bg-[var(--accent-color)] will-change-transform top-0 left-0"
    ></div>
  </div>
</template>
