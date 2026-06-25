<script setup lang="ts">
import {ref, computed, onMounted, defineAsyncComponent} from 'vue';
import {useNow} from '@vueuse/core';
import type {SiteItem} from '../../../../core/config/types.ts';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';
import {
  PhCalendarHeart, PhTrendUp, PhPiggyBank, PhSparkle
} from '@phosphor-icons/vue';

// 异步加载弹窗
const SalaryDetailModal = defineAsyncComponent(() => import('./SalaryDetailModal.vue'));

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 2), h: Number(props.item.h || 2)}));

// === 核心状态 ===
const showModal = ref(false);
const now = useNow();

// 默认配置
const config = ref({
  baseSalary: 10000,
  payDay: 15,
  currency: '¥'
});

const CACHE_KEY = `widget_salary_${props.item.id}`;
const loadConfig = () => {
  const saved = localStorage.getItem(CACHE_KEY);
  if (saved) config.value = JSON.parse(saved);
};

onMounted(loadConfig);

// === 计算逻辑 ===
const calculation = computed(() => {
  const currentYear = now.value.getFullYear();
  const currentMonth = now.value.getMonth();
  const currentDay = now.value.getDate();
  const {payDay, baseSalary} = config.value;

  let targetYear = currentYear;
  let targetMonth = currentMonth;

  if (currentDay > payDay) {
    targetMonth++;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear++;
    }
  }

  const nextPayDate = new Date(targetYear, targetMonth, payDay);
  const diffTime = nextPayDate.getTime() - now.value.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const monthsPaid = currentDay >= payDay ? currentMonth + 1 : currentMonth;
  const ytdTotal = monthsPaid * baseSalary;

  const prevPayMonth = targetMonth - 1;
  const prevPayDate = new Date(targetYear, prevPayMonth, payDay);
  const totalPeriod = nextPayDate.getTime() - prevPayDate.getTime();
  const elapsed = now.value.getTime() - prevPayDate.getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / totalPeriod) * 100));

  return {
    nextPayDate,
    daysLeft: daysLeft < 0 ? 0 : daysLeft,
    ytdTotal,
    progress,
    isPayDay: daysLeft === 0
  };
});

// === 布局判断 ===
const layout = computed(() => {
  const {w, h} = tileSize.value.placement;
  return {
    isMini: w === 1 && h === 1,      // 1x1
    isVertical: w === 1 && h >= 2,   // 1x2
    isWide: w >= 2 && h === 1,       // 2x1
    isSquare: w === 2 && h === 2,    // 2x2
    isTall: w === 2 && h >= 3        // 2x4
  };
});

// 计算图标大小：Mini用60，Tall用100，其他大尺寸用140
const iconSize = computed(() => {
  if (layout.value.isMini) return 60;
  if (layout.value.isTall) return 100; // 针对 2x4 调小图标
  return 140;
});

const handleSave = (newConfig: any) => {
  config.value = newConfig;
  localStorage.setItem(CACHE_KEY, JSON.stringify(newConfig));
};
</script>

<template>
  <div class="w-full h-full relative cursor-pointer group" @click="!isEditMode && (showModal = true)">

    <div
        class="w-full h-full rounded-[22px] overflow-hidden relative text-[#5d3a3a] transition-all duration-300 border border-white/20 shadow-sm hover:shadow-md select-none"
        :class="[
        calculation.isPayDay
          ? 'bg-gradient-to-br from-yellow-200 to-orange-100'
          : 'bg-gradient-to-br from-rose-100 via-pink-50 to-white'
      ]"
    >
      <PhPiggyBank
          weight="duotone"
          class="absolute -bottom-6 -right-6 text-pink-200/50 rotate-12 pointer-events-none transition-transform group-hover:scale-110"
          :size="iconSize"
      />

      <div v-if="layout.isMini" class="w-full h-full flex flex-col items-center justify-center p-2 text-center">
        <div class="text-[10px] opacity-60 font-bold uppercase tracking-wide">Days Left</div>
        <div class="text-3xl font-black text-rose-500 leading-none my-1">
          {{ calculation.daysLeft }}
        </div>
        <div class="w-8 h-1 bg-black/5 rounded-full mt-1 overflow-hidden">
          <div class="h-full bg-rose-400" :style="{ width: `${calculation.progress}%` }"></div>
        </div>
      </div>

      <div v-else-if="layout.isVertical" class="w-full h-full flex flex-col items-center justify-between py-4 px-2">
        <div class="flex flex-col items-center gap-1">
          <PhCalendarHeart weight="fill" class="text-rose-400 opacity-80" size="20"/>
          <span class="text-[10px] font-bold opacity-50">倒计时</span>
        </div>

        <div class="flex flex-col items-center">
          <span class="text-5xl font-black text-rose-500 leading-none">{{ calculation.daysLeft }}</span>
          <span class="text-xs font-bold opacity-40 mt-1">天</span>
        </div>

        <div class="w-3 h-12 bg-white/50 rounded-full overflow-hidden border border-white/30 relative">
          <div class="absolute bottom-0 w-full bg-rose-400 transition-all duration-1000"
               :style="{ height: `${calculation.progress}%` }"></div>
        </div>
      </div>

      <div v-else-if="layout.isWide" class="w-full h-full flex items-center justify-between px-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/50 rounded-full flex items-center justify-center shadow-sm text-rose-500">
            <span class="text-xl font-black">{{ calculation.daysLeft }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-bold opacity-70">距离发薪</span>
            <span class="text-[10px] opacity-50">{{
                calculation.nextPayDate.getMonth() + 1
              }}/{{ calculation.nextPayDate.getDate() }}</span>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <div class="text-sm font-bold opacity-90">
            {{ config.currency }}{{ config.baseSalary.toLocaleString() }}
          </div>
          <div class="w-16 h-1.5 bg-black/5 rounded-full mt-1 overflow-hidden">
            <div class="h-full bg-rose-400" :style="{ width: `${calculation.progress}%` }"></div>
          </div>
        </div>
      </div>

      <div v-else-if="layout.isSquare" class="w-full h-full p-3 flex flex-col justify-between relative z-10">
        <div class="flex justify-between items-start">
          <div
              class="flex items-center gap-1.5 bg-white/40 px-2 py-0.5 rounded-lg backdrop-blur-sm border border-white/20">
            <span class="text-[10px] font-bold opacity-70">发薪倒计时</span>
          </div>
          <PhSparkle weight="fill" class="text-yellow-400 animate-bounce" size="16" v-if="calculation.daysLeft <= 3"/>
        </div>

        <div class="flex flex-col items-center justify-center -mt-2">
          <span class="font-black text-rose-500 tracking-tighter drop-shadow-sm leading-none"
                :class="calculation.daysLeft > 99 ? 'text-5xl' : 'text-6xl'">
            {{ calculation.daysLeft }}<span class="text-base text-[#5d3a3a] font-bold opacity-40 ml-1">天</span>
          </span>
          <div class="text-[10px] font-medium opacity-50 mt-1">
            {{ calculation.nextPayDate.getMonth() + 1 }}月{{ calculation.nextPayDate.getDate() }}日
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="w-full bg-white/30 h-2 rounded-full overflow-hidden border border-white/20">
            <div class="h-full bg-gradient-to-r from-rose-300 to-rose-500 rounded-full transition-all duration-1000"
                 :style="{ width: `${calculation.progress}%` }">
            </div>
          </div>

          <div class="flex justify-between items-center px-1">
            <span class="text-[10px] opacity-50">本月进度 {{ Math.round(calculation.progress) }}%</span>
            <span class="text-xs font-bold text-rose-600 font-mono">{{
                config.currency
              }}{{ config.baseSalary.toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <div v-else class="w-full h-full p-3 flex flex-col justify-between relative z-10">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2 bg-white/60 px-2 py-1 rounded-lg backdrop-blur-sm">
            <PhCalendarHeart weight="fill" class="text-rose-500"/>
            <span class="text-xs font-bold opacity-80">搬砖倒计时</span>
          </div>
        </div>

        <div class="flex flex-col items-center justify-center flex-1 min-h-0">
          <div class="relative">
            <span class="text-6xl font-black text-rose-500 tracking-tighter drop-shadow-sm leading-none">
              {{ calculation.daysLeft }}
            </span>
            <span class="absolute -right-5 bottom-2 text-base font-bold opacity-50">天</span>
          </div>
          <div class="text-xs font-medium opacity-60 mt-1 bg-white/30 px-3 py-0.5 rounded-full">
            目标日: {{ calculation.nextPayDate.getMonth() + 1 }}月{{ calculation.nextPayDate.getDate() }}日
          </div>
        </div>

        <div class="flex flex-col gap-2 bg-white/30 p-2.5 rounded-xl border border-white/20">
          <div class="w-full bg-black/5 h-1.5 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-rose-400 to-rose-600"
                 :style="{ width: `${calculation.progress}%` }"></div>
          </div>

          <div class="flex justify-between items-center text-xs">
            <div class="flex flex-col">
              <span class="opacity-50 text-[9px]">本月预计</span>
              <span class="font-bold text-rose-700">{{ config.currency }}{{ config.baseSalary.toLocaleString() }}</span>
            </div>
            <div class="h-5 w-[1px] bg-black/5"></div>
            <div class="flex flex-col items-end">
              <span class="opacity-50 text-[9px]">今年累计</span>
              <span class="font-bold flex items-center gap-1">
                <PhTrendUp weight="bold" class="text-green-600" size="14"/>
                {{ config.currency }}{{ (calculation.ytdTotal / 10000).toFixed(2) }}w
              </span>
            </div>
          </div>
        </div>

        <div class="mt-1 text-center">
          <p class="text-[9px] text-[#5d3a3a]/50 italic leading-tight">
            “打工人的快乐，就是每个月的那一天✨”
          </p>
        </div>
      </div>

    </div>

    <Teleport to="body">
      <SalaryDetailModal
          v-if="showModal"
          :show="showModal"
          :config="config"
          :calculation="calculation"
          @close="showModal = false"
          @save="handleSave"
      />
    </Teleport>
  </div>
</template>
