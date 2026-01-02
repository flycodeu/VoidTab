<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {PhGear, PhSquaresFour} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
  groups: Array<{ id: string; title: string; icon: string; items?: any[] }>;
  activeGroupId: string;
}>();

const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
}>();

const FIT_COUNT = 4;
const shouldFit = computed(() => props.groups.length <= FIT_COUNT);

/** ✅ 横向滚动容器 */
const scrollerRef = ref<HTMLDivElement | null>(null);

/** =========================
 *  A) 你原本的：手指拖动横向滚动（锁定 X 轴）
 *  ========================= */
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let lock: 'x' | 'y' | null = null;

function onTouchStart(e: TouchEvent) {
  if (!scrollerRef.value) return;
  if (shouldFit.value) return;

  const t = e.touches[0];
  startX = t.clientX;
  startY = t.clientY;
  startScrollLeft = scrollerRef.value.scrollLeft;
  lock = null;
}

function onTouchMove(e: TouchEvent) {
  if (!scrollerRef.value) return;
  if (shouldFit.value) return;

  const t = e.touches[0];
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;

  if (!lock) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > ay + 6) lock = 'x';
    else if (ay > ax + 6) lock = 'y';
  }

  if (lock === 'x') {
    // 关键：阻止页面竖向滚动
    if (e.cancelable) e.preventDefault();
    scrollerRef.value.scrollLeft = startScrollLeft - dx;
  }
}

function onTouchEnd() {
  lock = null;
}

/** =========================
 *  B) 新增：桌面（F12 缩小屏幕）支持
 *  1) wheel 映射为横向滚动
 *  2) 鼠标按住拖拽横向滚动
 *  ========================= */

/** wheel：让鼠标滚轮也能横向滚 */
function onWheel(e: WheelEvent) {
  const el = scrollerRef.value;
  if (!el) return;
  if (shouldFit.value) return;

  // 没有横向溢出就不处理
  if (el.scrollWidth <= el.clientWidth) return;

  // 优先使用 deltaX；否则用 deltaY 映射成横向
  const dx = Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY;

  // 避免页面跟着上下滚动（仅在需要时拦截）
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();

  el.scrollLeft += dx;
}

/** pointer drag：鼠标按住拖拽 */
let dragging = false;
let dragStartX = 0;
let dragStartScrollLeft = 0;

function onPointerDown(e: PointerEvent) {
  const el = scrollerRef.value;
  if (!el) return;
  if (shouldFit.value) return;
  if (el.scrollWidth <= el.clientWidth) return;

  dragging = true;
  dragStartX = e.clientX;
  dragStartScrollLeft = el.scrollLeft;

  // 捕获指针，避免移出元素就断
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);

  // 避免选中/拖拽图片等默认行为
  if (e.cancelable) e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const el = scrollerRef.value;
  if (!el) return;

  const dx = e.clientX - dragStartX;
  el.scrollLeft = dragStartScrollLeft - dx;

  if (e.cancelable) e.preventDefault();
}

function onPointerUp() {
  dragging = false;
}

onMounted(() => {
  const el = scrollerRef.value;
  if (!el) return;

  // 你原本的 touch 监听（保留）
  el.addEventListener('touchstart', onTouchStart, {passive: true});
  el.addEventListener('touchmove', onTouchMove, {passive: false}); // 必须 passive:false 才能 preventDefault
  el.addEventListener('touchend', onTouchEnd, {passive: true});
  el.addEventListener('touchcancel', onTouchEnd, {passive: true});

  // 新增 wheel（必须 passive:false 才能 preventDefault）
  el.addEventListener('wheel', onWheel, {passive: false});

  // 新增 pointer drag（不影响 touch，pointer 在移动端也可用，但我们只有需要时才启动）
  el.addEventListener('pointerdown', onPointerDown, {passive: false});
  el.addEventListener('pointermove', onPointerMove, {passive: false});
  el.addEventListener('pointerup', onPointerUp, {passive: true});
  el.addEventListener('pointercancel', onPointerUp, {passive: true});
});

onUnmounted(() => {
  const el = scrollerRef.value;
  if (!el) return;

  el.removeEventListener('touchstart', onTouchStart as any);
  el.removeEventListener('touchmove', onTouchMove as any);
  el.removeEventListener('touchend', onTouchEnd as any);
  el.removeEventListener('touchcancel', onTouchEnd as any);

  el.removeEventListener('wheel', onWheel as any);

  el.removeEventListener('pointerdown', onPointerDown as any);
  el.removeEventListener('pointermove', onPointerMove as any);
  el.removeEventListener('pointerup', onPointerUp as any);
  el.removeEventListener('pointercancel', onPointerUp as any);
});
</script>

<template>
  <div
      v-if="show"
      class="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-center justify-between px-3 border-t border-white/10"
      style="
      background: var(--modal-bg);
      backdrop-filter: blur(25px);
      padding-top: 8px;
      padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
    "
  >
    <!-- ✅ 横向滚动容器 -->
    <div
        ref="scrollerRef"
        class="flex-1 min-w-0 pr-2"
        :class="shouldFit ? '' : 'overflow-x-auto overflow-y-hidden no-scrollbar'"
        style="
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        touch-action: pan-x;
      "
        :data-dragging="dragging ? '1' : '0'"
    >
      <div class="flex items-center gap-2" :class="shouldFit ? 'w-full' : 'flex-nowrap w-max'">
        <button
            v-for="group in groups"
            :key="group.id"
            @click="emit('update:activeGroupId', group.id)"
            class="relative flex flex-col items-center justify-center h-[3.8rem] rounded-xl transition-all border border-transparent select-none"
            :class="[
            shouldFit ? 'flex-1 min-w-0' : 'flex-none w-16',
            activeGroupId === group.id
              ? 'bg-white/10 text-[var(--accent-color)] shadow-sm border-white/5'
              : 'text-[var(--text-secondary)] opacity-60 active:opacity-100'
          ]"
        >
          <component
              :is="(PhIcons as any)['Ph' + group.icon] || PhSquaresFour"
              size="20"
              :weight="activeGroupId === group.id ? 'fill' : 'regular'"
          />

          <span
              class="text-[10px] font-medium mt-0.5 truncate"
              :class="shouldFit ? 'max-w-[6.5em]' : 'max-w-[5.5em]'"
          >
            {{ group.title }}
          </span>

          <span
              v-if="group.items?.length"
              class="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-current opacity-40"
          />
        </button>
      </div>
    </div>

    <div class="pl-2 border-l border-white/10 ml-1">
      <button
          @click="emit('openSettings')"
          class="p-3 rounded-full bg-white/5 text-[var(--text-primary)] active:scale-90 transition-transform border border-white/5"
      >
        <PhGear size="22" weight="fill"/>
      </button>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  scrollbar-width: none;
}

/* 可选：桌面拖拽时体验更明显（不影响核心功能） */
[data-dragging="0"].no-scrollbar {
  cursor: grab;
}

[data-dragging="1"].no-scrollbar {
  cursor: grabbing;
}
</style>
