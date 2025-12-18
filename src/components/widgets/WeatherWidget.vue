<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useGeolocation } from '@vueuse/core';
import { Solar } from 'lunar-javascript';
import {
  PhCloudSun, PhSun, PhCloud, PhCloudRain, PhSnowflake, PhLightning,
  PhDrop, PhWind, PhMapPin, PhSpinner
} from '@phosphor-icons/vue';

const isLoading = ref(true);
const errorMsg = ref('');
const weatherData = ref<any>(null);
const lunarData = ref<any>(null);
const locationName = ref('定位中...');

const { coords, error: geoError } = useGeolocation();

const weatherCodeMap: Record<number, { icon: any, label: string, color: string }> = {
  0: { icon: PhSun, label: '晴', color: '#f59e0b' },
  1: { icon: PhCloudSun, label: '多云', color: '#fbbf24' },
  2: { icon: PhCloudSun, label: '多云', color: '#fbbf24' },
  3: { icon: PhCloud, label: '阴', color: '#9ca3af' },
  45: { icon: PhCloud, label: '雾', color: '#9ca3af' },
  51: { icon: PhCloudRain, label: '小雨', color: '#3b82f6' },
  53: { icon: PhCloudRain, label: '中雨', color: '#2563eb' },
  55: { icon: PhCloudRain, label: '大雨', color: '#1d4ed8' },
  61: { icon: PhCloudRain, label: '小雨', color: '#3b82f6' },
  63: { icon: PhCloudRain, label: '中雨', color: '#2563eb' },
  65: { icon: PhCloudRain, label: '大雨', color: '#1d4ed8' },
  71: { icon: PhSnowflake, label: '小雪', color: '#93c5fd' },
  73: { icon: PhSnowflake, label: '中雪', color: '#60a5fa' },
  75: { icon: PhSnowflake, label: '大雪', color: '#3b82f6' },
  95: { icon: PhLightning, label: '雷雨', color: '#7c3aed' },
};

const getWeatherInfo = (code: number) => weatherCodeMap[code] || { icon: PhCloudSun, label: '未知', color: 'currentColor' };

const fetchData = async () => {
  // 严格检查坐标有效性，防止 Infinity 导致 API 报错
  const lat = coords.value.latitude;
  const lon = coords.value.longitude;

  if (lat === Infinity || lon === Infinity || lat === 0 || lon === 0) {
    if (geoError.value) {
      errorMsg.value = "无法获取定位权限";
      isLoading.value = false;
    }
    return;
  }

  try {
    isLoading.value = true;
    errorMsg.value = '';

    // 1. 获取城市名 (CORS 容错处理)
    // 即使这里失败，也不要阻断后续的天气请求
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=zh`);
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        if (geoJson.results && geoJson.results[0]) {
          locationName.value = geoJson.results[0].name || geoJson.results[0].country;
        } else {
          locationName.value = `Lat:${lat.toFixed(1)} Lon:${lon.toFixed(1)}`;
        }
      } else {
        locationName.value = `Lat:${lat.toFixed(1)} Lon:${lon.toFixed(1)}`;
      }
    } catch (e) {
      // 跨域或网络错误，静默失败，使用坐标兜底
      console.warn("Geocoding failed, using coordinates instead.");
      locationName.value = `Lat:${lat.toFixed(1)} Lon:${lon.toFixed(1)}`;
    }

    // 2. 获取天气
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);

    if (!weatherRes.ok) throw new Error('天气服务暂时不可用');

    weatherData.value = await weatherRes.json();

    // 3. 黄历
    const now = new Date();
    const solar = Solar.fromDate(now);
    const lunar = solar.getLunar();
    lunarData.value = {
      dateStr: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      ganZhi: `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInGanZhi()}月 ${lunar.getDayInGanZhi()}日`,
      yi: lunar.getDayYi().join(' '),
      ji: lunar.getDayJi().join(' '),
    };

  } catch (e: any) {
    errorMsg.value = '天气数据加载异常';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

const advice = computed(() => {
  if (!weatherData.value) return '';
  const temp = weatherData.value.current.temperature_2m;
  return temp < 10 ? '❄️ 寒冷，注意保暖。' : temp < 25 ? '👕 舒适，适合出行。' : '☀️ 炎热，注意防晒。';
});

const dailyForecast = computed(() => {
  if (!weatherData.value || !weatherData.value.daily) return [];
  const daily = weatherData.value.daily;
  return daily.time.slice(1, 8).map((time: string, index: number) => {
    const i = index + 1;
    const date = new Date(time);
    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      week: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
      ...getWeatherInfo(daily.weather_code[i]),
      max: Math.round(daily.temperature_2m_max[i]),
      min: Math.round(daily.temperature_2m_min[i]),
    };
  });
});

// 使用 watch 监听坐标变化，确保只在坐标有效时发起请求
watch(coords, (newCoords) => {
  if (newCoords.latitude !== Infinity && newCoords.latitude !== 0) {
    fetchData();
  }
}, { immediate: true });

onMounted(() => {
  // 双重保险
  if (coords.value.latitude && coords.value.latitude !== Infinity) fetchData();
});
</script>

<template>
  <div class="apple-glass rounded-2xl p-5 flex flex-col h-full relative overflow-hidden group select-none transition-all hover:bg-[var(--sidebar-active)] text-[var(--text-primary)]">

    <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--glass-surface)] z-10 backdrop-blur-sm">
      <PhSpinner size="32" class="animate-spin text-[var(--accent-color)] mb-3" /><span class="text-xs font-bold opacity-60">定位中...</span>
    </div>

    <template v-else-if="lunarData && weatherData">
      <div class="flex justify-between items-start mb-4">
        <div class="flex items-center gap-1">
          <PhMapPin size="16" weight="fill" class="text-[var(--accent-color)]" />
          <span class="text-sm font-bold tracking-wide">{{ locationName }}</span>
        </div>
        <div class="text-right">
          <div class="text-sm font-bold font-tech text-[var(--accent-color)]">{{ lunarData.dateStr }}</div>
          <div class="text-[10px] opacity-60 mt-0.5">{{ lunarData.ganZhi }}</div>
        </div>
      </div>

      <div class="flex items-center justify-between mb-6 px-2">
        <div class="flex items-center gap-4">
          <component :is="getWeatherInfo(weatherData.current.weather_code).icon" size="64" weight="duotone" :style="{ color: getWeatherInfo(weatherData.current.weather_code).color }" />
          <div>
            <div class="text-5xl font-bold font-tech leading-none">{{ Math.round(weatherData.current.temperature_2m) }}°</div>
            <div class="text-sm font-bold opacity-80 mt-1 pl-1">{{ getWeatherInfo(weatherData.current.weather_code).label }}</div>
          </div>
        </div>
        <div class="flex flex-col gap-2 text-xs font-bold opacity-60">
          <div class="flex items-center gap-2"><PhDrop size="14" weight="bold"/> {{ weatherData.current.relative_humidity_2m }}%</div>
          <div class="flex items-center gap-2"><PhWind size="14" weight="bold"/> {{ weatherData.current.wind_speed_10m }}km/h</div>
        </div>
      </div>

      <div class="bg-[var(--sidebar-active)] rounded-xl p-3 mb-4 border border-[var(--glass-border)]">
        <div class="text-xs font-bold text-[var(--text-primary)] leading-relaxed">{{ advice }}</div>
        <div class="mt-2 pt-2 border-t border-[var(--glass-border)] flex gap-2 overflow-hidden text-[10px]">
          <span class="text-green-600 font-bold whitespace-nowrap">宜: {{ lunarData.yi }}</span>
        </div>
      </div>

      <div class="flex-1 w-full overflow-x-auto no-scrollbar pb-4 min-h-[100px]">
        <div class="flex gap-4 min-w-max px-2">
          <div v-for="day in dailyForecast" :key="day.date" class="flex flex-col items-center gap-1 min-w-[50px] p-2 rounded-xl hover:bg-[var(--sidebar-active)] transition-colors">
            <span class="text-[10px] opacity-60 font-bold">{{ day.week }}</span>
            <component :is="day.icon" size="24" weight="duotone" :style="{ color: day.color }" />
            <div class="flex flex-col items-center text-xs font-bold font-tech mt-1">
              <span>{{ day.max }}°</span>
              <span class="opacity-40 text-[10px]">{{ day.min }}°</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-10">
      <p class="text-xs opacity-60 mb-2">{{ errorMsg || '无法获取数据' }}</p>
      <button @click="fetchData" class="px-4 py-2 bg-[var(--accent-color)] text-white rounded-lg text-xs font-bold shadow-lg hover:brightness-110">重试</button>
    </div>
  </div>
</template>