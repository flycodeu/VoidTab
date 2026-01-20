<script setup lang="ts">
import {ref, reactive, computed} from 'vue';
import {onClickOutside, useDebounceFn} from '@vueuse/core';
import {
  PhX, PhCopy, PhClockCounterClockwise, PhPaintBucket,
  PhWarning, PhCaretDown, PhPencilSimple
} from '@phosphor-icons/vue';
import cronstrue from 'cronstrue/i18n';
import parser from 'cron-parser';

defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

import {useConfigStore} from '../../../../stores/useConfigStore';

const store = useConfigStore();

//   runtime/cron 兜底
if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.cron) {
  store.config.runtime.cron = {expr: '* * * * * ?', theme: 'pure-white'};
} else {
  store.config.runtime.cron.theme ||= 'pure-white';
  store.config.runtime.cron.expr ||= '* * * * * ?';
}


const saveDebounced = useDebounceFn(() => store.saveConfig?.(), 300);

// ===== Quartz normalize（parser/cronstrue 都用这个）=====
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

    if (parts.length === 7) parts.pop(); // drop year for parser
    return parts.join(' ');
  }

  return parts.map(p => (p === '?' ? '*' : p)).join(' ');
}

function parseCron(expr: string, opts?: any) {
  const mod: any = parser as any;
  const fn =
      mod.parseExpression ||
      mod.parse ||
      mod.default?.parseExpression ||
      mod.default?.parse;

  if (!fn) throw new Error('cron-parser parse function not found');
  return fn(expr, opts);
}

// === store 绑定（带保存）===
const storedCron = computed<string>({
  get: () => store.config.runtime.cron.expr ?? '* * * * * ?',
  set: (v) => {
    store.config.runtime.cron.expr = v ?? '';
    saveDebounced();
  },
});

const currentTheme = computed<string>({
  get: () => store.config.runtime.cron.theme ?? 'pure-white',
  set: (v) => {
    store.config.runtime.cron.theme = v;
    saveDebounced();
  },
});

const inputError = ref('');

// === 主题逻辑 ===
const showThemeMenu = ref(false);
const themeMenuRef = ref<HTMLElement | null>(null);
onClickOutside(themeMenuRef, () => (showThemeMenu.value = false));

const themes = [
  {id: 'pure-white', name: '纯净白 (Pure White)', color: '#ffffff'},
  {id: 'soft-dark', name: '柔和黑 (Soft Dark)', color: '#374151'},
];

const themeClass = computed(() => `theme-${currentTheme.value}`);
const selectTheme = (id: string) => {
  currentTheme.value = id;
  showThemeMenu.value = false;
};

// === 配置状态 ===
const config = reactive({
  second: {type: 'specific', start: 0, step: 1, specific: [0] as number[]},
  minute: {type: 'every', start: 0, step: 1, specific: [] as number[]},
  hour: {type: 'every', start: 0, step: 1, specific: [] as number[]},
  day: {type: 'every', start: 1, step: 1, specific: [] as number[], last: false},
  month: {type: 'every', start: 1, step: 1, specific: [] as number[]},
  week: {type: 'every', start: 1, step: 1, specific: [] as number[]},
  year: {type: 'every', start: 2024, step: 1, specific: [] as number[]}
});

// === 辅助逻辑 ===
const toggleSpecific = (list: number[], val: number) => {
  const idx = list.indexOf(val);
  if (idx > -1) list.splice(idx, 1);
  else list.push(val);

  const tab = activeTab.value;
  config[tab].type = 'specific';
  generateCron();
};

const onOptionChange = (tab: string) => {
  if (tab !== 'second' && config.second.type === 'every') {
    config.second.type = 'specific';
    config.second.specific = [0];
  }
  generateCron();
};

const generateCron = () => {
  const parsePart = (c: any, defaultVal = '*') => {
    switch (c.type) {
      case 'every':
        return defaultVal;
      case 'start':
        return `${c.start}/${c.step}`;
      case 'specific':
        return c.specific.length > 0 ? c.specific.sort((a: number, b: number) => a - b).join(',') : defaultVal;
      case 'last':
        return 'L';
      default:
        return defaultVal;
    }
  };

  const s = parsePart(config.second);
  const m = parsePart(config.minute);
  const h = parsePart(config.hour);
  const mo = parsePart(config.month);

  let d = parsePart(config.day);
  let w = parsePart(config.week, '?');

  // Quartz 互斥逻辑：dom / dow
  if (config.week.type !== 'every') {
    d = '?';
    w = parsePart(config.week);
  } else {
    w = '?';
    d = config.day.type === 'every' ? '*' : d;
  }

  const y = config.year.type === 'every' ? '' : parsePart(config.year);
  const newCron = `${s} ${m} ${h} ${d} ${mo} ${w} ${y}`.trim();

  if (storedCron.value !== newCron) {
    storedCron.value = newCron;
    inputError.value = '';
  }
};

const parseCronToUI = (val: string) => {
  // 你目前写的是“简化版”，这里保留：至少别把错误状态卡死
  console.log(val);
  inputError.value = '';
};

const handleManualInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  storedCron.value = val;
  parseCronToUI(val);
};

// === 预测逻辑：10 次 ===
const nextRunTimes = computed(() => {
  if (!storedCron.value) return [];
  try {
    const expr = normalizeQuartz(storedCron.value);
    const interval = parseCron(expr, {currentDate: new Date()});

    const dates: Date[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        dates.push(interval.next().toDate());
      } catch {
        break;
      }
    }
    inputError.value = '';
    return dates;
  } catch {
    inputError.value = 'Cron 表达式格式错误';
    return [];
  }
});

const humanReadable = computed(() => {
  const raw = storedCron.value;
  if (!raw) return '...';
  try {
    // cronstrue 对 '?' 不一定友好，失败就用 normalize 后解释
    return cronstrue.toString(raw, {locale: 'zh_CN', use24HourTimeFormat: true});
  } catch {
    try {
      return cronstrue.toString(normalizeQuartz(raw), {locale: 'zh_CN', use24HourTimeFormat: true});
    } catch {
      return '...';
    }
  }
});

const copyToClipboard = () => {
  navigator.clipboard.writeText(storedCron.value);
};

// 日期格式化
const formatDateParts = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return {
    ymd: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    weekday: weekDays[date.getDay()],
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  };
};

type TabKey = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'week' | 'year';

const tabs = ['second', 'minute', 'hour', 'day', 'month', 'week', 'year'] as const;

const activeTab = ref<TabKey>('second');

const tabLabel: Record<TabKey, string> = {
  second: '秒',
  minute: '分',
  hour: '时',
  day: '日',
  month: '月',
  week: '周',
  year: '年',
};

</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" :class="themeClass">
      <div class="absolute inset-0 bg-black/50 transition-opacity" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-6xl h-[85vh] flex rounded-xl shadow-2xl overflow-hidden transition-colors duration-200 panel-bg border-theme font-sans">

        <div class="flex-1 flex flex-col min-w-0 bg-theme-panel border-r border-theme-border">
          <div
              class="flex items-center px-4 border-b border-theme-border select-none overflow-x-auto gap-1 bg-theme-header">
            <button
                v-for="tab in tabs"
                :key="tab"
                @click="activeTab = tab"
                class="px-6 py-4 text-sm font-medium tracking-wide transition-all border-b-2 whitespace-nowrap"
                :class="activeTab === tab
                 ? 'border-theme-accent text-theme-accent bg-theme-active font-bold'
                   : 'border-transparent text-theme-text-dim hover:text-theme-text hover:bg-theme-hover'"
            >
              {{ tabLabel[tab] }}
            </button>

          </div>

          <div class="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
            <div class="max-w-4xl mx-auto space-y-6 text-theme-text text-sm">

              <div v-if="activeTab === 'second'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.second.type"
                                                @change="onOptionChange('second')"><span>每秒</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.second.type"
                                                @change="onOptionChange('second')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.second.start"
                                                                             min="0" max="59" class="input-box"><span>秒开始，每</span><input
                      type="number" v-model="config.second.step" min="1" max="59"
                      class="input-box"><span>秒执行一次</span></div>
                </label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.second.type"
                                                          class="mt-1" @change="onOptionChange('second')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定秒数</div>
                    <div class="grid grid-cols-10 gap-2">
                      <button v-for="i in 60" :key="i-1" @click="toggleSpecific(config.second.specific, i-1)"
                              class="num-btn" :class="{ active: config.second.specific.includes(i-1) }">{{ i - 1 }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'minute'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.minute.type"
                                                @change="onOptionChange('minute')"><span>每分钟</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.minute.type"
                                                @change="onOptionChange('minute')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.minute.start"
                                                                             min="0" max="59" class="input-box"><span>分开始，每</span><input
                      type="number" v-model="config.minute.step" min="1" max="59"
                      class="input-box"><span>分执行一次</span></div>
                </label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.minute.type"
                                                          class="mt-1" @change="onOptionChange('minute')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定分钟</div>
                    <div class="grid grid-cols-10 gap-2">
                      <button v-for="i in 60" :key="i-1" @click="toggleSpecific(config.minute.specific, i-1)"
                              class="num-btn" :class="{ active: config.minute.specific.includes(i-1) }">{{ i - 1 }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'hour'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.hour.type"
                                                @change="onOptionChange('hour')"><span>每小时</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.hour.type"
                                                @change="onOptionChange('hour')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.hour.start"
                                                                             min="0" max="23" class="input-box"><span>时开始，每</span><input
                      type="number" v-model="config.hour.step" min="1" max="23"
                      class="input-box"><span>小时执行一次</span></div>
                </label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.hour.type"
                                                          class="mt-1" @change="onOptionChange('hour')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定小时</div>
                    <div class="grid grid-cols-12 gap-2">
                      <button v-for="i in 24" :key="i-1" @click="toggleSpecific(config.hour.specific, i-1)"
                              class="num-btn" :class="{ active: config.hour.specific.includes(i-1) }">{{ i - 1 }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'day'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.day.type"
                                                @change="onOptionChange('day')"><span>每日</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.day.type"
                                                @change="onOptionChange('day')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.day.start"
                                                                             min="1" max="31" class="input-box"><span>日开始，每</span><input
                      type="number" v-model="config.day.step" min="1" max="31" class="input-box"><span>天执行一次</span>
                  </div>
                </label>
                <label class="radio-row"><input type="radio" value="last" v-model="config.day.type"
                                                @change="onOptionChange('day')"><span>本月最后一天 (L)</span></label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.day.type"
                                                          class="mt-1" @change="onOptionChange('day')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定日期</div>
                    <div class="grid grid-cols-10 gap-2">
                      <button v-for="i in 31" :key="i" @click="toggleSpecific(config.day.specific, i)" class="num-btn"
                              :class="{ active: config.day.specific.includes(i) }">{{ i }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'month'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.month.type"
                                                @change="onOptionChange('month')"><span>每月</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.month.type"
                                                @change="onOptionChange('month')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.month.start"
                                                                             min="1" max="12" class="input-box"><span>月开始，每</span><input
                      type="number" v-model="config.month.step" min="1" max="12"
                      class="input-box"><span>月执行一次</span></div>
                </label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.month.type"
                                                          class="mt-1" @change="onOptionChange('month')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定月份</div>
                    <div class="grid grid-cols-6 gap-2">
                      <button v-for="i in 12" :key="i" @click="toggleSpecific(config.month.specific, i)" class="num-btn"
                              :class="{ active: config.month.specific.includes(i) }">{{ i }}月
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'week'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.week.type"
                                                @change="onOptionChange('week')"><span>每周</span></label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.week.type"
                                                          class="mt-1" @change="onOptionChange('week')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定周几</div>
                    <div class="grid grid-cols-7 gap-2">
                      <button v-for="(d, idx) in ['周日','周一','周二','周三','周四','周五','周六']" :key="idx"
                              @click="toggleSpecific(config.week.specific, idx+1)" class="num-btn"
                              :class="{ active: config.week.specific.includes(idx+1) }">{{ d }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'year'" class="space-y-5 animate-fade-in">
                <label class="radio-row"><input type="radio" value="every" v-model="config.year.type"
                                                @change="onOptionChange('year')"><span>每年 (可选)</span></label>
                <label class="radio-row"><input type="radio" value="start" v-model="config.year.type"
                                                @change="onOptionChange('year')">
                  <div class="flex items-center gap-2"><span>从</span><input type="number" v-model="config.year.start"
                                                                             min="2024" max="2099"
                                                                             class="input-box"><span>年开始，每</span><input
                      type="number" v-model="config.year.step" min="1" max="10"
                      class="input-box"><span>年执行一次</span></div>
                </label>
                <div class="radio-row items-start"><input type="radio" value="specific" v-model="config.year.type"
                                                          class="mt-1" @change="onOptionChange('year')">
                  <div class="flex-1">
                    <div class="mb-2 opacity-80 font-bold">指定年份</div>
                    <div class="grid grid-cols-5 gap-2">
                      <button v-for="i in 10" :key="i" @click="toggleSpecific(config.year.specific, 2023+i)"
                              class="num-btn" :class="{ active: config.year.specific.includes(2023+i) }">{{ 2023 + i }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div class="p-6 border-t border-theme-border bg-theme-contrast">
            <div class="flex justify-between items-center mb-2 text-xs text-theme-text-dim">
                <span class="font-bold flex items-center gap-2">
                  <PhPencilSimple/> 可编辑表达式
                </span>
              <span :class="inputError ? 'text-red-500 font-bold' : ''">{{ inputError || humanReadable }}</span>
            </div>
            <div class="relative group">
              <input
                  :value="storedCron"
                  @input="handleManualInput"
                  type="text"
                  class="w-full bg-theme-input border border-theme-border rounded-md p-3 text-lg font-mono font-bold tracking-widest text-theme-accent outline-none focus:border-theme-accent transition-colors shadow-sm"
                  :class="{ 'border-red-500 text-red-500': inputError }"
              />
              <button @click="copyToClipboard"
                      class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-theme-hover text-theme-text-dim hover:text-theme-accent transition-colors">
                <PhCopy size="20"/>
              </button>
            </div>
          </div>
        </div>

        <div class="w-80 flex flex-col bg-theme-sidebar z-10 relative transition-colors duration-200">

          <div
              class="p-4 border-b border-theme-border flex justify-between items-center select-none h-[65px] bg-theme-header">
            <div
                @click="showThemeMenu = !showThemeMenu"
                class="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-md hover:bg-theme-hover transition-colors relative"
            >
              <PhPaintBucket size="16" class="text-theme-text-dim" weight="fill"/>
              <span class="text-xs font-bold text-theme-text">{{ themes.find(t => t.id === currentTheme)?.name }}</span>
              <PhCaretDown size="12" class="text-theme-text-dim" :class="{ 'rotate-180': showThemeMenu }"/>

              <div v-if="showThemeMenu"
                   class="absolute top-full left-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 overflow-hidden animate-slide-down">
                <div
                    v-for="t in themes"
                    :key="t.id"
                    @click.stop="selectTheme(t.id)"
                    class="px-4 py-2.5 text-xs hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-100 last:border-0 text-gray-700"
                    :class="{'font-bold text-blue-600 bg-blue-50': currentTheme === t.id}"
                >
                  <div class="w-2.5 h-2.5 rounded-full border border-gray-200" :style="{ background: t.color }"></div>
                  <span>{{ t.name }}</span>
                </div>
              </div>
            </div>

            <button @click="emit('close')"
                    class="p-1.5 hover:bg-theme-hover rounded-full transition-colors text-theme-text-dim hover:text-theme-text">
              <PhX size="18"/>
            </button>
          </div>

          <div class="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <div class="flex items-center gap-2 mb-6 text-theme-text">
              <PhClockCounterClockwise size="16" weight="bold" class="text-theme-accent"/>
              <h3 class="font-bold tracking-wide uppercase text-xs">Future Schedule</h3>
            </div>

            <div v-if="nextRunTimes.length > 0" class="space-y-4 relative pl-4">
              <div class="absolute left-[7px] top-2 bottom-2 w-[2px] bg-theme-border rounded-full"></div>

              <div v-for="(date, idx) in nextRunTimes" :key="idx" class="relative pl-6 group">
                <div
                    class="absolute left-0 top-[8px] w-4 h-4 rounded-full bg-theme-sidebar border-[3px] border-theme-text-dim group-hover:border-theme-accent transition-colors z-10"></div>

                <div
                    class="flex flex-col bg-theme-input p-3 rounded-md border border-transparent group-hover:border-theme-border group-hover:shadow-sm transition-all">
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] uppercase font-bold text-theme-text-dim tracking-wider">Run #{{
                        idx + 1
                      }}</span>
                    <span class="text-[10px] text-theme-text-dim">{{ formatDateParts(date).weekday }}</span>
                  </div>

                  <div class="flex items-baseline gap-2">
                    <span class="text-lg font-mono font-bold text-theme-text tabular-nums tracking-tight">{{
                        formatDateParts(date).time
                      }}</span>
                    <span class="text-xs text-theme-text-dim font-medium">{{ formatDateParts(date).ymd }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="flex flex-col items-center justify-center h-40 text-red-500 opacity-80 text-xs">
              <PhWarning size="32" class="mb-2"/>
              <span>{{ inputError || 'Invalid Expression' }}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ================= 纯净配色 (无模糊/无光晕) ================= */

/* 1. 纯净白 (Pure White) */
.theme-pure-white {
  --bg-panel: #ffffff;
  --bg-sidebar: #f9fafb;
  --bg-header: #ffffff;
  --bg-contrast: #f9fafb;
  --text-text: #111827;
  --text-dim: #6b7280;
  --text-accent: #2563eb;
  --border-color: #e5e7eb;
  --hover-bg: #f3f4f6;
  --input-bg: #ffffff;
  --active-bg: #eff6ff;
}

/* 2. 柔和黑 (Soft Dark) */
.theme-soft-dark {
  --bg-panel: #1f2937;
  --bg-sidebar: #111827;
  --bg-header: #1f2937;
  --bg-contrast: #111827;
  --text-text: #f3f4f6;
  --text-dim: #9ca3af;
  --text-accent: #60a5fa;
  --border-color: #374151;
  --hover-bg: #374151;
  --input-bg: #1f2937;
  --active-bg: #374151;
}

/* ================= 样式绑定 ================= */
.panel-bg {
  background-color: var(--bg-panel);
}

.bg-theme-panel {
  background-color: var(--bg-panel);
}

.bg-theme-sidebar {
  background-color: var(--bg-sidebar);
}

.bg-theme-header {
  background-color: var(--bg-header);
}

.bg-theme-contrast {
  background-color: var(--bg-contrast);
}

.bg-theme-input {
  background-color: var(--input-bg);
}

.bg-theme-hover:hover {
  background-color: var(--hover-bg);
}

.bg-theme-active {
  background-color: var(--active-bg);
}

.text-theme-text {
  color: var(--text-text);
}

.text-theme-text-dim {
  color: var(--text-dim);
}

.text-theme-accent {
  color: var(--text-accent);
}

.border-theme {
  border-color: var(--border-color);
  border-width: 1px;
}

.border-theme-border {
  border-color: var(--border-color);
}

/* 输入框 */
.input-box {
  @apply w-16 text-center py-1.5 rounded border outline-none transition-all text-xs font-sans;
  background-color: var(--input-bg);
  border-color: var(--border-color);
  color: var(--text-text);
}

.input-box:focus {
  border-color: var(--text-accent);
  box-shadow: 0 0 0 1px var(--text-accent);
}

/* 单选行 */
.radio-row {
  @apply flex items-center gap-3 p-3 rounded border border-transparent cursor-pointer select-none transition-all;
  color: var(--text-text);
}

.radio-row:hover {
  background-color: var(--hover-bg);
}

input[type="radio"] {
  @apply w-4 h-4 text-[var(--text-accent)] border-gray-300 focus:ring-[var(--text-accent)];
}

/* 数字按钮 */
.num-btn {
  @apply py-2 rounded border border-transparent text-xs transition-all font-sans;
  background-color: var(--hover-bg);
  color: var(--text-text);
}

.num-btn:hover {
  border-color: var(--text-accent);
}

.num-btn.active {
  background-color: var(--text-accent);
  color: #ffffff;
  font-weight: 600;
}

/* 滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

/* 动画 */
.modal-fade-enter-active {
  animation: fade-in 0.2s ease-out;
}

.modal-fade-leave-active {
  animation: fade-out 0.15s ease-in;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

.animate-slide-down {
  animation: slide-down 0.15s ease-out;
  transform-origin: top;
}

@keyframes slide-down {
  from {
    opacity: 0;
    transform: scaleY(0.9);
  }
  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

.animate-fade-in {
  animation: content-in 0.2s ease-out;
}

@keyframes content-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>