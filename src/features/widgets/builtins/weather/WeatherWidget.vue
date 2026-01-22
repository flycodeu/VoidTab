<script setup lang="ts">
import {ref, onMounted, computed, defineAsyncComponent} from "vue";
import {useGeolocation} from "@vueuse/core";
import type {SiteItem} from "../../../../core/config/types.ts";
import {
  PhCloudSun, PhSun, PhCloud, PhCloudRain, PhSnowflake, PhLightning, PhMapPin, PhSpinner,
} from "@phosphor-icons/vue";
//  1. 引入统一存储
import {tempStorage} from '../../../../core/storage/tempStorage';

const WeatherDetailModal = defineAsyncComponent(() => import("./WeatherDetailModal.vue"));
const props = defineProps<{ item: SiteItem }>();


// ================= 配置 =================
const CACHE_TIME = 30 * 60 * 1000; // 30分钟缓存

const isLoading = ref(true);
const showModal = ref(false);
const weatherData = ref<any>(null);
const locationName = ref("定位中...");

const {coords, error} = useGeolocation({
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60_000,
});

// 图标映射
const weatherCodeMap: Record<number, { icon: any; label: string; bgClass: string }> = {
  0: {icon: PhSun, label: "晴", bgClass: "bg-gradient-to-br from-blue-400 to-blue-600"},
  1: {icon: PhCloudSun, label: "多云", bgClass: "bg-gradient-to-br from-blue-400 to-gray-400"},
  2: {icon: PhCloudSun, label: "多云", bgClass: "bg-gradient-to-br from-blue-400 to-gray-400"},
  3: {icon: PhCloud, label: "阴", bgClass: "bg-gradient-to-br from-gray-400 to-gray-600"},
  99: {icon: PhLightning, label: "雷雨", bgClass: "bg-gradient-to-br from-purple-500 to-indigo-600"},
};

const getWInfo = (code: number) => {
  if (code >= 51 && code <= 67)
    return {icon: PhCloudRain, label: "雨", bgClass: "bg-gradient-to-br from-blue-600 to-blue-800"};
  if (code >= 71 && code <= 77)
    return {icon: PhSnowflake, label: "雪", bgClass: "bg-gradient-to-br from-blue-300 to-blue-500"};
  return weatherCodeMap[code] || weatherCodeMap[0];
};

async function fetchJson(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {signal: controller.signal});
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function reverseGeocode(lat: number, lon: number) {
  try {
    const j = await fetchJson(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
        6000
    );
    const city = j.city || j.locality || j.principalSubdivision;
    if (city) return String(city).replace("市", "").replace("区", "");
  } catch {
  }
  return "未知位置";
}

const fetchData = async () => {
  isLoading.value = true;

  //  2. 优先尝试从统一缓存读取 (即使定位还没完成，先显示上次缓存的位置)
  const cache = tempStorage.get('weather');
  if (cache && tempStorage.isValid(cache.ts, CACHE_TIME)) {
    console.log('[Weather] Hit unified cache');
    weatherData.value = cache.data;
    locationName.value = cache.city || "未知位置";
    isLoading.value = false;
    // 如果缓存有效，直接返回，不再重新定位和请求
    return;
  }

  // 如果缓存无效，等待定位
  if (error.value) {
    locationName.value = "定位失败";
    isLoading.value = false;
    return;
  }

  const lat = coords.value.latitude;
  const lon = coords.value.longitude;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // 还没获取到坐标，且没有有效缓存，稍后重试
    setTimeout(fetchData, 800);
    return;
  }

  try {
    const results = await Promise.allSettled([
      fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&timezone=auto`,
          10000
      ),
      fetchJson(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`,
          10000
      ),
    ]);

    const wJson = results[0].status === "fulfilled" ? results[0].value : null;
    const airJson = results[1].status === "fulfilled" ? results[1].value : null;

    if (!wJson?.current) throw new Error("weather api failed");

    const cityName = await reverseGeocode(lat, lon);
    locationName.value = cityName;

    const info = getWInfo(wJson.current.weather_code);
    const payload = {
      current: {...wJson.current, weatherDesc: info.label},
      daily: wJson.daily,
      hourly: wJson.hourly,
      aqi: airJson?.current?.us_aqi ?? 50,
    };

    weatherData.value = payload;

    //  3. 写入统一缓存
    tempStorage.set('weather', {
      data: payload,
      city: cityName,
      ts: Date.now()
    });

  } catch (e) {
    console.error("Weather Fetch Error", e);
    locationName.value = "网络错误";
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchData);

// ================= 布局自适应 (代码保持不变) =================
type Variant = "mini" | "wide" | "square" | "tallNarrow" | "tall" | "large";

const layout = computed(() => {
  const w = Number(props.item?.w || 2);
  const h = Number(props.item?.h || 2);
  const info = weatherData.value ? getWInfo(weatherData.value.current.weather_code) : weatherCodeMap[0];

  let variant: Variant = "large";
  if (w === 1 && h === 1) variant = "mini";
  else if (h === 1 && w >= 2) variant = "wide";
  else if (w === 2 && h === 2) variant = "square";
  else if (w === 1 && h === 2) variant = "tallNarrow";
  else if (w === 1 && h >= 3) variant = "tall";
  else variant = "large";

  const preset = {
    mini: {icon: 26, temp: "text-lg", showAqi: false, showHiLo: false},
    wide: {icon: 28, temp: "text-2xl", showAqi: false, showHiLo: false},
    square: {icon: 44, temp: "text-4xl", showAqi: true, showHiLo: true},
    tallNarrow: {icon: 44, temp: "text-3xl", showAqi: false, showHiLo: true},
    tall: {icon: 56, temp: "text-4xl", showAqi: true, showHiLo: true},
    large: {icon: 64, temp: "text-5xl", showAqi: true, showHiLo: true},
  }[variant];

  return {
    variant,
    bgClass: info.bgClass,
    icon: info.icon,
    iconSize: preset.icon,
    tempClass: preset.temp,
    showAqi: preset.showAqi,
    showHiLo: preset.showHiLo,
  };
});

const textShadowStyle = {
  textShadow: "0 2px 10px rgba(0,0,0,.18)",
};

const onClickCard = () => {
  if (weatherData.value) showModal.value = true;
};
</script>

<template>
  <div class="w-full h-full relative cursor-pointer min-w-0 min-h-0" @click.stop="onClickCard">
    <div
        class="weather-card w-full h-full rounded-[18px] overflow-hidden flex flex-col relative text-white transition-all select-none min-w-0 min-h-0"
        :class="[isLoading ? 'bg-gray-200' : layout.bgClass]"
    >
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center text-gray-400">
        <PhSpinner class="animate-spin" size="24"/>
      </div>

      <template v-else>
        <div
            v-if="layout.variant === 'mini'"
            class="w-full h-full flex flex-col items-center justify-center gap-1 min-w-0 min-h-0"
        >
          <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-95"/>
          <span class="font-bold leading-none" :class="layout.tempClass" :style="textShadowStyle">
            {{ Math.round(weatherData.current.temperature_2m) }}°
          </span>
        </div>

        <div
            v-else-if="layout.variant === 'wide'"
            class="w-full h-full flex items-center justify-between px-3 min-w-0 min-h-0"
        >
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-1 text-[11px] opacity-90 mb-0.5 min-w-0">
              <PhMapPin weight="fill" class="shrink-0"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div class="font-bold leading-none" :class="layout.tempClass" :style="textShadowStyle">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <div class="text-[11px] opacity-90 mt-0.5 truncate">
              {{ weatherData.current.weatherDesc }}
            </div>
          </div>

          <div class="flex flex-col items-center justify-center shrink-0 pl-2">
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-95"/>
          </div>
        </div>

        <div
            v-else-if="layout.variant === 'square'"
            class="w-full h-full p-3 flex flex-col justify-between min-w-0 min-h-0"
        >
          <div class="flex items-start justify-between gap-2 min-w-0">
            <div class="flex items-center gap-1 text-xs font-semibold min-w-0">
              <PhMapPin weight="fill" size="14" class="shrink-0"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div
                v-if="layout.showAqi"
                class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0"
            >
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="flex items-end justify-between gap-2 min-w-0">
            <div class="font-bold tracking-tight leading-none min-w-0" :class="layout.tempClass"
                 :style="textShadowStyle">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-95 shrink-0"/>
          </div>

          <div class="flex items-center justify-between text-xs opacity-90 gap-2 min-w-0">
            <span class="font-medium truncate">{{ weatherData.current.weatherDesc }}</span>
            <span v-if="layout.showHiLo" class="opacity-80 shrink-0">
              H{{
                Math.round(weatherData.daily.temperature_2m_max[0])
              }}° L{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
            </span>
          </div>
        </div>

        <div
            v-else-if="layout.variant === 'tallNarrow'"
            class="w-full h-full p-2.5 flex flex-col min-w-0 min-h-0"
        >
          <div class="flex items-center gap-1 text-[11px] font-semibold min-w-0">
            <PhMapPin weight="fill" size="13" class="shrink-0"/>
            <span class="truncate">{{ locationName }}</span>
          </div>

          <div class="mt-1 font-bold tracking-tight leading-none" :class="layout.tempClass" :style="textShadowStyle">
            {{ Math.round(weatherData.current.temperature_2m) }}°
          </div>

          <div class="text-[11px] opacity-90 mt-0.5 truncate">
            {{ weatherData.current.weatherDesc }}
          </div>

          <div class="flex-1 flex items-center justify-center min-h-0">
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-95"/>
          </div>

          <div class="text-[11px] opacity-80 mt-0.5">
            H{{ Math.round(weatherData.daily.temperature_2m_max[0]) }}° ·
            L{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
          </div>
        </div>

        <div
            v-else-if="layout.variant === 'tall'"
            class="w-full h-full p-3 flex flex-col min-w-0 min-h-0"
        >
          <div class="flex items-start justify-between gap-2 min-w-0">
            <div class="flex items-center gap-1 text-xs font-semibold min-w-0">
              <PhMapPin weight="fill" size="14" class="shrink-0"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div
                v-if="layout.showAqi"
                class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0"
            >
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="mt-2 font-bold tracking-tight leading-none" :class="layout.tempClass" :style="textShadowStyle">
            {{ Math.round(weatherData.current.temperature_2m) }}°
          </div>

          <div class="mt-1 text-xs opacity-90 font-medium truncate">
            {{ weatherData.current.weatherDesc }}
          </div>

          <div class="flex-1 flex items-center justify-center min-h-0">
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-95"/>
          </div>

          <div v-if="layout.showHiLo" class="text-[11px] opacity-80">
            H{{ Math.round(weatherData.daily.temperature_2m_max[0]) }}° ·
            L{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
          </div>
        </div>

        <div v-else class="w-full h-full p-4 flex flex-col justify-between min-w-0 min-h-0">
          <div class="flex justify-between items-start gap-2 min-w-0">
            <div class="flex items-center gap-1 text-sm font-bold tracking-wide min-w-0">
              <PhMapPin weight="fill" size="14" class="shrink-0"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div
                v-if="layout.showAqi"
                class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0"
            >
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="flex flex-col min-w-0">
            <div class="text-5xl font-bold tracking-tight -ml-0.5 leading-none" :style="textShadowStyle">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <div class="flex items-center gap-2 mt-1 flex-wrap min-w-0">
              <span class="text-sm font-medium truncate">{{ weatherData.current.weatherDesc }}</span>
              <span v-if="layout.showHiLo" class="text-xs opacity-70 shrink-0">
                最高{{
                  Math.round(weatherData.daily.temperature_2m_max[0])
                }}° 最低{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
              </span>
            </div>
          </div>

          <component
              :is="layout.icon"
              :size="layout.iconSize"
              weight="duotone"
              class="absolute bottom-4 right-4 opacity-90"
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

<style scoped>
/*  硬裁剪 + 隔离绘制层（解决 loaded 后阴影/滤镜溢出） */
.weather-card {
  clip-path: inset(0 round 18px);
  isolation: isolate;
  contain: paint;
}

.weather-card * {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>