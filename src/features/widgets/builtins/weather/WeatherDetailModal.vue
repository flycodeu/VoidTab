<script setup lang="ts">
import {computed, onMounted, onUnmounted} from 'vue';
import {PhX, PhWind, PhDrop, PhSun, PhThermometer, PhCalendarBlank,PhMapPin} from '@phosphor-icons/vue';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{
  show: boolean;
  data: any;
  location: string;
}>();

const emit = defineEmits(['close']);
useEscapeClose(() => props.show, () => emit('close'));

onMounted(() => {
  if (props.show) document.body.style.overflow = 'hidden';
});
onUnmounted(() => {
  document.body.style.overflow = '';
});

// === 1. 24小时列表（逻辑修正：从当前小时开始）===
const hourlyList = computed(() => {
  if (!props.data?.hourly?.time) return [];

  const now = new Date();
  const currentHour = now.getHours();
  // 找到 API 数据中对应当前小时的索引
  // API 返回的 time 格式通常是 ISO，或者我们假设它按小时顺序排列
  // open-meteo 的 hourly 数据通常是从当天的 00:00 开始的
  // 为了保险，我们通过时间比对找到起始点

  let startIndex = 0;
  // 简单查找：找到第一个时间 >= 当前小时的数据点
  const index = props.data.hourly.time.findIndex((t: string) => {
    const d = new Date(t);
    return d.getDate() === now.getDate() && d.getHours() === currentHour;
  });

  if (index !== -1) startIndex = index;

  // 截取从当前时间开始的 24 小时数据
  // 注意：需要确保 data.hourly 足够长（open-meteo 默认给 7 天数据，足够了）
  const slice = props.data.hourly.time.slice(startIndex, startIndex + 24);

  return slice.map((t: string, i: number) => {
    // 重新计算对应的原始索引
    const originalIndex = startIndex + i;
    const date = new Date(t);
    const hour = date.getHours();

    // 显示逻辑：第一个显示“现在”，其他的显示“16时”
    const timeLabel = i === 0 ? '现在' : `${hour}时`;

    return {
      time: timeLabel,
      temp: Math.round(props.data.hourly.temperature_2m[originalIndex]),
      isNight: hour < 6 || hour > 18
    };
  });
});

// === 2. 生成 SVG 温度曲线 (基于修正后的 hourlyList) ===
const chartPath = computed(() => {
  const list = hourlyList.value;
  if (!list.length) return '';

  const temps = list.map((item: any) => item.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;

  // 容器宽度设为 1200 (足够宽以容纳24小时的滚动)
  // 每个点间距 50px
  const stepX = 50;

  const points = temps.map((t: number, i: number) => {
    const x = i * stepX + 25; // +25 是为了居中于 col
    const y = 50 - ((t - min) / range) * 30 - 10;
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')}`;
});

const dailyList = computed(() => {
  if (!props.data?.daily) return [];
  return props.data.daily.time.map((t: string, i: number) => {
    const date = new Date(t);
    const weekMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let label = weekMap[date.getDay()];
    if (i === 0) label = '今天';

    const dayMin = Math.round(props.data.daily.temperature_2m_min[i]);
    const dayMax = Math.round(props.data.daily.temperature_2m_max[i]);
    const totalRange = 50;
    const totalMin = -10;

    const leftPct = ((dayMin - totalMin) / totalRange) * 100;
    const widthPct = ((dayMax - dayMin) / totalRange) * 100;

    return {
      label,
      dateStr: `${date.getMonth() + 1}/${date.getDate()}`,
      max: dayMax,
      min: dayMin,
      barStyle: {
        left: `${Math.max(0, leftPct)}%`,
        width: `${Math.max(5, widthPct)}%`
      }
    };
  });
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">

        <div
            class="absolute inset-0 bg-black/60 backdrop-blur-md"
            @click="emit('close')"
        ></div>

        <div
            class="weather-modal relative w-[800px] max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col text-white select-none overflow-hidden isolation-auto"
            @click.stop
        >
          <div
              class="absolute inset-0 bg-gradient-to-br from-[#1e3a8a] via-[#172554] to-[#0f172a] pointer-events-none"></div>
          <div
              class="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none"></div>

          <button
              class="absolute top-5 right-5 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full transition cursor-pointer backdrop-blur-sm"
              @click="emit('close')"
          >
            <PhX size="20"/>
          </button>

          <div class="relative z-10 flex-1 overflow-y-auto min-h-0 custom-scroll">
            <div class="flex flex-col p-6 gap-6">

              <div class="flex items-start justify-between px-4 pt-4 relative">
                <div class="flex flex-col gap-1">
                  <div class="flex items-baseline gap-3">
                    <h2 class="text-3xl font-bold tracking-wider">{{ location }}</h2>
                    <span
                        class="text-sm opacity-60 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
                      <PhMapPin size="12" weight="fill"/> 当前位置
                    </span>
                  </div>
                  <div class="text-lg opacity-80 flex items-center gap-2">
                    {{ data.current.weatherDesc }}
                    <span class="opacity-50">|</span>
                    最高温度:{{ Math.round(data.daily.temperature_2m_max[0]) }}° 最低温度:{{
                      Math.round(data.daily.temperature_2m_min[0])
                    }}°
                  </div>
                </div>

                <div class="flex flex-col items-end mt-8 pr-2">
                  <div class="text-8xl font-light tracking-tighter leading-none">
                    {{ Math.round(data.current.temperature_2m) }}°
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-4">
                <div
                    class="bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 backdrop-blur-md border border-white/5">
                  <PhWind size="20" class="opacity-70"/>
                  <span class="text-sm font-bold">{{ data.current.wind_speed_10m }} <span
                      class="text-xs font-normal opacity-60">km/h</span></span>
                  <span class="text-[10px] opacity-50">风速</span>
                </div>
                <div
                    class="bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 backdrop-blur-md border border-white/5">
                  <PhDrop size="20" class="opacity-70"/>
                  <span class="text-sm font-bold">{{ data.current.relative_humidity_2m }}%</span>
                  <span class="text-[10px] opacity-50">湿度</span>
                </div>
                <div
                    class="bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 backdrop-blur-md border border-white/5">
                  <PhThermometer size="20" class="opacity-70"/>
                  <span class="text-sm font-bold">{{ data.aqi ?? '--' }}</span>
                  <span class="text-[10px] opacity-50">空气质量</span>
                </div>
              </div>

              <div class="bg-white/5 rounded-3xl p-5 backdrop-blur-md border border-white/5 overflow-hidden">
                <div class="text-xs opacity-50 mb-4 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  <PhSun size="14"/>
                  24小时预报
                </div>

                <div class="overflow-x-auto custom-scroll-x relative w-full touch-pan-x pb-2">
                  <div class="min-w-[1200px] relative h-[100px]">

                    <svg class="absolute top-[35px] left-0 w-full h-[50px] pointer-events-none opacity-40 text-blue-200"
                         preserveAspectRatio="none">
                      <path :d="chartPath" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round"/>
                      <path :d="chartPath + ' V 100 H 0 Z'" fill="url(#grad)" stroke="none" opacity="0.3"/>
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style="stop-color:white;stop-opacity:1"/>
                          <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
                        </linearGradient>
                      </defs>
                    </svg>

                    <div class="flex absolute inset-0">
                      <div v-for="h in hourlyList" :key="h.time"
                           class="flex flex-col items-center gap-2 w-[50px] shrink-0">
                        <span class="text-[10px] opacity-60">{{ h.time }}</span>
                        <div class="h-8 flex items-center justify-center w-full mt-1">
                          <div class="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]"></div>
                        </div>
                        <span class="text-sm font-bold mt-2">{{ h.temp }}°</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-white/5 rounded-3xl p-5 backdrop-blur-md border border-white/5">
                <div class="text-xs opacity-50 mb-3 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  <PhCalendarBlank size="14"/>
                  7天预报
                </div>
                <div class="flex flex-col gap-2">
                  <div v-for="day in dailyList" :key="day.dateStr"
                       class="flex items-center justify-between h-9 px-2 hover:bg-white/5 rounded-lg transition-colors group">
                    <div class="w-12 text-sm font-medium opacity-90">{{ day.label }}</div>
                    <div class="flex-1 flex items-center justify-center px-4">
                      <div class="flex items-center gap-3 w-full max-w-[300px]">
                        <span class="text-xs opacity-50 w-6 text-right tabular-nums">{{ day.min }}°</span>
                        <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                          <div
                              class="absolute h-full bg-gradient-to-r from-blue-300 to-yellow-200 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                              :style="day.barStyle">
                          </div>
                        </div>
                        <span class="text-xs font-bold w-6 tabular-nums">{{ day.max }}°</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.weather-modal {
  background-color: #1e3a8a;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 纵向滚动条 */
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.4);
}

/* 横向滚动条 (如果不想要可见滚动条，可以把 width/height 改为 0，或者 display:none) */
.custom-scroll-x::-webkit-scrollbar {
  height: 4px; /* 保留细微的横向条，提示用户可滚动 */
}

.custom-scroll-x::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.custom-scroll-x::-webkit-scrollbar-track {
  background: transparent;
}
</style>
