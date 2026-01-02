<script setup lang="ts">
import {computed, onMounted, onUnmounted} from 'vue';
import {PhX, PhWind, PhDrop, PhSun} from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
  data: any;
  location: string;
}>();

const emit = defineEmits(['close']);

// === 锁定背景滚动 (优化体验) ===
// 当弹窗打开时，禁止背景(body)滚动，只允许弹窗滚动
onMounted(() => {
  if (props.show) document.body.style.overflow = 'hidden';
});
onUnmounted(() => {
  document.body.style.overflow = '';
});

// === 1. 生成 SVG 温度曲线 ===
const chartPath = computed(() => {
  if (!props.data?.hourly?.time) return '';
  const temps = props.data.hourly.temperature_2m.slice(0, 24);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;
  const stepX = 800 / 23;

  const points = temps.map((t: number, i: number) => {
    const x = i * stepX;
    const y = 60 - ((t - min) / range) * 40 - 10;
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')}`;
});

// === 2. 24小时列表 ===
const hourlyList = computed(() => {
  if (!props.data?.hourly) return [];
  return props.data.hourly.time.slice(0, 24).map((t: string, i: number) => {
    const date = new Date(t);
    const hour = date.getHours();
    return {
      time: i === 0 ? '现在' : `${hour}时`,
      temp: Math.round(props.data.hourly.temperature_2m[i]),
      isNight: hour < 6 || hour > 18
    };
  });
});

// === 3. 7天预报列表 ===
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
            class="relative w-[800px] max-h-[85vh] bg-gradient-to-br from-[#2E335A] to-[#1C1B33] rounded-3xl shadow-2xl flex flex-col text-white select-none border border-white/10 overflow-hidden isolation-auto"
            @click.stop
            @pointerdown.stop
        >

          <button
              class="absolute top-4 right-4 z-50 p-2 hover:bg-white/10 rounded-full transition cursor-pointer"
              @click="emit('close')"
          >
            <PhX size="24"/>
          </button>

          <div class="flex-1 overflow-y-auto min-h-0 custom-scroll overscroll-contain scroll-smooth">

            <div class="flex flex-col">

              <div class="pt-12 pb-8 text-center shrink-0">
                <h2 class="text-3xl font-bold tracking-wider">{{ location }}</h2>
                <div class="text-sm opacity-60 mt-1">当前位置</div>

                <div class="text-9xl font-thin mt-6 font-sans tracking-tighter">
                  {{ Math.round(data.current.temperature_2m) }}°
                </div>
                <div class="text-xl font-medium opacity-90 mt-2">{{ data.current.weatherDesc }}</div>

                <div class="flex justify-center gap-4 text-base opacity-80 mt-2">
                  <span>最高 {{ Math.round(data.daily.temperature_2m_max[0]) }}°</span>
                  <span>最低 {{ Math.round(data.daily.temperature_2m_min[0]) }}°</span>
                </div>

                <div class="flex justify-center gap-8 mt-8 text-sm font-bold opacity-70">
                  <div class="flex items-center gap-1">
                    <PhWind size="16"/>
                    {{ data.current.wind_speed_10m }}km/h
                  </div>
                  <div class="flex items-center gap-1">
                    <PhDrop size="16"/>
                    {{ data.current.relative_humidity_2m }}%
                  </div>
                  <div class="flex items-center gap-1">AQI {{ data.aqi ?? '--' }}</div>
                </div>
              </div>

              <div class="p-6 space-y-4">

                <div
                    class="bg-black/20 rounded-2xl p-5 backdrop-blur-md border border-white/5 overflow-hidden shrink-0">
                  <div class="text-xs opacity-50 mb-4 flex items-center gap-1 font-bold uppercase tracking-wider">
                    <PhSun size="14"/>
                    24小时预报
                  </div>

                  <div class="overflow-x-auto no-scrollbar relative h-[110px] w-full touch-pan-x">
                    <div class="min-w-[840px] relative h-full">
                      <svg class="absolute top-[40px] left-0 w-[800px] h-[60px] pointer-events-none opacity-40"
                           preserveAspectRatio="none">
                        <path :d="chartPath" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      <div class="flex w-[800px] justify-between relative z-10 px-2">
                        <div v-for="h in hourlyList" :key="h.time"
                             class="flex flex-col items-center gap-1 w-[40px] shrink-0">
                          <span class="text-xs opacity-70">{{ h.time }}</span>
                          <div class="h-10 flex items-center justify-center">
                            <div class="w-1.5 h-1.5 bg-white rounded-full opacity-60"></div>
                          </div>
                          <span class="text-sm font-bold mt-6">{{ h.temp }}°</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="bg-black/20 rounded-2xl p-5 backdrop-blur-md border border-white/5 shrink-0">
                  <div class="text-xs opacity-50 mb-4 flex items-center gap-1 font-bold uppercase tracking-wider">
                    <PhSun size="14"/>
                    7天预报
                  </div>

                  <div class="flex flex-col gap-3">
                    <div v-for="day in dailyList" :key="day.dateStr"
                         class="flex items-center justify-between h-10 hover:bg-white/5 rounded-lg px-2 transition-colors">
                      <div class="w-16 text-base font-bold">{{ day.label }}</div>
                      <div class="flex-1 flex items-center justify-center">
                        <div class="flex items-center gap-4 w-full max-w-[240px]">
                          <span class="text-sm opacity-50 w-8 text-right">{{ day.min }}°</span>
                          <div class="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden relative">
                            <div class="absolute h-full bg-gradient-to-r from-[#63A4FF] to-[#FFD54F] rounded-full"
                                 :style="day.barStyle">
                            </div>
                          </div>
                          <span class="text-sm font-bold w-8">{{ day.max }}°</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="h-8 w-full shrink-0"></div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 滚动条美化 */
.custom-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
}

/* 横向滚动隐藏条但保留功能 */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>