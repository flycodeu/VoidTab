<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import ClockDetailModal from './ClockDetailModal.vue';

const props = defineProps<{ item: SiteItem }>();

// 1. 初始化 Date 与 响应式字符串
const now = ref(new Date());
const showModal = ref(false);
let timer: any = null;

const hStr = ref('');
const mStr = ref('');
const sStr = ref('');

const updateClock = () => {
  const d = new Date();
  now.value = d;
  // 时、分字符串，用于触发动画
  hStr.value = d.getHours().toString().padStart(2, '0');
  mStr.value = d.getMinutes().toString().padStart(2, '0');
  // 秒钟仅作为纯数据，不触发翻页动画
  sStr.value = d.getSeconds().toString().padStart(2, '0');
};

onMounted(() => {
  updateClock();
  timer = setInterval(updateClock, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// 2. 自适应逻辑 (解决遮盖与缩放)
const layout = computed(() => {
  const w = props.item?.w ?? 1;
  const h = props.item?.h ?? 1;

  const is1x1 = w === 1 && h === 1;
  const is1x2 = w === 1 && h === 2;
  const is2x1 = w === 2 && h === 1;
  const isStandard = w === 2 && h === 2; // 2x2
  const isLarge = w >= 2 && h >= 2;

  return {
    containerClass: is2x1 ? 'flex-row items-center justify-around px-4' : 'flex-col items-center justify-center p-2',
    // 2x2 模式下使用 tight 布局，防止遮盖
    timeClass: is1x1 ? 'text-2xl font-bold'
        : is1x2 ? 'text-3xl font-bold'
            : is2x1 ? 'text-4xl'
                : isStandard ? 'text-[54px] font-bold leading-tight' // 修正 2x2 字号
                    : 'text-8xl font-bold leading-tight',

    subTextClass: is1x1 ? 'text-[10px] mt-0.5' : isLarge ? 'text-lg mt-2' : 'text-xs mt-1',

    showSeconds: isLarge,
    showDate: !is1x1,
    useLongWeek: isLarge,
    // 核心修复：为翻页位设置显式高度容器
    digitWrapperClass: isStandard ? 'h-[60px]' : (isLarge ? 'h-[100px]' : 'h-auto')
  };
});

const displayData = computed(() => {
  return {
    date: (now.value.getMonth() + 1).toString().padStart(2, '0') + '/' +
        now.value.getDate().toString().padStart(2, '0'),
    weekShort: now.value.toLocaleDateString('zh-CN', {weekday: 'short'}),
    weekFull: now.value.toLocaleDateString('zh-CN', {weekday: 'long'})
  };
});
</script>

<template>
  <div
      class="w-full h-full flex flex-col relative cursor-pointer bg-[#121212] rounded-[22px] text-white transition-all hover:bg-[#1f1f1f] overflow-hidden group"
      @click.stop="showModal = true"
  >
    <div class="flex-1 flex select-none" :class="layout.containerClass">

      <div class="flex items-center font-mono tabular-nums tracking-tighter" :class="layout.timeClass">

        <div class="relative overflow-hidden flex items-center" :class="layout.digitWrapperClass">
          <Transition name="flip" mode="out-in">
            <span :key="hStr">{{ hStr }}</span>
          </Transition>
        </div>

        <span class="mx-0.5 opacity-40 animate-pulse">:</span>

        <div class="relative overflow-hidden flex items-center" :class="layout.digitWrapperClass">
          <Transition name="flip" mode="out-in">
            <span :key="mStr">{{ mStr }}</span>
          </Transition>
        </div>

        <template v-if="layout.showSeconds">
          <span class="mx-0.5 opacity-20 text-[0.6em]">:</span>
          <span class="text-[0.6em] opacity-40 italic">{{ sStr }}</span>
        </template>
      </div>

      <div v-if="layout.showDate" class="flex items-center gap-2 font-medium opacity-80" :class="layout.subTextClass">
        <span>{{ displayData.date }}</span>
        <span>{{ layout.useLongWeek ? displayData.weekFull : displayData.weekShort }}</span>
      </div>
    </div>

    <div class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-20 transition-opacity">
      <div class="w-4 h-4 border-2 border-white rounded-md"></div>
    </div>

    <Teleport to="body">
      <ClockDetailModal :show="showModal" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>
/* 翻页特效：小时和分钟专用 */
.flip-enter-active,
.flip-leave-active {
  transition: all 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.flip-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.flip-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* 强制使用等宽字体，防止翻页时宽度抖动 */
.font-mono {
  font-family: 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
}
</style>