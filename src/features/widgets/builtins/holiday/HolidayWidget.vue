<script setup lang="ts">
import {ref, computed, defineAsyncComponent, onMounted, markRaw} from 'vue';
import {useNow} from '@vueuse/core';
import type {SiteItem} from '../../../../core/config/types';
import {
  PhConfetti, PhCalendarStar, PhBalloon, PhAirplaneTilt, PhTreePalm, PhMoonStars, PhSunHorizon, PhTimer
} from '@phosphor-icons/vue';
import {tempStorage} from "../../../../core/storage/tempStorage.ts";
import {fetchJsonWithRetry} from '../../../../shared/utils/network';
import {useToast} from '../../../../shared/composables/useToast';
import {useDeferredWidgetLoad} from '../../../../shared/composables/useDeferredWidgetLoad';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';

const HolidayDetailModal = defineAsyncComponent(() => import('./HolidayDetailModal.vue'));

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const toast = useToast();
const showModal = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 2), h: Number(props.item.h || 2)}));

// 优化：每分钟刷新一次即可，不需要每秒刷新
const now = useNow({interval: 60 * 1000});

interface HolidayItem {
  name: string;
  date: string;
  days: number;
  icon: any;
  color: string;
}

// 使用 markRaw 避免 Vue 响应式代理组件对象，提升性能
const iconMap: Record<string, any> = {
  '元旦': markRaw(PhConfetti),
  '春节': markRaw(PhBalloon),
  '清明': markRaw(PhTreePalm),
  '劳动节': markRaw(PhAirplaneTilt),
  '端午': markRaw(PhSunHorizon),
  '中秋': markRaw(PhMoonStars),
  '国庆': markRaw(PhConfetti)
};

const defaultHolidays: HolidayItem[] = [
  {name: '元旦', date: '2026-01-01', days: 3, icon: markRaw(PhConfetti), color: 'text-yellow-500'},
  {name: '春节', date: '2026-02-17', days: 7, icon: markRaw(PhBalloon), color: 'text-rose-500'},
];

const holidays = ref<HolidayItem[]>(defaultHolidays);

const restoreCachedHolidays = () => {
  const year = new Date().getFullYear();
  const cache = tempStorage.get('holiday');
  if (!cache || cache.year !== year || !tempStorage.isValid(cache.ts, 24 * 60 * 60 * 1000)) return false;
  holidays.value = transformData(cache.data);
  return true;
};

//  核心逻辑：每天只获取一次
const fetchHolidays = async () => {
  const year = new Date().getFullYear();

  // 1. 从统一存储中读取 'holiday' 模块
  const cache = tempStorage.get('holiday');

  // 2. 检查缓存：存在 + 年份匹配 + 未过期 (24小时)
  if (cache && cache.year === year && tempStorage.isValid(cache.ts, 24 * 60 * 60 * 1000)) {
    holidays.value = transformData(cache.data);
    return;
  }

  // 3. 请求 API
  try {
    const urls = [
      `https://timor.tech/api/holiday/year/${year}`,
      `https://timor.tech/api/holiday/year/${year + 1}`
    ];
    const results = await Promise.all(urls.map((url, index) => fetchJsonWithRetry<any>(
        url,
        {cache: 'no-store'},
        {
          timeoutMs: 8000,
          retries: 2,
          retryDelayMs: 500,
          maxRetryDelayMs: 4000,
          metricName: `holiday.year.${index}`,
          fallbackName: 'holiday.cache',
          fallbackData: () => cache?.data && cache.year === year ? {holiday: cache.data} : undefined,
        }
    )));
    const mergedData = { ...results[0].holiday, ...results[1].holiday };

    // 4. 写入统一存储 (只更新 holiday 字段)
    tempStorage.set('holiday', {
      year: year,
      data: mergedData,
      ts: Date.now()
    });

    holidays.value = transformData(mergedData);
  } catch {
    if (cache?.data) {
      holidays.value = transformData(cache.data);
    } else {
      holidays.value = defaultHolidays;
      toast.warning('节假日数据获取失败，已显示默认假期');
    }
  }
};

function transformData(apiData: any): HolidayItem[] {
  const result: HolidayItem[] = [];
  const processed = new Set();

  for (const info of Object.values(apiData) as any[]) {
    if (info.holiday && !processed.has(info.name)) {
      processed.add(info.name);

      let days = 1;
      // 简单估算假期长度
      if (['春节', '国庆节'].includes(info.name)) days = 7;
      else if (['劳动节'].includes(info.name)) days = 5;
      else if (['元旦', '清明', '端午', '中秋'].includes(info.name)) days = 3;

      result.push({
        name: info.name,
        date: info.date,
        days,
        icon: iconMap[info.name] || markRaw(PhCalendarStar),
        color: iconMap[info.name] ? 'text-[var(--accent-color)]' : 'text-[var(--widget-muted)]'
      });
    }
  }
  return result.length ? result : defaultHolidays;
}

onMounted(() => {
  restoreCachedHolidays();
});

useDeferredWidgetLoad(rootEl, fetchHolidays, {
  delayMs: 2200,
  idleTimeoutMs: 7000,
  metricName: 'holiday.initial',
});

const upcomingList = computed(() => {
  const today = now.value;
  return holidays.value.map(h => {
    const hDate = new Date(h.date);
    const diff = hDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return {...h, daysLeft};
  }).filter(h => h.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
});

const nextHoliday = computed(() => upcomingList.value[0] || {
  name: '明年见',
  daysLeft: 0,
  icon: markRaw(PhCalendarStar),
  date: '-',
  days: 0
});

const layout = computed(() => {
  const {w, h} = tileSize.value.placement;
  return {
    is1x1: w === 1 && h === 1,
    is1x2: w === 1 && h >= 2,
    is2x1: w >= 2 && h === 1,
    is2x2: w === 2 && h === 2,
    is2x4: w >= 2 && h >= 3
  };
});
</script>

<template>
  <div
      ref="rootEl"
      class="w-full h-full relative cursor-pointer group rounded-[22px] overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md select-none"
      :class="[
        !isEditMode ? 'cursor-pointer' : 'cursor-move',
        'bg-[var(--widget-surface)] border border-[var(--widget-border)] text-[var(--widget-text)] hover:bg-[var(--widget-surface-2)]'
      ]"
      @click="!isEditMode && (showModal = true)"
  >
    <div class="absolute inset-0 opacity-[0.03] pointer-events-none">
      <component
          :is="nextHoliday.icon"
          weight="duotone"
          class="absolute -right-8 -bottom-8 text-9xl rotate-12 text-[var(--accent-color)]"
      />
    </div>

    <div v-if="layout.is1x1" class="relative w-full h-full flex flex-col items-center justify-center p-2 gap-1">
      <component :is="nextHoliday.icon" weight="duotone" class="text-2xl text-[var(--accent-color)]"/>
      <div class="text-[10px] opacity-60 font-bold truncate max-w-full">{{ nextHoliday.name }}</div>
      <div class="flex items-baseline gap-0.5 leading-none">
        <span class="text-2xl font-black">{{ nextHoliday.daysLeft }}</span>
        <span class="text-[9px] opacity-40 font-bold">天</span>
      </div>
    </div>

    <div v-else-if="layout.is1x2" class="relative w-full h-full flex flex-col p-2 gap-1.5 overflow-hidden">
      <div class="text-[9px] font-bold opacity-50 text-center uppercase tracking-widest shrink-0 mb-0.5">Upcoming</div>
      <div v-for="(h, i) in upcomingList.slice(0, 3)" :key="h.name"
           class="flex-1 min-h-0 w-full rounded-lg flex flex-col justify-center items-center border border-[var(--widget-border)] bg-[var(--widget-surface-2)] px-1 py-0.5"
           :class="i===0 ? 'border-[var(--accent-color)]/30 shadow-sm' : ''">
        <div class="flex items-center gap-1 mb-0.5">
          <component :is="h.icon" weight="fill" class="text-[9px] text-[var(--accent-color)] shrink-0"/>
          <span class="text-[10px] font-bold truncate max-w-[50px] leading-none">{{ h.name }}</span>
        </div>
        <div class="text-[9px] leading-none flex items-baseline gap-0.5">
          <span class="font-black text-xs" :class="i===0 ? 'text-[var(--accent-color)]' : ''">{{ h.daysLeft }}</span>
          <span class="opacity-50 scale-90">天</span>
        </div>
      </div>
    </div>

    <div v-else-if="layout.is2x1" class="relative w-full h-full flex items-center justify-between px-5">
      <div class="flex flex-col justify-center gap-1">
        <div class="flex items-center gap-1.5 text-xs font-bold opacity-70">
          <PhCalendarStar weight="fill" class="text-[var(--accent-color)]"/>
          下一个假期
        </div>
        <div class="text-lg font-black flex items-center gap-2">
          {{ nextHoliday.name }}
          <span class="text-[10px] bg-[var(--widget-border)] px-1.5 py-0.5 rounded-md font-normal opacity-80">
            休{{ nextHoliday.days }}天
          </span>
        </div>
      </div>
      <div class="flex flex-col items-end justify-center">
        <div class="text-3xl font-black text-[var(--accent-color)] leading-none">{{ nextHoliday.daysLeft }}</div>
        <div class="text-[10px] opacity-50 font-bold mr-0.5">Days Left</div>
      </div>
    </div>

    <div v-else-if="layout.is2x2" class="relative w-full h-full p-4 flex flex-col">
      <div class="flex-1 flex flex-col justify-center items-center relative">
        <div class="text-xs font-bold opacity-60 uppercase tracking-widest mb-1">下一个假期</div>

        <div class="text-6xl font-black text-[var(--accent-color)] tracking-tighter leading-none my-1">
          {{ nextHoliday.daysLeft }}
        </div>

        <div class="flex items-center justify-center gap-2 w-full px-1">
          <span class="font-bold text-lg truncate">{{ nextHoliday.name }}</span>
          <span
              class="text-[10px] bg-[var(--accent-color)] text-white px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0">
            休{{ nextHoliday.days }}天
          </span>
        </div>
      </div>

      <div class="h-[1px] w-full bg-[var(--widget-border)] my-2"></div>

      <div class="flex justify-between w-full px-1 gap-2">
        <div v-for="h in upcomingList.slice(1, 3)" :key="h.name" class="flex items-center gap-1.5 opacity-70 min-w-0">
          <component :is="h.icon" weight="fill" class="text-[10px] shrink-0 text-[var(--accent-color)]"/>
          <span class="text-[10px] font-medium truncate whitespace-nowrap">
            {{ h.name }} {{ h.daysLeft }}天
          </span>
        </div>
      </div>
    </div>

    <div v-else class="relative w-full h-full flex items-center p-6 overflow-hidden">
      <div
          class="absolute -left-10 top-0 bottom-0 w-1/2 bg-gradient-to-r from-[var(--widget-surface-2)] to-transparent pointer-events-none opacity-50"></div>

      <div class="w-2/5 h-full flex items-center justify-center relative z-10">
        <component
            :is="nextHoliday.icon"
            weight="duotone"
            class="text-[var(--accent-color)] opacity-20 drop-shadow-lg"
            :class="nextHoliday.days > 3 ? 'text-8xl' : 'text-7xl'"
            style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));"
        />
      </div>

      <div class="w-3/5 h-full flex flex-col justify-center items-start pl-4 z-10">
        <div class="flex items-center gap-1.5 opacity-60 mb-1">
          <PhTimer class="text-[var(--accent-color)]" size="14" weight="fill"/>
          <span class="text-xs font-bold tracking-wider">距离 {{ nextHoliday.name }}</span>
        </div>

        <div class="flex items-baseline gap-2 leading-none mb-3">
          <span class="text-7xl font-black text-[var(--accent-color)] tracking-tighter"
                style="font-variant-numeric: tabular-nums;">
            {{ nextHoliday.daysLeft }}
          </span>
          <span class="text-xl font-bold opacity-40">天</span>
        </div>

        <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--widget-surface-2)] border border-[var(--widget-border)] shadow-sm">
          <span class="text-xs font-bold tabular-nums">{{ nextHoliday.date }}</span>
          <div class="w-1 h-1 rounded-full bg-[var(--widget-text)] opacity-30"></div>
          <span class="text-xs text-[var(--accent-color)] font-bold whitespace-nowrap">连休 {{
              nextHoliday.days
            }} 天</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <HolidayDetailModal
          v-if="showModal"
          :show="showModal"
          :holidays="holidays"
          @close="showModal = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
</style>
