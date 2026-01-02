<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import {Solar} from 'lunar-typescript';
import CalendarDetailModal from './CalendarDetailModal.vue';

const props = defineProps<{ item: SiteItem }>();

// 状态
const now = ref(new Date());
let timer: number;
const showModal = ref(false);

const updateTime = () => {
  now.value = new Date();
};

onMounted(() => {
  timer = setInterval(updateTime, 60000);
});
onUnmounted(() => clearInterval(timer));

// 辅助函数
const getDayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const getWeekOfYear = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// === 1. 计算显示数据 ===
const displayData = computed(() => {
  const solar = Solar.fromDate(now.value);
  const lunar = solar.getLunar();
  const jsDate = now.value;

  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    week: solar.getWeekInChinese(),
    lunarMonth: lunar.getMonthInChinese() + '月',
    lunarDay: lunar.getDayInChinese(),
    dayOfYear: getDayOfYear(jsDate),
    weekOfYear: getWeekOfYear(jsDate),
    ganZhiYear: lunar.getYearInGanZhi(),
    shengXiao: lunar.getYearShengXiao()
  };
});

// === 2. 核心：自适应布局策略 ===
const layout = computed(() => {
  // 默认为 2x2
  const w = props.item.w || 2;
  const h = props.item.h || 2;
  const isMini = w === 1 && h === 1;   // 1x1
  const isWide = w >= 2 && h === 1;    // 2x1, 4x1
  //const isTall = w === 1 && h >= 2;    // 1x2

  return {
    // 头部高度：小卡片头部要矮一点
    headerClass: isMini || isWide ? 'h-[28%]' : 'h-[32%]',

    // 头部文字：1x1时不显示年份，空间不够
    showYear: !isMini,
    headerTextClass: isMini ? 'text-xs' : 'text-sm',

    // 日期数字大小
    dayNumClass: isMini ? 'text-4xl mt-1' : (isWide ? 'text-4xl' : 'text-[52px] -mt-1'),

    // 详情信息 (第x天/第x周)：1x1 和 2x1 都不显示，太挤了
    showDetailInfo: !isMini && !isWide,

    // 农历显示：1x1时字号极小
    footerClass: isMini ? 'text-[10px] scale-90 origin-top' : 'text-xs',

    // 整体内边距
    containerClass: isWide ? 'pb-0 justify-center' : 'pb-1 justify-center'
  };
});
</script>

<template>
  <div class="w-full h-full relative cursor-pointer" @click.stop="showModal = true">

    <div
        class="w-full h-full rounded-[18px] overflow-hidden flex flex-col bg-white shadow-sm select-none transition-all">

      <div
          class="bg-[#FF5252] flex items-center justify-center transition-all"
          :class="layout.headerClass"
      >
        <span
            class="text-white font-medium tracking-widest opacity-95 whitespace-nowrap"
            :class="layout.headerTextClass"
        >
          <span v-if="layout.showYear">{{ displayData.year }}年</span>{{ displayData.month }}月
        </span>
      </div>

      <div class="flex-1 flex flex-col items-center relative w-full px-1" :class="layout.containerClass">

        <div
            class="font-bold text-[#333] leading-none font-sans transition-all"
            :class="layout.dayNumClass"
        >
          {{ displayData.day }}
        </div>

        <div
            v-if="layout.showDetailInfo"
            class="text-[10px] text-gray-400 mt-1 mb-1 transform scale-90 whitespace-nowrap"
        >
          第{{ displayData.dayOfYear }}天 第{{ displayData.weekOfYear }}周
        </div>

        <div
            class="font-medium text-[#555] flex gap-1.5 transition-all whitespace-nowrap"
            :class="[layout.footerClass, !layout.showDetailInfo ? 'mt-1' : '']"
        >
          <span>{{ displayData.lunarMonth }}{{ displayData.lunarDay }}</span>
          <span v-if="!layout.showDetailInfo" class="hidden"></span>
          <span v-else class="text-gray-300">|</span>
          <span>周{{ displayData.week }}</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <CalendarDetailModal :show="showModal" @close="showModal = false"/>
    </Teleport>

  </div>
</template>