<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import {Solar} from 'lunar-typescript';
import CalendarDetailModal from './CalendarDetailModal.vue';

const props = defineProps<{ item: SiteItem }>();

const now = ref(new Date());
let timer: number;
const showModal = ref(false);

const updateTime = () => {
  now.value = new Date();
};

onMounted(() => {
  timer = window.setInterval(updateTime, 60000);
});
onUnmounted(() => window.clearInterval(timer));

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
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

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
  };
});

type Variant = 'mini' | 'wide' | 'square' | 'tallNarrow' | 'tall' | 'large';

const layout = computed(() => {
  const w = Number(props.item?.w || 2);
  const h = Number(props.item?.h || 2);

  let variant: Variant = 'large';
  if (w === 1 && h === 1) variant = 'mini';
  else if (h === 1 && w >= 2) variant = 'wide';
  else if (w === 2 && h === 2) variant = 'square';
  else if (w === 1 && h === 2) variant = 'tallNarrow';
  else if (w === 1 && h >= 3) variant = 'tall';
  else variant = 'large';

  const preset = {
    mini: {
      headerH: 'h-[30%]',
      headerText: 'text-[11px]',
      dayNum: 'text-4xl mt-0.5',
      showYear: false,
      showDetail: false,
      footer: 'text-[10px]',
      padX: 'px-1',
      bodyPadY: 'py-0.5',
    },
    wide: {
      headerH: 'h-[30%]',
      headerText: 'text-xs',
      dayNum: 'text-4xl -mt-0.5',
      showYear: false,          // 2x1 放弃年，避免挤
      showDetail: false,
      footer: 'text-[11px]',
      padX: 'px-2',
      bodyPadY: 'py-0',
    },
    square: {
      headerH: 'h-[32%]',
      headerText: 'text-sm',
      dayNum: 'text-[52px] -mt-1',
      showYear: true,
      showDetail: true,
      footer: 'text-xs',
      padX: 'px-2',
      bodyPadY: 'py-0.5',
    },
    tallNarrow: {
      headerH: 'h-[26%]',
      headerText: 'text-[11px]',
      dayNum: 'text-[44px] -mt-0.5',
      showYear: false,          // 1x2 太窄，年容易撑出
      showDetail: false,
      footer: 'text-[10px]',
      padX: 'px-1.5',
      bodyPadY: 'py-0.5',
    },
    tall: {
      headerH: 'h-[26%]',
      headerText: 'text-xs',
      dayNum: 'text-[48px] -mt-0.5',
      showYear: true,
      showDetail: true,
      footer: 'text-[11px]',
      padX: 'px-2',
      bodyPadY: 'py-1',
    },
    large: {
      headerH: 'h-[30%]',
      headerText: 'text-sm',
      dayNum: 'text-[56px] -mt-1',
      showYear: true,
      showDetail: true,
      footer: 'text-xs',
      padX: 'px-2.5',
      bodyPadY: 'py-1',
    },
  }[variant];

  return {variant, ...preset};
});
</script>

<template>
  <div class="w-full h-full relative cursor-pointer min-w-0 min-h-0" @click.stop="showModal = true">
    <!--   强裁剪 + 防溢出（和 Weather 一样的兜底） -->
    <div class="cal-card w-full h-full rounded-[18px] overflow-hidden flex flex-col select-none min-w-0 min-h-0">
      <!-- Header -->
      <div class="cal-header flex items-center justify-center min-w-0" :class="[layout.headerH, layout.padX]">
        <span
            class="cal-header-text font-medium tracking-widest whitespace-nowrap truncate min-w-0"
            :class="layout.headerText"
        >
          <span v-if="layout.showYear">{{ displayData.year }}年</span>{{ displayData.month }}月
        </span>
      </div>

      <!-- Body -->
      <div
          class="flex-1 flex flex-col items-center justify-center relative w-full min-w-0 min-h-0"
          :class="[layout.padX, layout.bodyPadY]"
      >
        <div class="cal-daynum font-bold leading-none font-sans tabular-nums" :class="layout.dayNum">
          {{ displayData.day }}
        </div>

        <!-- 详细信息（只在大尺寸出现） -->
        <div
            v-if="layout.showDetail"
            class="cal-sub text-[10px] mt-1 mb-1 whitespace-nowrap truncate max-w-full"
        >
          第{{ displayData.dayOfYear }}天 · 第{{ displayData.weekOfYear }}周
        </div>

        <div
            class="cal-footer font-medium flex items-center gap-1.5 whitespace-nowrap min-w-0 max-w-full"
            :class="[layout.footer, !layout.showDetail ? 'mt-1' : '']"
        >
          <span class="truncate max-w-full">
            {{ displayData.lunarMonth }}{{ displayData.lunarDay }}
          </span>
          <span v-if="layout.showDetail" class="cal-divider shrink-0">|</span>
          <span class="shrink-0">周{{ displayData.week }}</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <CalendarDetailModal :show="showModal" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>
/* =========================================================
     防溢出核心：强裁剪 + 隔离绘制
========================================================= */
.cal-card {
  clip-path: inset(0 round 18px);
  isolation: isolate;
  contain: paint;

  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

/* 让卡片内部稍微有层次 */
:global(html.light) .cal-card {
  background: rgba(255, 255, 255, 0.78);
}

/* 深色底 */
:global(html.dark) .cal-card {
  background: rgba(18, 18, 20, 0.82);
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
}

/* Header */
.cal-header {
  background: rgba(255, 82, 82, 0.86);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

:global(html.dark) .cal-header {
  background: rgba(255, 82, 82, 0.22);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.cal-header-text {
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}

:global(html.dark) .cal-header-text {
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.cal-daynum {
  color: var(--text-primary);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
}

:global(html.dark) .cal-daynum {
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
}

.cal-sub {
  color: var(--text-tertiary);
}

.cal-footer {
  color: var(--text-secondary);
}

.cal-divider {
  color: rgba(0, 0, 0, 0.10);
}

:global(html.dark) .cal-divider {
  color: rgba(255, 255, 255, 0.18);
}
</style>
