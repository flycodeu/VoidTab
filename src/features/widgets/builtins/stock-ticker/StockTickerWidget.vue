<script setup lang="ts">
import {ref, computed, onMounted, defineAsyncComponent} from 'vue';
import {useIntervalFn, useLocalStorage} from '@vueuse/core';
import type {SiteItem} from '../../../../core/config/types';
import {PhTrendUp, PhTrendDown, PhChartLineUp, PhCurrencyBtc} from '@phosphor-icons/vue';
import {fetchJsonWithRetry} from '../../../../shared/utils/network';
import {tempStorage} from '../../../../core/storage/tempStorage';
import {useToast} from '../../../../shared/composables/useToast';

// 异步加载配置弹窗
const StockConfigModal = defineAsyncComponent(() => import('./StockConfigModal.vue'));

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const toast = useToast();
const showModal = ref(false);
const CACHE_TIME = 15 * 60 * 1000;

// === 配置状态 ===
const CACHE_KEY = `widget_stock_${props.item.id}`;
const config = useLocalStorage(CACHE_KEY, {
  symbols: ['bitcoin', 'ethereum', 'solana'], // 默认币种ID (CoinGecko)
  colorMode: 'cn', // 'cn' (红涨绿跌) | 'global' (绿涨红跌)
  refreshRate: 60, // 刷新间隔(秒)
});

// === 数据状态 ===
const marketData = ref<any[]>([]);
const historyData = ref<number[]>([]); // 仅用于 2x2 走势图
const loading = ref(true);
const activeIndex = ref(0); // 2x1 轮播索引

// === 核心：获取数据 (CoinGecko 示例) ===
const fetchData = async () => {
  const ids = config.value.symbols.join(',');
  if (!ids) {
    loading.value = false;
    return;
  }

  const cache = tempStorage.get('stock');
  const hasMatchingCache = cache
      && tempStorage.isValid(cache.ts, CACHE_TIME)
      && cache.symbols.join(',') === ids;

  if (hasMatchingCache) {
    marketData.value = cache.data;
    historyData.value = cache.history;
    loading.value = false;
    return;
  }

  try {
    // 1. 获取当前价格
    const data = await fetchJsonWithRetry<any[]>(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`,
        {cache: 'no-store'},
        {
          timeoutMs: 10000,
          retries: 2,
          retryDelayMs: 700,
          maxRetryDelayMs: 5000,
          metricName: 'stock.market',
          fallbackName: 'stock.cache.market',
          fallbackData: () => cache?.symbols.join(',') === ids ? cache.data : undefined,
        }
    );
    marketData.value = data;

    // 2. 如果是 2x2 模式，额外获取走势数据 (仅第一只)
    if (layout.value.isStandard && config.value.symbols[0]) {
      const chartJson = await fetchJsonWithRetry<{prices?: any[]}>(
          `https://api.coingecko.com/api/v3/coins/${config.value.symbols[0]}/market_chart?vs_currency=usd&days=1&interval=hourly`,
          {cache: 'no-store'},
          {
            timeoutMs: 10000,
            retries: 2,
            retryDelayMs: 700,
            maxRetryDelayMs: 5000,
            metricName: 'stock.chart',
            fallbackName: 'stock.cache.chart',
            fallbackData: () => cache?.symbols.join(',') === ids ? {prices: cache.history.map((price, index) => [index, price])} : undefined,
          }
      );
      historyData.value = (chartJson.prices || []).map((p: any) => p[1]);
    }

    tempStorage.set('stock', {
      data: marketData.value,
      history: historyData.value,
      symbols: [...config.value.symbols],
      ts: Date.now(),
    });
  } catch {
    if (cache?.symbols.join(',') === ids) {
      marketData.value = cache.data;
      historyData.value = cache.history;
    } else {
      toast.warning('行情数据获取失败，请稍后重试');
    }
  } finally {
    loading.value = false;
  }
};

// 定时刷新
const {} = useIntervalFn(fetchData, config.value.refreshRate * 1000);

onMounted(fetchData);

// 2x1 轮播逻辑
useIntervalFn(() => {
  if (layout.value.isWide && marketData.value.length > 1) {
    activeIndex.value = (activeIndex.value + 1) % marketData.value.length;
  }
}, 3000);

// === 辅助逻辑 ===
const layout = computed(() => {
  const w = props.item.w || 2;
  const h = props.item.h || 2;
  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    isStandard: w === 2 && h === 2,
    isList: w >= 2 && h >= 3
  };
});

// 获取当前展示的数据 (针对 1x1 和 2x2 默认取第一个，2x1 取轮播)
const currentItem = computed(() => {
  if (marketData.value.length === 0) return null;
  if (layout.value.isWide) return marketData.value[activeIndex.value];
  return marketData.value[0]; // 默认取第一个
});

// 颜色判断
const getColorClass = (change: number) => {
  const isUp = change >= 0;
  if (config.value.colorMode === 'cn') {
    return isUp ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-green-500 bg-green-500/10 border-green-500/20';
  } else {
    return isUp ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-red-500 bg-red-500/10 border-red-500/20';
  }
};

// SVG 走势图路径生成
const sparklinePath = computed(() => {
  if (historyData.value.length < 2) return '';
  const data = historyData.value;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const width = 100; // viewBox width
  const height = 40; // viewBox height

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  return `M${points.join(' L')}`;
});
</script>

<template>
  <div class="w-full h-full relative cursor-pointer group" @click="!isEditMode && (showModal = true)">

    <div v-if="loading && marketData.length === 0"
         class="w-full h-full flex items-center justify-center bg-[#1a1a1a] text-white/20">
      <PhChartLineUp class="animate-bounce" size="24"/>
    </div>

    <div v-else
         class="w-full h-full rounded-[22px] overflow-hidden relative bg-[#1a1a1a] border border-white/5 shadow-lg flex flex-col">

      <div v-if="layout.isMini && currentItem"
           class="w-full h-full flex flex-col items-center justify-center p-2 relative overflow-hidden"
           :class="getColorClass(currentItem.price_change_percentage_24h).replace('text-', 'bg-').replace('/10', '/20')"
      >
        <div class="absolute -right-2 -bottom-2 text-6xl opacity-20 grayscale pointer-events-none rotate-12">
          {{ currentItem.price_change_percentage_24h >= 0 ? '🐮' : '🐻' }}
        </div>

        <div class="relative z-10 text-center">
          <div class="text-[10px] font-bold uppercase tracking-wider opacity-80 mix-blend-overlay">
            {{ currentItem.symbol }}
          </div>
          <div
              class="text-xl font-black tracking-tight flex items-center justify-center gap-0.5 text-white drop-shadow-md">
            {{ currentItem.price_change_percentage_24h > 0 ? '+' : '' }}
            {{ currentItem.price_change_percentage_24h.toFixed(1) }}%
          </div>
          <div class="text-[9px] font-mono opacity-80 text-white mt-0.5">
            ${{ currentItem.current_price.toLocaleString() }}
          </div>
        </div>
      </div>

      <div v-else-if="layout.isWide && currentItem" class="w-full h-full flex items-center justify-between px-5">
        <div class="flex items-center gap-3">
          <img :src="currentItem.image" class="w-8 h-8 rounded-full bg-white/10 p-0.5" alt="icon">
          <div>
            <div class="text-sm font-bold text-white leading-none">{{ currentItem.name }}</div>
            <div class="text-[10px] text-white/40 mt-1 uppercase font-mono tracking-wide">
              {{ currentItem.symbol }} · ${{ currentItem.current_price.toLocaleString() }}
            </div>
          </div>
        </div>

        <div class="px-2.5 py-1 rounded-lg font-bold font-mono text-sm border flex items-center gap-1"
             :class="getColorClass(currentItem.price_change_percentage_24h)">
          <component :is="currentItem.price_change_percentage_24h >= 0 ? PhTrendUp : PhTrendDown" weight="bold"/>
          {{ Math.abs(currentItem.price_change_percentage_24h).toFixed(2) }}%
        </div>
      </div>

      <div v-else-if="layout.isStandard && currentItem" class="w-full h-full p-4 flex flex-col relative">
        <div class="flex justify-between items-start z-10">
          <div class="flex items-center gap-2">
            <img :src="currentItem.image" class="w-6 h-6 rounded-full" alt="icon">
            <span class="text-sm font-bold text-white">{{ currentItem.symbol.toUpperCase() }}</span>
          </div>
          <div class="text-xs font-bold" :class="getColorClass(currentItem.price_change_percentage_24h).split(' ')[0]">
            {{
              currentItem.price_change_percentage_24h >= 0 ? '+' : ''
            }}{{ currentItem.price_change_percentage_24h.toFixed(2) }}%
          </div>
        </div>

        <div class="mt-1 z-10">
          <div class="text-2xl font-black text-white font-mono tracking-tight">
            ${{ currentItem.current_price.toLocaleString() }}
          </div>
        </div>

        <div class="absolute left-0 right-0 bottom-0 h-16 opacity-30 mask-linear-gradient">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="w-full h-full">
            <path
                :d="sparklinePath"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                :class="currentItem.price_change_percentage_24h >= 0
                ? (config.colorMode === 'cn' ? 'text-red-500' : 'text-green-500')
                : (config.colorMode === 'cn' ? 'text-green-500' : 'text-red-500')"
            />
          </svg>
        </div>

        <div class="absolute right-2 bottom-2 text-4xl opacity-10 grayscale select-none pointer-events-none">
          {{ currentItem.price_change_percentage_24h >= 0 ? '🐮' : '🐻' }}
        </div>
      </div>

      <div v-else class="w-full h-full p-4 flex flex-col">
        <div class="flex justify-between items-center mb-3 pb-2 border-b border-white/5">
          <div class="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
            <PhCurrencyBtc weight="fill"/>
            Market Watch
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1">
          <div v-for="coin in marketData" :key="coin.id"
               class="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group/item">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white/80 w-8">{{ coin.symbol.toUpperCase() }}</span>
              <span class="text-[10px] text-white/40 font-mono">${{ coin.current_price.toLocaleString() }}</span>
            </div>
            <div class="text-xs font-mono font-bold"
                 :class="getColorClass(coin.price_change_percentage_24h).split(' ')[0]">
              {{ coin.price_change_percentage_24h >= 0 ? '+' : '' }}{{ coin.price_change_percentage_24h.toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>

    </div>

    <Teleport to="body">
      <StockConfigModal
          v-if="showModal"
          :show="showModal"
          :config="config"
          @close="showModal = false"
          @save="(val:any) => { config = val; fetchData(); }"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 0;
}
</style>
