<script setup lang="ts">
import {ref, onMounted, computed, defineAsyncComponent} from 'vue';
import {useGeolocation} from '@vueuse/core';
import type {SiteItem} from '../../../core/config/types';
import {
  PhCloudSun, PhSun, PhCloud, PhCloudRain, PhSnowflake, PhLightning,
  PhMapPin, PhSpinner
} from '@phosphor-icons/vue';

// 异步加载弹窗，优化首屏
const WeatherDetailModal = defineAsyncComponent(() => import('./WeatherDetailModal.vue'));

const props = defineProps<{ item: SiteItem }>();

// ================= 配置 =================
const CACHE_KEY = 'voidtab_weather_data';
const CACHE_TIME = 30 * 60 * 1000; // 30分钟缓存

// 状态
const isLoading = ref(true);
const showModal = ref(false);
const weatherData = ref<any>(null);
const locationName = ref('定位中...');
const {coords} = useGeolocation();

// 图标映射
const weatherCodeMap: Record<number, { icon: any, label: string, bgClass: string }> = {
  0: {icon: PhSun, label: '晴', bgClass: 'bg-gradient-to-br from-blue-400 to-blue-600'},
  1: {icon: PhCloudSun, label: '多云', bgClass: 'bg-gradient-to-br from-blue-400 to-gray-400'},
  2: {icon: PhCloudSun, label: '多云', bgClass: 'bg-gradient-to-br from-blue-400 to-gray-400'},
  3: {icon: PhCloud, label: '阴', bgClass: 'bg-gradient-to-br from-gray-400 to-gray-600'},
  // ... 其他代码简写，逻辑同上 ...
  99: {icon: PhLightning, label: '雷雨', bgClass: 'bg-gradient-to-br from-purple-500 to-indigo-600'},
};

// 辅助：获取图标配置
const getWInfo = (code: number) => {
  // 简单范围匹配兜底
  if (code >= 51 && code <= 67) return {
    icon: PhCloudRain,
    label: '雨',
    bgClass: 'bg-gradient-to-br from-blue-600 to-blue-800'
  };
  if (code >= 71 && code <= 77) return {
    icon: PhSnowflake,
    label: '雪',
    bgClass: 'bg-gradient-to-br from-blue-300 to-blue-500'
  };
  return weatherCodeMap[code] || weatherCodeMap[0];
};

// === 核心：数据获取 ===
const fetchData = async () => {
  // 1. 读缓存
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp < CACHE_TIME) {
      weatherData.value = data.payload;
      locationName.value = data.location;
      isLoading.value = false;
      return;
    }
  }

  // 2. 等待坐标
  if (coords.value.latitude === Infinity) {
    setTimeout(fetchData, 1000); // 轮询等待
    return;
  }

  try {
    const lat = coords.value.latitude;
    const lon = coords.value.longitude;

    // 并行请求：天气 + 地理逆编码 + 空气质量(Open-Meteo Air Quality)
    const [wRes, geoRes, airRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&timezone=auto`),
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=zh`),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`)
    ]);

    const wJson = await wRes.json();
    const geoJson = await geoRes.json();
    const airJson = await airRes.json();

    // 组装数据
    const info = getWInfo(wJson.current.weather_code);
    const payload = {
      current: {
        ...wJson.current,
        weatherDesc: info.label
      },
      daily: wJson.daily,
      hourly: wJson.hourly,
      aqi: airJson.current?.us_aqi || 50
    };

    const loc = geoJson.address?.city || geoJson.address?.district || '未知位置';

    // 更新状态
    weatherData.value = payload;
    locationName.value = loc.replace('市', '').replace('区', ''); // 简化地名

    // 存缓存
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      payload,
      location: locationName.value
    }));

  } catch (e) {
    console.error('Weather Fetch Error', e);
    locationName.value = '网络错误';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchData();
});

// === 布局自适应策略 ===
const layout = computed(() => {
  const w = props.item.w || 2;
  const h = props.item.h || 2;
  const info = weatherData.value ? getWInfo(weatherData.value.current.weather_code) : weatherCodeMap[0];

  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    bgClass: info.bgClass,
    icon: info.icon
  };
});
</script>

<template>
  <div class="w-full h-full relative cursor-pointer" @click.stop="showModal = true">

    <div
        class="w-full h-full rounded-[18px] overflow-hidden flex flex-col relative text-white shadow-sm transition-all select-none"
        :class="[isLoading ? 'bg-gray-200' : layout.bgClass]"
    >
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center text-gray-400">
        <PhSpinner class="animate-spin" size="24"/>
      </div>

      <template v-else>
        <div v-if="layout.isMini" class="w-full h-full flex flex-col items-center justify-center gap-1">
          <component :is="layout.icon" size="36" weight="duotone" class="drop-shadow-md"/>
          <span class="text-xl font-bold drop-shadow-md">{{ Math.round(weatherData.current.temperature_2m) }}°</span>
        </div>

        <div v-else-if="layout.isWide" class="w-full h-full flex items-center justify-between px-4">
          <div class="flex flex-col">
            <div class="flex items-center gap-1 text-xs opacity-90 mb-1">
              <PhMapPin weight="fill"/>
              {{ locationName }}
            </div>
            <div class="text-3xl font-bold">{{ Math.round(weatherData.current.temperature_2m) }}°</div>
          </div>
          <div class="flex flex-col items-center">
            <component :is="layout.icon" size="32" weight="duotone"/>
            <span class="text-xs mt-1">{{ weatherData.current.weatherDesc }}</span>
          </div>
        </div>

        <div v-else class="w-full h-full p-4 flex flex-col justify-between">
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-1 text-sm font-bold tracking-wide">
              <PhMapPin weight="fill" size="14"/>
              {{ locationName }}
            </div>
            <div class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md">
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="flex flex-col">
            <div class="text-5xl font-bold tracking-tighter -ml-1">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-sm font-medium">{{ weatherData.current.weatherDesc }}</span>
              <span class="text-xs opacity-70">
                    最高{{ Math.round(weatherData.daily.temperature_2m_max[0]) }}°
                    最低{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
                 </span>
            </div>
          </div>

          <component
              :is="layout.icon"
              size="64"
              weight="duotone"
              class="absolute bottom-4 right-4 opacity-90 drop-shadow-lg"
          />
        </div>
      </template>
    </div>

    <Teleport to="body">
      <WeatherDetailModal
          v-if="weatherData"
          :show="showModal"
          :data="weatherData"
          :location="locationName"
          @close="showModal = false"
      />
    </Teleport>

  </div>
</template>