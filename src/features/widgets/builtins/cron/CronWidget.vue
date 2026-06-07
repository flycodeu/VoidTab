<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {PhGraph, PhTimer, PhHash, PhHourglass} from '@phosphor-icons/vue';
import CronModal from './CronModal.vue';
import parser from 'cron-parser';
import {useDebounceFn} from '@vueuse/core';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useVisibilityInterval} from '../../../../shared/composables/useVisibilityInterval';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const store = useConfigStore();
const saveDebounced = useDebounceFn(() => store.saveConfig?.(), 300);

// --- Config Check ---
if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.cron) {
  store.config.runtime.cron = {expr: '* * * * * ?', theme: 'pure-white'};
} else {
  store.config.runtime.cron.theme ||= 'pure-white';
  store.config.runtime.cron.expr ||= '* * * * * ?';
}

// --- Cron Helper Functions ---
function normalizeQuartz(expr: string) {
  const parts = (expr || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 6 || parts.length === 7) {
    const dom = parts[3];
    const dow = parts[5];
    if (dom === '?' && dow !== '?') parts[3] = '*';
    if (dow === '?' && dom !== '?') parts[5] = '*';
    if (dom === '?' && dow === '?') {
      parts[3] = '*';
      parts[5] = '*';
    }
    if (parts.length === 7) parts.pop();
    return parts.join(' ');
  }
  return parts.map(p => (p === '?' ? '*' : p)).join(' ');
}

function parseCron(expr: string, opts?: any) {
  const mod: any = parser as any;
  const fn = mod.parseExpression || mod.parse || mod.default?.parseExpression || mod.default?.parse;
  if (!fn) throw new Error('cron-parser parse function not found');
  return fn(expr, opts);
}

// --- State ---
const cronExpression = computed<string>({
  get: () => store.config.runtime.cron.expr ?? '* * * * * ?',
  set: (v) => {
    store.config.runtime.cron.expr = v ?? '';
    saveDebounced();
  },
});

const showModal = ref(false);
const nextRunTime = ref('--:--:--');
const timeToNext = ref('--:--:--');

const calculateNextRun = () => {
  try {
    const expr = normalizeQuartz(cronExpression.value);
    if (!expr) throw new Error('empty expr');

    const interval = parseCron(expr);
    const next = interval.next().toDate();
    const now = new Date();

    nextRunTime.value = next.toLocaleTimeString('zh-CN', {hour12: false});
    const diff = Math.max(0, next.getTime() - now.getTime());

    if (diff > 86400000) {
      const d = Math.floor(diff / 86400000);
      timeToNext.value = `> ${d} DAYS`;
    } else {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      timeToNext.value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  } catch {
    nextRunTime.value = 'ERR';
    timeToNext.value = '--:--';
  }
};

watch(cronExpression, calculateNextRun);

useVisibilityInterval(calculateNextRun, 1000, {immediate: true});

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};

// --- 精细化布局判断 ---
const layout = computed(() => {
  const w = props.item.w || 1;
  const h = props.item.h || 1;
  return {
    isMini: w === 1 && h === 1,       // 1x1
    isWide: w >= 2 && h === 1,        // 2x1, 3x1
    isTall: w === 1 && h >= 2,        // 1x2 (窄高)
    isStandard: w === 2 && h === 2,   // 2x2
    isWideMed: w >= 2 && h === 2,     // 4x2 (宽, 中等高) -> 重点修复
    isTower: w === 2 && h >= 4,       // 2x4 (窄, 很高)
    isLarge: w >= 2 && h >= 3,        // 真正的大尺寸
  };
});
</script>

<template>
  <div
      class="w-full h-full relative overflow-hidden group font-sans rounded-[22px] transition-all duration-300"
      :class="[
        !isEditMode ? 'cursor-pointer' : 'cursor-move',
        'bg-[var(--widget-surface)] text-[var(--widget-text)] border border-[var(--widget-border)] hover:bg-[var(--widget-surface-2)] shadow-sm'
      ]"
      @click="openModal"
  >
    <div v-if="layout.isMini" class="w-full h-full flex flex-col items-center justify-center p-1 gap-0.5">
      <PhTimer :size="18" weight="fill" class="text-orange-500"/>
      <div class="text-[9px] text-[var(--widget-muted)] font-medium leading-none mt-1">倒计时</div>
      <div class="text-[11px] font-bold tabular-nums tracking-tight text-[var(--widget-text)] leading-none">
        {{ timeToNext }}
      </div>
    </div>

    <div v-else-if="layout.isWide && !layout.isWideMed"
         class="w-full h-full flex items-center justify-between px-3 py-1">
      <div class="flex flex-col justify-center min-w-0 flex-1 mr-2">
        <div class="flex items-center gap-1.5 text-orange-500 mb-0.5">
          <PhHash :size="12" weight="bold"/>
          <span class="text-[9px] font-bold tracking-wider opacity-80">CRON</span>
        </div>
        <div
            class="text-[10px] font-mono truncate px-1.5 py-0.5 rounded border border-[var(--widget-border)] bg-[var(--widget-border)] text-[var(--widget-muted)] w-fit max-w-full">
          {{ cronExpression }}
        </div>
      </div>
      <div class="flex flex-col items-end shrink-0">
        <div class="text-[9px] text-[var(--widget-muted)] font-medium">NEXT</div>
        <div class="text-sm font-bold tabular-nums leading-none tracking-tight">{{ timeToNext }}</div>
      </div>
    </div>

    <div v-else-if="layout.isTall" class="w-full h-full flex flex-col p-2">
      <div class="flex justify-center mb-1">
        <div class="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-500">
          <PhHourglass :size="14" weight="fill"/>
        </div>
      </div>

      <div class="flex-1 flex flex-col items-center justify-center min-h-0 gap-1">
        <div class="text-[9px] text-[var(--widget-muted)] font-medium tracking-wide text-center uppercase">Remain</div>
        <div class="text-sm font-bold tabular-nums text-center leading-tight break-all">
          {{ timeToNext }}
        </div>
      </div>

      <div class="mt-auto pt-2 border-t border-[var(--widget-border)] w-full">
        <div class="text-[9px] text-[var(--widget-muted)] text-center mb-0.5">Next</div>
        <div class="text-[10px] font-mono text-center opacity-80">{{ nextRunTime }}</div>
      </div>
    </div>

    <div v-else-if="layout.isStandard" class="w-full h-full flex flex-col p-3 relative">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5">
          <div class="p-1 rounded bg-orange-500 text-white shadow-sm shadow-orange-500/20">
            <PhGraph :size="12" weight="bold"/>
          </div>
          <span class="text-[10px] font-bold opacity-90">调度</span>
        </div>
        <div class="text-[9px] font-mono text-[var(--widget-muted)] bg-[var(--widget-border)] px-1 py-0.5 rounded">
          {{ nextRunTime }}
        </div>
      </div>

      <div class="flex-1 flex flex-col items-center justify-center py-1">
        <div class="text-3xl font-bold tabular-nums tracking-tighter">{{ timeToNext }}</div>
        <div class="text-[10px] text-[var(--widget-muted)] mt-1 font-medium">距离执行</div>
      </div>

      <div class="mt-auto">
        <div
            class="w-full bg-[var(--widget-border)] rounded px-1.5 py-1 flex items-center justify-center border border-[var(--widget-border)]">
          <span class="text-[9px] font-mono text-[var(--widget-muted)] truncate">{{ cronExpression }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="layout.isWideMed && !layout.isLarge" class="w-full h-full flex flex-col px-4 py-3">
      <div class="flex items-center justify-between pb-2 border-b border-[var(--widget-border)]">
        <h3 class="font-bold flex items-center gap-2 text-orange-500 text-sm">
          <PhGraph :size="16" weight="duotone"/>
          <span>MONITOR</span>
        </h3>
        <span
            class="text-[10px] font-mono text-[var(--widget-muted)] px-1.5 py-0.5 bg-[var(--widget-border)] rounded max-w-[120px] truncate">
          {{ cronExpression }}
        </span>
      </div>

      <div class="flex-1 flex flex-col justify-center items-center">
        <div class="text-4xl font-bold tabular-nums tracking-tight leading-none mb-1">{{ timeToNext }}</div>
        <div class="text-[10px] text-[var(--widget-muted)] uppercase tracking-wider">Time Until Execution</div>
      </div>

      <div
          class="mt-2 flex justify-between items-center bg-[var(--widget-border)] px-3 py-1.5 rounded-lg border border-[var(--widget-border)]">
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-[var(--widget-muted)] font-bold">NEXT:</span>
          <span class="text-xs font-bold font-mono">{{ nextRunTime }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="relative flex h-1.5 w-1.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
          </span>
          <span class="text-[9px] font-bold text-green-500">ACTIVE</span>
        </div>
      </div>
    </div>

    <div v-else class="w-full h-full flex flex-col p-5">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--widget-border)]">
        <h3 class="font-bold flex items-center gap-2 text-orange-500">
          <PhGraph :size="20" weight="duotone"/>
          <span>CRON MONITOR</span>
        </h3>
        <span class="text-xs font-mono text-[var(--widget-muted)] px-2 py-1 bg-[var(--widget-border)] rounded">{{
            cronExpression
          }}</span>
      </div>

      <div class="flex-1 flex flex-col justify-center items-center gap-2">
        <div class="text-5xl font-bold tabular-nums tracking-tight">{{ timeToNext }}</div>
        <div class="text-sm text-[var(--widget-muted)] uppercase tracking-[0.2em]">Time Until Execution</div>
      </div>

      <div
          class="mt-auto flex justify-between items-end bg-[var(--widget-border)] p-3 rounded-xl border border-[var(--widget-border)]">
        <div class="flex flex-col">
          <span class="text-[10px] text-[var(--widget-muted)] uppercase font-bold mb-1">Schedule</span>
          <span class="text-sm font-bold font-mono">{{ nextRunTime }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span class="text-[10px] font-bold text-green-500">ACTIVE</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <CronModal
          v-if="showModal"
          :show="showModal"
          @close="showModal = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.tabular-nums {
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
}
</style>
