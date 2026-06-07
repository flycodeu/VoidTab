<script setup lang="ts">
import {ref, computed, onMounted, defineAsyncComponent} from 'vue';
import {useIntervalFn, useLocalStorage} from '@vueuse/core';
import type {SiteItem} from '../../../../core/config/types';
import {PhTrendUp, PhTrendDown, PhChartLineUp, PhWarningCircle, PhArrowClockwise} from '@phosphor-icons/vue';
import {tempStorage} from '../../../../core/storage/tempStorage';
import {useToast} from '../../../../shared/composables/useToast';
import {fetchStockMarketData, normalizeStockSymbols, type StockMarketItem} from './stockData';

// 异步加载配置弹窗
const StockConfigModal = defineAsyncComponent(() => import('./StockConfigModal.vue'));

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const toast = useToast();
const showModal = ref(false);
const CACHE_TIME = 15 * 60 * 1000;

// === 配置状态 ===
const CACHE_KEY = `widget_stock_${props.item.id}`;
const config = useLocalStorage(CACHE_KEY, {
  symbols: ['AAPL', 'MSFT', 'NVDA'],
  colorMode: 'cn', // 'cn' (红涨绿跌) | 'global' (绿涨红跌)
  refreshRate: 60, // 刷新间隔(秒)
});

// === 数据状态 ===
const marketData = ref<StockMarketItem[]>([]);
const historyData = ref<number[]>([]); // 仅用于 2x2 走势图
const loading = ref(true);
const activeIndex = ref(0); // 2x1 轮播索引
const errorMessage = ref('');
const hasWarnedFailure = ref(false);

const normalizeSymbols = () => {
  return normalizeStockSymbols(config.value.symbols);
};

// === 核心：获取股票/ETF/指数数据 ===
const fetchData = async () => {
  const symbols = normalizeSymbols();
  const symbolKey = symbols.join(',');
  if (!symbolKey) {
    loading.value = false;
    return;
  }

  const cache = tempStorage.get('stock');
  const hasMatchingCache = cache
      && tempStorage.isValid(cache.ts, CACHE_TIME)
      && Array.isArray(cache.symbols)
      && cache.symbols.join(',') === symbolKey;

  if (hasMatchingCache) {
    marketData.value = cache.data;
    historyData.value = cache.history;
    loading.value = false;
    return;
  }

  try {
    const result = await fetchStockMarketData(symbols);
    marketData.value = result.items;
    if (!marketData.value.length) throw new Error('empty stock quote');
    historyData.value = result.history || [];
    errorMessage.value = '';
    hasWarnedFailure.value = false;

    tempStorage.set('stock', {
      data: marketData.value,
      history: historyData.value,
      symbols,
      ts: Date.now(),
    });
  } catch {
    if (cache?.symbols?.join(',') === symbolKey) {
      marketData.value = cache.data;
      historyData.value = cache.history;
      errorMessage.value = '';
    } else {
      errorMessage.value = '行情接口暂时不可用';
      if (!hasWarnedFailure.value) {
        toast.warning('行情接口暂时不可用，已尝试公开源与同源代理。');
        hasWarnedFailure.value = true;
      }
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
  const w = Number(props.item.w || 2);
  const h = Number(props.item.h || 2);
  const isMini = w === 1 && h === 1;
  const isWide = w >= 2 && h === 1;
  const isTall = w === 1 && h >= 2;
  const isStandard = w === 2 && h === 2;
  const isList = w >= 2 && h >= 3;
  return {
    isMini,
    isWide,
    isTall,
    isStandard,
    isList,
    key: isMini ? 'mini' : isWide ? 'wide' : isTall ? 'tall' : isStandard ? 'standard' : 'list',
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

const formatPrice = (item: StockMarketItem | null | undefined) => {
  if (!item) return '--';
  const price = Number(item.current_price);
  if (!Number.isFinite(price)) return '--';
  const currency = item.currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: price >= 100 ? 2 : 4,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
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

  if (range <= 0) {
    return `M0,20 L100,20`;
  }

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  return `M${points.join(' L')}`;
});

const handleSaveConfig = (val: any) => {
  config.value = val;
  loading.value = true;
  errorMessage.value = '';
  void fetchData();
};

const retryFetch = () => {
  loading.value = true;
  errorMessage.value = '';
  void fetchData();
};

const formatChange = (value: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(Math.abs(n) >= 100 ? 1 : 2)}%`;
};
</script>

<template>
  <div
      class="stock-widget w-full h-full relative cursor-pointer group"
      :data-layout="layout.key"
      @click="!isEditMode && (showModal = true)"
  >

    <div v-if="loading && marketData.length === 0"
         class="stock-shell w-full h-full flex items-center justify-center text-white/35">
      <PhChartLineUp class="animate-bounce" size="24"/>
    </div>

    <div v-else-if="errorMessage && marketData.length === 0"
         class="stock-shell w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center text-white/65">
      <PhWarningCircle size="24" class="text-amber-300/80"/>
      <div class="text-[11px] font-bold leading-snug">{{ errorMessage }}</div>
      <button
          type="button"
          class="stock-action"
          @click.stop="retryFetch"
      >
        <PhArrowClockwise size="13" weight="bold"/>
        重试
      </button>
    </div>

    <div v-else
         class="stock-shell w-full h-full overflow-hidden relative flex flex-col">

      <div v-if="layout.isMini && currentItem"
           class="stock-mini w-full h-full flex flex-col items-center justify-center p-2 relative overflow-hidden"
           :class="getColorClass(currentItem.price_change_percentage_24h).replace('text-', 'bg-').replace('/10', '/20')"
      >
        <div class="absolute -right-2 -bottom-2 text-5xl font-black opacity-15 pointer-events-none rotate-12">
          {{ currentItem.symbol.slice(0, 3).toUpperCase() }}
        </div>

        <div class="relative z-10 text-center">
          <div class="text-[10px] font-bold uppercase tracking-wider opacity-80 mix-blend-overlay">
            {{ currentItem.symbol }}
          </div>
          <div
              class="stock-mini-change text-xl font-black tracking-tight flex items-center justify-center gap-0.5 text-white drop-shadow-md">
            {{ formatChange(currentItem.price_change_percentage_24h) }}
          </div>
          <div class="text-[9px] font-mono opacity-80 text-white mt-0.5">
            {{ formatPrice(currentItem) }}
          </div>
        </div>
      </div>

      <div v-else-if="layout.isWide && currentItem" class="stock-wide w-full h-full">
        <div class="stock-identity min-w-0">
          <img v-if="currentItem.image" :src="currentItem.image" class="stock-logo" loading="lazy" decoding="async" alt="">
          <div v-else class="stock-logo stock-logo-fallback">
            {{ currentItem.symbol.slice(0, 1) }}
          </div>
          <div class="min-w-0">
            <div class="stock-name">{{ currentItem.name }}</div>
            <div class="stock-meta">
              {{ currentItem.symbol }} · {{ formatPrice(currentItem) }}
            </div>
          </div>
        </div>

        <div class="stock-change-badge"
             :class="getColorClass(currentItem.price_change_percentage_24h)">
          <component :is="currentItem.price_change_percentage_24h >= 0 ? PhTrendUp : PhTrendDown" weight="bold"/>
          {{ formatChange(currentItem.price_change_percentage_24h) }}
        </div>
      </div>

      <div v-else-if="layout.isTall && currentItem" class="stock-tall w-full h-full">
        <div class="stock-tall-top">
          <img v-if="currentItem.image" :src="currentItem.image" class="stock-logo stock-logo-lg" loading="lazy" decoding="async" alt="">
          <div v-else class="stock-logo stock-logo-lg stock-logo-fallback">
            {{ currentItem.symbol.slice(0, 1) }}
          </div>
          <div class="stock-symbol">{{ currentItem.symbol.toUpperCase() }}</div>
          <div class="stock-name stock-name-center">{{ currentItem.name }}</div>
        </div>

        <div class="stock-tall-bottom">
          <div class="stock-price">{{ formatPrice(currentItem) }}</div>
          <div class="stock-change-badge"
               :class="getColorClass(currentItem.price_change_percentage_24h)">
            <component :is="currentItem.price_change_percentage_24h >= 0 ? PhTrendUp : PhTrendDown" weight="bold"/>
            {{ formatChange(currentItem.price_change_percentage_24h) }}
          </div>
        </div>
      </div>

      <div v-else-if="layout.isStandard && currentItem" class="w-full h-full p-4 flex flex-col relative">
        <div class="flex justify-between items-start z-10">
          <div class="flex items-center gap-2">
            <img v-if="currentItem.image" :src="currentItem.image" class="w-6 h-6 rounded-full object-contain" loading="lazy" decoding="async" alt="">
            <div v-else class="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-black text-white">
              {{ currentItem.symbol.slice(0, 1) }}
            </div>
            <span class="text-sm font-bold text-white">{{ currentItem.symbol.toUpperCase() }}</span>
          </div>
          <div class="text-xs font-bold" :class="getColorClass(currentItem.price_change_percentage_24h).split(' ')[0]">
            {{ formatChange(currentItem.price_change_percentage_24h) }}
          </div>
        </div>

        <div class="mt-1 z-10">
          <div class="text-2xl font-black text-white font-mono tracking-tight">
            {{ formatPrice(currentItem) }}
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

        <div class="absolute right-2 bottom-2 text-3xl font-black opacity-10 select-none pointer-events-none">
          {{ currentItem.symbol.slice(0, 3).toUpperCase() }}
        </div>
      </div>

      <div v-else class="stock-list w-full h-full p-4 flex flex-col">
        <div class="flex justify-between items-center mb-3 pb-2 border-b border-white/10">
          <div class="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
            <PhChartLineUp weight="fill"/>
            Market Watch
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1">
          <div v-for="coin in marketData" :key="coin.id"
               class="stock-list-row">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs font-bold text-white/80 w-8">{{ coin.symbol.toUpperCase() }}</span>
              <span class="text-[10px] text-white/45 font-mono truncate">{{ formatPrice(coin) }}</span>
            </div>
            <div class="text-xs font-mono font-bold"
                 :class="getColorClass(coin.price_change_percentage_24h).split(' ')[0]">
              {{ formatChange(coin.price_change_percentage_24h) }}
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
          @save="handleSaveConfig"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.stock-widget {
  min-width: 0;
  min-height: 0;
}

.stock-shell {
  border-radius: 18px;
  background:
      radial-gradient(circle at 0% 0%, rgba(248, 113, 113, 0.20), transparent 34%),
      radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.14), transparent 36%),
      #171717;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);
  color: white;
}

.stock-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-weight: 800;
}

.stock-wide {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  min-width: 0;
}

.stock-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stock-logo {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.12);
  object-fit: cover;
  padding: 2px;
}

.stock-logo-lg {
  width: 38px;
  height: 38px;
}

.stock-logo-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 12px;
  font-weight: 900;
  color: white;
}

.stock-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: white;
  font-size: 13px;
  line-height: 1.05;
  font-weight: 900;
}

.stock-name-center {
  width: 100%;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
}

.stock-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 10px;
  line-height: 1;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-transform: uppercase;
}

.stock-change-badge {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1;
  font-weight: 900;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  border-width: 1px;
}

.stock-tall {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 12px 10px;
  min-width: 0;
}

.stock-tall-top,
.stock-tall-bottom {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stock-symbol {
  margin-top: 8px;
  color: white;
  font-size: 14px;
  line-height: 1;
  font-weight: 950;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.stock-price {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 8px;
  color: white;
  font-size: 13px;
  line-height: 1;
  font-weight: 900;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.stock-list-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  transition: background 0.16s ease, border-color 0.16s ease;
}

.stock-list-row:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
}

.stock-widget[data-layout="wide"] .stock-change-badge {
  max-width: 96px;
}

.stock-widget[data-layout="mini"] .stock-shell,
.stock-widget[data-layout="wide"] .stock-shell,
.stock-widget[data-layout="tall"] .stock-shell {
  border-radius: 16px;
}

.stock-widget[data-layout="mini"] .stock-mini-change {
  font-size: 18px;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 0;
}
</style>
