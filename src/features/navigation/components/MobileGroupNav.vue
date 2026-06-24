<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {PhGear} from '@phosphor-icons/vue';
import {getWorkspaceTileCount, type RuntimeWorkspace} from '../../../core/tiles/tileAccess.ts';
import {resolvePhosphorIcon} from '../../../shared/icons/phosphorIconMap';

const props = defineProps<{
  show: boolean;
  groups: RuntimeWorkspace[];
  activeGroupId: string;
}>();

const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;

  // ✅ 新增：把“当前可用宽度 / 是否窄屏”通知父组件
  (e: 'viewport', v: { width: number; isNarrow: boolean }): void;
}>();

const FIT_COUNT = 4;
const shouldFit = computed(() => props.groups.length <= FIT_COUNT);

/** 横向滚动容器 */
const scrollerRef = ref<HTMLDivElement | null>(null);

/** ✅ 新增：底栏本身容器，用于测量宽度（更准，不用 window.innerWidth 猜） */
const barRef = ref<HTMLDivElement | null>(null);
const barWidth = ref<number>(0);

// 你可以按需求调：<= 520 基本就是手机/窄窗口
const isNarrow = computed(() => barWidth.value > 0 && barWidth.value <= 520);

let ro: ResizeObserver | null = null;

function emitViewport() {
  emit('viewport', {width: barWidth.value || 0, isNarrow: isNarrow.value});
}

/** =========================
 * A) 手指拖动横向滚动（锁定 X 轴）
 * ========================= */
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
    if (e.cancelable) e.preventDefault();
    scrollerRef.value.scrollLeft = startScrollLeft - dx;
  }
}

function onTouchEnd() {
  lock = null;
}

/** =========================
 * B) 桌面缩小屏幕支持：wheel & pointer drag
 * ========================= */
function onWheel(e: WheelEvent) {
  const el = scrollerRef.value;
  if (!el) return;
  if (shouldFit.value) return;
  if (el.scrollWidth <= el.clientWidth) return;

  const normalize = (value: number) => {
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 40;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return value * window.innerHeight;
    return value;
  };
  const rawDeltaX = normalize(e.deltaX);
  const rawDeltaY = normalize(e.deltaY);
  const dominantDelta = Math.abs(rawDeltaX) > Math.abs(rawDeltaY) ? rawDeltaX : rawDeltaY;
  const dx = Math.max(-240, Math.min(240, dominantDelta * 2.4));
  if (!dx) return;

  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  el.scrollLeft += dx;
}


onMounted(() => {
  // ✅ 1) 监听底栏宽度变化
  if (barRef.value) {
    ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      barWidth.value = rect.width;
      emitViewport();
    });
    ro.observe(barRef.value);
  }

  // ✅ 2) 绑定滚动交互
  const el = scrollerRef.value;
  if (!el) return;

  el.addEventListener('touchstart', onTouchStart, {passive: true});
  el.addEventListener('touchmove', onTouchMove, {passive: false});
  el.addEventListener('touchend', onTouchEnd, {passive: true});
  el.addEventListener('touchcancel', onTouchEnd, {passive: true});

  el.addEventListener('wheel', onWheel, {passive: false});

});

// 如果 show 切换时宽度可能变化，补发一次
watch(() => props.show, () => emitViewport());

onUnmounted(() => {
  ro?.disconnect();
  ro = null;

  const el = scrollerRef.value;
  if (!el) return;

  el.removeEventListener('touchstart', onTouchStart as any);
  el.removeEventListener('touchmove', onTouchMove as any);
  el.removeEventListener('touchend', onTouchEnd as any);
  el.removeEventListener('touchcancel', onTouchEnd as any);

  el.removeEventListener('wheel', onWheel as any);

});
</script>

<template>
  <nav
      v-if="show"
      ref="barRef"
      class="fixed bottom-0 left-0 right-0 z-50 lg:hidden flex items-center justify-between px-3 border-t border-white/10"
      aria-label="移动分组导航"
      style="
      background: var(--modal-bg);
      backdrop-filter: blur(25px);
      padding-top: 8px;
      padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
    "
  >
    <div
        ref="scrollerRef"
        class="flex-1 min-w-0 pr-2"
        :class="shouldFit ? '' : 'overflow-x-auto overflow-y-hidden no-scrollbar'"
        aria-label="移动分组列表"
        style="
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        touch-action: pan-x;
      "
    >
      <div class="flex items-center gap-2" :class="shouldFit ? 'w-full' : 'flex-nowrap w-max'">
        <button
            type="button"
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
            :aria-label="`切换到分组：${group.title}，${getWorkspaceTileCount(group)} 个项目`"
            :aria-current="activeGroupId === group.id ? 'page' : undefined"
        >
          <component
              :is="resolvePhosphorIcon(group.icon, 'SquaresFour')"
              size="20"
              :weight="activeGroupId === group.id ? 'fill' : 'regular'"
              aria-hidden="true"
          />

          <span class="text-[10px] font-medium mt-0.5 truncate" :class="shouldFit ? 'max-w-[6.5em]' : 'max-w-[5.5em]'">
            {{ group.title }}
          </span>

          <span
              v-if="getWorkspaceTileCount(group)"
              class="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-current opacity-40"
              aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div class="pl-2 border-l border-white/10 ml-1">
      <button
          type="button"
          @click="emit('openSettings')"
          class="p-3 rounded-full bg-white/5 text-[var(--text-primary)] active:scale-90 transition-transform border border-white/5"
          aria-label="打开设置"
          title="打开设置"
      >
        <PhGear size="22" weight="fill" aria-hidden="true"/>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  scrollbar-width: none;
}
</style>
