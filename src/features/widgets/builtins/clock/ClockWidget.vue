<script setup lang="ts">
import {ref, computed} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import ClockDetailModal from './ClockDetailModal.vue';
import {useVisibilityInterval} from '../../../../shared/composables/useVisibilityInterval';

// 默认值
const props = withDefaults(defineProps<{ item?: SiteItem }>(), {
  item: () => ({id: 'clock', w: 2, h: 1, kind: 'widget', widgetType: 'clock'})
});

const now = ref(new Date());
const showModal = ref(false);

const hStr = ref('');
const mStr = ref('');

const updateClock = () => {
  const d = new Date();
  now.value = d;
  hStr.value = d.getHours().toString().padStart(2, '0');
  mStr.value = d.getMinutes().toString().padStart(2, '0');
};

useVisibilityInterval(updateClock, 1000, {immediate: true});

// --- 核心修复：全尺寸适配逻辑 ---
const layout = computed(() => {
  const w = props.item?.w ?? 2;
  const h = props.item?.h ?? 1;

  // 1. 基础特征判断
  const isCompactHeight = h === 1; // 高度为1 (如 2x1, 3x1, 4x1)
  const isCompactWidth = w === 1;  // 宽度为1 (如 1x1, 1x2)
  const isTall = h >= 3;           // 很高 (如 2x4)
  const isLargeScreen = w >= 4 && h >= 2; // 真正的超大屏 (4x2, 4x4)

  // 2. 字体与翻页器高度决策
  let fontSizeClass = '';
  let digitHeightClass = '';

  if (isCompactWidth) {
    // 宽度为1：窄布局
    // 1x1 用 2xl, 1x2 用 3xl
    fontSizeClass = h === 1 ? 'text-2xl font-bold' : 'text-3xl font-bold';
    digitHeightClass = 'h-auto';
  } else if (isCompactHeight) {
    // 【关键修复】宽度 >= 2 但高度 = 1 (即 2x1, 3x1 布局)
    // 强制使用 4xl (约36px)，防止撑爆容器
    fontSizeClass = 'text-4xl font-bold leading-tight';
    digitHeightClass = 'h-[40px]';
  } else if (w < 4) {
    // 宽度 2或3，且高度 >= 2 (即 2x2, 2x4)
    // 保持 54px，这是 2x2 的最佳视觉效果
    fontSizeClass = 'text-[54px] font-bold leading-none';
    digitHeightClass = 'h-[64px]';
  } else {
    // 4列以上的大屏
    fontSizeClass = 'text-8xl font-bold leading-none';
    digitHeightClass = 'h-[100px]';
  }

  // 3. 容器布局与间距决策
  let containerClass = 'flex flex-col items-center justify-center';

  // 间距微调
  if (isCompactHeight) {
    // 矮布局：间距极小
    containerClass += ' gap-0';
  } else if (isTall) {
    // 高布局 (2x4)：间距适中，不要太大导致推到底部
    containerClass += ' gap-4';
  } else {
    // 标准 2x2
    containerClass += ' gap-2';
  }

  // 4. 日期文字适配
  // 1x1不显示日期，2x1显示小号日期
  const showDate = !(w === 1 && h === 1);
  const dateClass = isCompactHeight
      ? 'text-xs opacity-60 mt-0.5' // 2x1 紧凑日期
      : (isLargeScreen ? 'text-lg opacity-60 mt-3' : 'text-sm opacity-60 mt-1');

  return {
    containerClass,
    timeClass: `${fontSizeClass} tracking-tight`, // tracking-tight 防止数字过宽
    digitWrapperClass: digitHeightClass,
    dateClass: `flex items-center gap-2 font-medium ${dateClass}`,
    showDate,
    useLongWeek: w >= 2 && h >= 2, // 只有大方块才显示"星期几"全称
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
      class="w-full h-full flex flex-col relative cursor-pointer bg-[#1C1C1E] rounded-[22px] text-white transition-all hover:bg-[#2A2A2C] overflow-hidden group shadow-sm"
      @click.stop="showModal = true"
  >
    <div class="flex-1 w-full select-none" :class="layout.containerClass">

      <div class="flex items-center justify-center font-mono tabular-nums" :class="layout.timeClass">

        <div class="relative overflow-hidden flex items-center justify-center" :class="layout.digitWrapperClass">
          <Transition name="flip" mode="out-in">
            <span :key="hStr">{{ hStr }}</span>
          </Transition>
        </div>

        <span class="mx-0.5 opacity-40 animate-pulse relative -top-[3px]">:</span>

        <div class="relative overflow-hidden flex items-center justify-center" :class="layout.digitWrapperClass">
          <Transition name="flip" mode="out-in">
            <span :key="mStr">{{ mStr }}</span>
          </Transition>
        </div>
      </div>

      <div v-if="layout.showDate" :class="layout.dateClass">
        <span>{{ displayData.date }}</span>
        <span>{{ layout.useLongWeek ? displayData.weekFull : displayData.weekShort }}</span>
      </div>
    </div>

    <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-30 transition-opacity">
      <div class="w-2.5 h-2.5 border-[1.5px] border-white/70 rounded-full"></div>
    </div>

    <Teleport to="body">
      <ClockDetailModal :show="showModal" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>
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

.font-mono {
  font-family: 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}
</style>
