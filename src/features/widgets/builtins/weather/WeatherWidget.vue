<script setup lang="ts">
import {ref, onMounted, computed, defineAsyncComponent} from "vue";
import {useGeolocation} from "@vueuse/core";
import type {SiteItem} from "../../../../core/config/types.ts";
import {
  PhCloudSun,
  PhSun,
  PhCloud,
  PhCloudRain,
  PhSnowflake,
  PhLightning,
  PhMapPin,
  PhSpinner,
} from "@phosphor-icons/vue";

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

// 图标映射：你可以继续扩充
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

// === 通用：带超时的 fetch json ===
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

// === 逆地理：失败不影响主流程 ===
async function reverseGeocode(lat: number, lon: number) {
  // 1) BigDataCloud（前端直连一般更友好）
  try {
    const j = await fetchJson(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
        6000
    );
    const city = j.city || j.locality || j.principalSubdivision;
    if (city) return String(city).replace("市", "").replace("区", "");
  } catch {
  }

  // 2) Nominatim（可能超时/被墙/限流）
  try {
    const j = await fetchJson(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=zh`,
        6000
    );
    const addr = j.address || {};
    const loc = addr.city || addr.district || addr.state || "未知位置";
    return String(loc).replace("市", "").replace("区", "");
  } catch {
  }

  return "未知位置";
}

const fetchData = async () => {
  isLoading.value = true;

  if (error.value) {
    locationName.value = "定位失败";
    isLoading.value = false;
    return;
  }

  const lat = coords.value.latitude;
  const lon = coords.value.longitude;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    setTimeout(fetchData, 800);
    return;
  }

  // 缓存按坐标分桶
  const CACHE_KEY = `voidtab_weather_${lat.toFixed(3)}_${lon.toFixed(3)}`;

  // 1) 读缓存
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_TIME) {
        weatherData.value = data.payload;
        locationName.value = data.location || locationName.value;
        isLoading.value = false;
        return;
      }
    } catch {
    }
  }

  try {
    // 2) 天气 + 空气质量：互不拖死
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

    // 3) 逆地理：可失败
    locationName.value = await reverseGeocode(lat, lon);

    const info = getWInfo(wJson.current.weather_code);
    const payload = {
      current: {...wJson.current, weatherDesc: info.label},
      daily: wJson.daily,
      hourly: wJson.hourly,
      aqi: airJson?.current?.us_aqi ?? 50,
    };

    weatherData.value = payload;

    localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          payload,
          location: locationName.value,
        })
    );
  } catch (e) {
    console.error("Weather Fetch Error", e);
    locationName.value = "网络错误";
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchData);

// === 布局自适应策略 ===
type Variant = "mini" | "wide" | "square" | "tall" | "large";

const layout = computed(() => {
  const w = props.item.w || 2;
  const h = props.item.h || 2;

  const info = weatherData.value ? getWInfo(weatherData.value.current.weather_code) : weatherCodeMap[0];

  let variant: Variant = "large";
  if (w === 1 && h === 1) variant = "mini";
  else if (w >= 2 && h === 1) variant = "wide";
  else if (w === 2 && h === 2) variant = "square";
  else if (w === 1 && h >= 2) variant = "tall";
  else variant = "large";

  // 针对不同格子给图标/字号一个更稳的“尺寸档位”
  const iconSize =
      variant === "mini" ? 36 : variant === "wide" ? 32 : variant === "square" ? 54 : variant === "tall" ? 64 : 64;

  const tempClass =
      variant === "mini"
          ? "text-xl"
          : variant === "wide"
              ? "text-3xl"
              : variant === "square"
                  ? "text-5xl"
                  : variant === "tall"
                      ? "text-5xl"
                      : "text-5xl";

  return {
    variant,
    bgClass: info.bgClass,
    icon: info.icon,
    iconSize,
    tempClass,
  };
});

// 不要 loading 时点开空 modal
const onClickCard = () => {
  if (weatherData.value) showModal.value = true;
};
</script>

<template>
  <div class="w-full h-full relative cursor-pointer" @click.stop="onClickCard">
    <div
        class="w-full h-full rounded-[18px] overflow-hidden flex flex-col relative text-white shadow-sm transition-all select-none"
        :class="[isLoading ? 'bg-gray-200' : layout.bgClass]"
    >
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center text-gray-400">
        <PhSpinner class="animate-spin" size="24"/>
      </div>

      <template v-else>
        <!-- 1*1 -->
        <div v-if="layout.variant === 'mini'" class="w-full h-full flex flex-col items-center justify-center gap-1">
          <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="drop-shadow-md"/>
          <span class="font-bold drop-shadow-md" :class="layout.tempClass">
            {{ Math.round(weatherData.current.temperature_2m) }}°
          </span>
        </div>

        <!-- 2*1 -->
        <div v-else-if="layout.variant === 'wide'" class="w-full h-full flex items-center justify-between px-4">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-1 text-xs opacity-90 mb-1 min-w-0">
              <PhMapPin weight="fill"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div class="font-bold leading-none" :class="layout.tempClass">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
          </div>

          <div class="flex flex-col items-center shrink-0">
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone"/>
            <span class="text-xs mt-1">{{ weatherData.current.weatherDesc }}</span>
          </div>
        </div>

        <!-- 2*2 -->
        <div v-else-if="layout.variant === 'square'" class="w-full h-full p-3 flex flex-col justify-between">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1 text-xs font-semibold min-w-0">
              <PhMapPin weight="fill" size="14"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0">
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="flex items-end justify-between">
            <div class="font-bold tracking-tighter leading-none" :class="layout.tempClass">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-90 drop-shadow-md"/>
          </div>

          <div class="flex items-center justify-between text-xs opacity-90">
            <span class="font-medium">{{ weatherData.current.weatherDesc }}</span>
            <span class="opacity-80">
              H{{
                Math.round(weatherData.daily.temperature_2m_max[0])
              }}° L{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
            </span>
          </div>
        </div>

        <!-- 1*2 / 1*3... -->
        <div v-else-if="layout.variant === 'tall'" class="w-full h-full p-3 flex flex-col">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1 text-xs font-semibold min-w-0">
              <PhMapPin weight="fill" size="14"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0">
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="mt-2 font-bold tracking-tighter leading-none" :class="layout.tempClass">
            {{ Math.round(weatherData.current.temperature_2m) }}°
          </div>

          <div class="mt-1 text-xs opacity-90 font-medium">
            {{ weatherData.current.weatherDesc }}
          </div>

          <div class="flex-1 flex items-center justify-center">
            <component :is="layout.icon" :size="layout.iconSize" weight="duotone" class="opacity-90 drop-shadow-lg"/>
          </div>

          <div class="text-[11px] opacity-80">
            H{{ Math.round(weatherData.daily.temperature_2m_max[0]) }}° ·
            L{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
          </div>
        </div>

        <!-- 2*4 / 其它大尺寸：沿用你原来的大卡片风格（稍微修剪避免拥挤） -->
        <div v-else class="w-full h-full p-4 flex flex-col justify-between">
          <div class="flex justify-between items-start gap-2">
            <div class="flex items-center gap-1 text-sm font-bold tracking-wide min-w-0">
              <PhMapPin weight="fill" size="14"/>
              <span class="truncate">{{ locationName }}</span>
            </div>
            <div class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-md shrink-0">
              AQI {{ weatherData.aqi }}
            </div>
          </div>

          <div class="flex flex-col">
            <div class="text-5xl font-bold tracking-tighter -ml-1 leading-none">
              {{ Math.round(weatherData.current.temperature_2m) }}°
            </div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-sm font-medium">{{ weatherData.current.weatherDesc }}</span>
              <span class="text-xs opacity-70">
                最高{{
                  Math.round(weatherData.daily.temperature_2m_max[0])
                }}° 最低{{ Math.round(weatherData.daily.temperature_2m_min[0]) }}°
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
