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

/** ✅ 手指拖动横向滚动（锁定 X 轴，避免页面上下滚动抢走手势） */
const scrollerRef = ref<HTMLDivElement | null>(null);
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let lock: 'x' | 'y' | null = null;

function onTouchStart(e: TouchEvent) {
  if (!scrollerRef.value) return;
  if (shouldFit.value) return; // 少量均分时不需要拖动滚动

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

  // 还没锁方向：判断是横滑还是竖滑
  if (!lock) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > ay + 6) lock = 'x';
    else if (ay > ax + 6) lock = 'y';
  }

  // 锁定横向：阻止默认滚动，让它变成横向拖动滚动
  if (lock === 'x') {
    e.preventDefault(); // 关键：阻止页面竖向滚动
    scrollerRef.value.scrollLeft = startScrollLeft - dx;
  }
}

function onTouchEnd() {
  lock = null;
}

onMounted(() => {
  const el = scrollerRef.value;
  if (!el) return;

  // 注意：必须 passive:false 才能 preventDefault 生效
  el.addEventListener('touchstart', onTouchStart, {passive: true});
  el.addEventListener('touchmove', onTouchMove, {passive: false});
  el.addEventListener('touchend', onTouchEnd, {passive: true});
  el.addEventListener('touchcancel', onTouchEnd, {passive: true});
});

onUnmounted(() => {
  const el = scrollerRef.value;
  if (!el) return;
  el.removeEventListener('touchstart', onTouchStart as any);
  el.removeEventListener('touchmove', onTouchMove as any);
  el.removeEventListener('touchend', onTouchEnd as any);
  el.removeEventListener('touchcancel', onTouchEnd as any);
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
          <span class="text-[10px] font-medium mt-0.5 truncate" :class="shouldFit ? 'max-w-[6.5em]' : 'max-w-[5.5em]'">
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
</style>
