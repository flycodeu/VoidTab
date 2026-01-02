<script setup lang="ts">
import {computed, ref} from 'vue';
import {Solar, SolarUtil, HolidayUtil} from 'lunar-typescript';
import {PhX, PhCaretLeft, PhCaretRight} from '@phosphor-icons/vue';

// ==========================================================

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

const selectedDate = ref(new Date());
const panelDate = ref(new Date());

const transitionName = ref('slide-up');
const lastWheelTime = ref(0);

const weeks = ['一', '二', '三', '四', '五', '六', '日'];

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

// === 核心逻辑：生成日历网格 ===
const calendarDays = computed(() => {
  const year = panelDate.value.getFullYear();
  const month = panelDate.value.getMonth() + 1;
  const solarUtil = SolarUtil;

  const firstDay = Solar.fromYmd(year, month, 1);
  const week = firstDay.getWeek();
  const preDays = week === 0 ? 6 : week - 1;

  const daysArr = [];
  const daysInPreMonth = solarUtil.getDaysOfMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);

  for (let i = 0; i < preDays; i++) {
    const d = daysInPreMonth - preDays + i + 1;
    daysArr.push({
      day: d,
      type: 'prev',
      date: new Date(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, d)
    });
  }

  const daysInMonth = solarUtil.getDaysOfMonth(year, month);
  for (let i = 1; i <= daysInMonth; i++) {
    daysArr.push({day: i, type: 'current', date: new Date(year, month - 1, i)});
  }

  const remaining = 42 - daysArr.length;
  for (let i = 1; i <= remaining; i++) {
    daysArr.push({day: i, type: 'next', date: new Date(month === 12 ? year + 1 : year, month === 12 ? 0 : month, i)});
  }

  return daysArr.map(item => {
    const solar = Solar.fromDate(item.date);
    const lunar = solar.getLunar();
    const holiday = HolidayUtil.getHoliday(item.date.getFullYear(), item.date.getMonth() + 1, item.date.getDate());

    let isRest = false;
    let isWork = false;

    if (holiday) {
      isWork = holiday.isWork();
      isRest = !isWork;
    }

    let subText = '';
    let isFestival = false;
    const jieQi = lunar.getJieQi();
    const lunarFestivals = lunar.getFestivals();
    const solarFestivals = solar.getFestivals();

    if (jieQi) {
      subText = jieQi;
      isFestival = true;
    } else if (lunarFestivals.length > 0) {
      subText = lunarFestivals[0];
      isFestival = true;
    } else if (solarFestivals.length > 0) {
      subText = solarFestivals[0];
      isFestival = true;
    } else {
      if (item.day === 1) {
        subText = lunar.getMonthInChinese() + '月';
      } else {
        subText = lunar.getDayInChinese();
      }
    }

    return {
      ...item,
      solar,
      lunar,
      subText,
      isRest,
      isWork,
      isFestival,
      isToday: solar.toYmd() === Solar.fromDate(new Date()).toYmd(),
      isSelected: solar.toYmd() === Solar.fromDate(selectedDate.value).toYmd()
    };
  });
});

const detail = computed(() => {
  const solar = Solar.fromDate(selectedDate.value);
  const lunar = solar.getLunar();
  const jsDate = selectedDate.value;
  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    week: solar.getWeekInChinese(),
    lunarStr: `${lunar.getYearInGanZhi()}(${lunar.getYearShengXiao()})年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    weekOfYear: getWeekOfYear(jsDate),
    dayOfYear: getDayOfYear(jsDate),
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    xiang: lunar.getYueXiang(),
    wuhou: lunar.getWuHou()
  };
});

const changeMonth = (delta: number) => {
  transitionName.value = delta > 0 ? 'slide-up' : 'slide-down';
  const d = new Date(panelDate.value);
  d.setMonth(d.getMonth() + delta);
  panelDate.value = d;
};

const selectDay = (item: any) => {
  selectedDate.value = item.date;
  if (item.type === 'prev') changeMonth(-1);
  if (item.type === 'next') changeMonth(1);
};

const handleWheel = (e: WheelEvent) => {
  const now = Date.now();
  if (now - lastWheelTime.value < 250) return;
  if (e.deltaY === 0) return;

  lastWheelTime.value = now;

  if (e.deltaY > 0) {
    changeMonth(1);
  } else {
    changeMonth(-1);
  }
};
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">

      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default" @click="emit('close')"></div>

      <div
          class="relative w-[900px] h-[600px] bg-[#FDFDFD] rounded-2xl shadow-2xl flex overflow-hidden text-[#333]"
          @wheel.prevent.stop="handleWheel"
      >

        <button
            class="absolute top-4 right-4 z-50 p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition cursor-pointer"
            @click="emit('close')"
        >
          <PhX size="20"/>
        </button>

        <div class="flex-1 p-8 border-r border-gray-100 flex flex-col relative h-full">
          <div class="flex items-center gap-4 mb-6 relative z-10">
            <div class="flex items-center bg-gray-100 rounded-lg p-1">
              <button @click="changeMonth(-1)" class="p-1 hover:bg-white rounded shadow-sm transition active:scale-95">
                <PhCaretLeft/>
              </button>
              <span class="px-4 font-bold text-lg select-none w-32 text-center">{{
                  panelDate.getFullYear()
                }}年 {{ panelDate.getMonth() + 1 }}月</span>
              <button @click="changeMonth(1)" class="p-1 hover:bg-white rounded shadow-sm transition active:scale-95">
                <PhCaretRight/>
              </button>
            </div>
            <button class="text-xs bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition"
                    @click="panelDate = new Date(); selectedDate = new Date()">回到今天
            </button>
          </div>

          <div class="grid grid-cols-7 mb-2 relative z-10">
            <div v-for="w in weeks" :key="w" class="text-center text-sm font-medium text-gray-400 py-2">{{ w }}</div>
          </div>

          <div class="flex-1 relative overflow-hidden">
            <Transition :name="transitionName">
              <div
                  :key="panelDate.toISOString()"
                  class="grid grid-cols-7 gap-2 absolute inset-0 w-full h-full"
              >
                <div
                    v-for="item in calendarDays"
                    :key="item.solar.toYmd()"
                    @click="selectDay(item)"
                    class="relative flex flex-col items-center justify-center rounded-lg cursor-pointer transition-colors border-2 border-transparent"
                    :class="[
                       item.isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50',
                       item.type !== 'current' ? 'opacity-30 grayscale' : ''
                     ]"
                >
                  <div class="text-lg font-bold" :class="{'text-blue-600': item.isToday}">{{ item.day }}</div>

                  <div class="text-[10px]"
                       :class="[
                             item.isFestival || item.isRest ? 'text-red-500 font-bold' : (item.isWork ? 'text-gray-600' : 'text-gray-400')
                           ]">
                    {{ item.subText }}
                  </div>

                  <div v-if="item.isRest"
                       class="absolute top-1 right-1 text-[8px] bg-red-100 text-red-500 px-1 rounded scale-90 font-bold">
                    休
                  </div>
                  <div v-if="item.isWork"
                       class="absolute top-1 right-1 text-[8px] bg-gray-200 text-gray-600 px-1 rounded scale-90 font-bold">
                    班
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <div class="w-[320px] bg-[#FAFAFA] p-8 flex flex-col z-10 relative">
          <div class="text-center mb-6">
            <div class="text-sm text-gray-500 mb-2">{{ detail.year }}-{{
                String(detail.month).padStart(2, '0')
              }}-{{ String(detail.day).padStart(2, '0') }} {{ detail.week }}
            </div>
            <div
                class="w-full aspect-square bg-blue-500 rounded-2xl shadow-lg shadow-blue-500/30 flex flex-col items-center justify-center text-white mb-4">
              <div class="text-8xl font-bold tracking-tighter select-all">{{ detail.day }}</div>
              <div class="opacity-80 mt-2">{{ detail.lunarStr.split(' ')[1] }}</div>
            </div>

            <div class="space-y-1 text-center text-gray-600">
              <div>{{ detail.lunarStr.split(' ')[0] }}</div>
              <div class="text-xs opacity-60">本年第{{ detail.weekOfYear }}周，第{{ detail.dayOfYear }}天</div>
            </div>
          </div>

          <div class="space-y-4">
            <div class="flex gap-2">
              <div class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold shrink-0 h-fit">宜</div>
              <div class="text-xs leading-5 text-gray-600 line-clamp-3 text-left">{{ detail.yi.join('，') }}</div>
            </div>
            <div class="flex gap-2">
              <div class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold shrink-0 h-fit">忌</div>
              <div class="text-xs leading-5 text-gray-600 line-clamp-3 text-left">{{ detail.ji.join('，') }}</div>
            </div>
          </div>

          <div class="mt-auto flex justify-between text-xs text-gray-400 pt-4 border-t border-gray-200">
            <span>月相: {{ detail.xiang }}</span>
            <span>{{ detail.wuhou }}</span>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 滑动动画 */
.slide-up-enter-active,
.slide-up-leave-active,
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(-30%);
  opacity: 0;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(30%);
  opacity: 0;
}
</style>