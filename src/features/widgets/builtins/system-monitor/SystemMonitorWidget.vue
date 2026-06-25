<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import {
  PhCpu,
  PhWifiHigh,
  PhBatteryCharging,
  PhBatteryFull,
  PhBatteryWarning,
  PhDesktop,
  PhActivity,
  PhGlobe,
  PhPulse
} from '@phosphor-icons/vue';
import SystemMonitorDetailModal from './SystemMonitorDetailModal.vue';
import {useSystemStats} from './useSystemStats';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';

const props = defineProps<{ item: SiteItem }>();
const showModal = ref(false);
const tileSize = useTileSizeContext(() => ({w: Number(props.item?.w ?? 2), h: Number(props.item?.h ?? 2)}));

const {stats} = useSystemStats({pingUrl: '/ping'});

// Battery API
const battery = ref({level: 1, charging: false, supported: false});
let batteryManager: any = null;

const updateBattery = () => {
  if (batteryManager) {
    battery.value = {
      level: batteryManager.level,
      charging: batteryManager.charging,
      supported: true
    };
  }
};

onMounted(async () => {
  if ('getBattery' in navigator) {
    try {
      batteryManager = await (navigator as any).getBattery();
      updateBattery();
      batteryManager.addEventListener('levelchange', updateBattery);
      batteryManager.addEventListener('chargingchange', updateBattery);
    } catch {
      battery.value.supported = false;
    }
  }
});

const layout = computed(() => {
  const {w, h} = tileSize.value.placement;
  return {
    isMini: w === 1 && h === 1,
    isSlim: w === 1 && h >= 2,
    isWide: w >= 2 && h === 1,
    isStandard: w === 2 && h === 2,
    isLarge: w >= 2 && h > 2
  };
});

const pingVal = computed(() => stats.value?.latencyMs ?? stats.value?.net.rttMs ?? 0);
const pingColor = computed(() => {
  if (pingVal.value < 100) return 'text-emerald-500';
  if (pingVal.value < 300) return 'text-amber-500';
  return 'text-rose-500';
});

const memPercent = computed(() => {
  const sys = stats.value?.memory.usedPercent;
  if (typeof sys === 'number') return sys;
  const used = stats.value?.memory.jsHeapUsedMB;
  const limit = stats.value?.memory.jsHeapLimitMB;
  if (used && limit) return Math.min(100, Math.round((used / limit) * 100));
  return 0;
});

const batteryIcon = computed(() => {
  if (battery.value.charging) return PhBatteryCharging;
  if (battery.value.level < 0.2) return PhBatteryWarning;
  return PhBatteryFull;
});
</script>

<template>
  <div
      class="w-full h-full rounded-[22px] transition-all active:scale-[0.98] border shadow-sm relative overflow-hidden group cursor-pointer"
      :class="'bg-[var(--widget-surface)] text-[var(--widget-text)] border-[var(--widget-border)] hover:bg-[var(--widget-surface-2)] hover:border-[var(--accent-color)]'"
      @click.stop="showModal = true"
  >
    <PhPulse
        class="absolute -right-6 -top-6 text-[var(--accent-color)] opacity-[0.03] rotate-12 transition-transform group-hover:rotate-45"
        :size="140"
        weight="fill"
    />

    <div v-if="layout.isMini" class="w-full h-full flex flex-col items-center justify-center gap-1 relative z-10">
      <PhActivity size="22" :class="pingColor" weight="duotone"/>
      <div class="text-[11px] font-bold tabular-nums">{{ pingVal }}ms</div>

      <div class="absolute bottom-3 w-8 h-1 bg-[var(--widget-border)] rounded-full overflow-hidden">
        <div class="h-full bg-[var(--accent-color)]" :style="{ width: memPercent + '%' }"></div>
      </div>
    </div>

    <div v-else-if="layout.isSlim" class="w-full h-full flex flex-col justify-between p-3 relative z-10">
      <div class="flex flex-col items-center gap-0.5">
        <PhWifiHigh size="18" :class="pingColor"/>
        <span class="text-[10px] font-mono opacity-80 font-bold">{{ pingVal }}</span>
      </div>

      <div class="flex-1 w-full flex items-center justify-center py-2">
        <div class="w-1.5 h-full bg-[var(--widget-border)] rounded-full relative overflow-hidden flex flex-col justify-end">
          <div class="w-full bg-[var(--accent-color)] transition-all duration-700" :style="{ height: memPercent + '%' }"></div>
        </div>
      </div>

      <div class="flex flex-col items-center gap-0.5 text-[var(--widget-muted)]">
        <component :is="batteryIcon" size="16"/>
        <span class="text-[9px] font-bold">{{ Math.round(battery.level * 100) }}%</span>
      </div>
    </div>

    <div v-else-if="layout.isWide" class="w-full h-full flex items-center justify-between px-4 py-2 relative z-10">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-[var(--widget-surface-2)] border border-[var(--widget-border)] flex items-center justify-center">
          <PhWifiHigh size="18" :class="pingColor" weight="bold"/>
        </div>
        <div class="flex flex-col">
          <div class="text-[10px] text-[var(--widget-muted)] uppercase font-bold tracking-wider">Ping</div>
          <div class="text-sm font-mono font-bold">{{ pingVal }} ms</div>
        </div>
      </div>

      <div class="h-6 w-[1px] bg-[var(--widget-border)] mx-2"></div>

      <div class="flex-1 max-w-[120px] flex flex-col justify-center">
        <div class="flex justify-between text-[10px] mb-1 font-bold text-[var(--widget-muted)]">
          <span>MEM LOAD</span>
          <span>{{ memPercent }}%</span>
        </div>
        <div class="h-1.5 w-full bg-[var(--widget-border)] rounded-full overflow-hidden">
          <div class="h-full bg-indigo-500" :style="{ width: memPercent + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-else class="w-full h-full p-4 flex flex-col relative z-10">
      <div class="flex justify-between items-start mb-3">
        <div class="flex items-center gap-2">
          <div class="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-500">
            <PhActivity size="16" weight="bold"/>
          </div>
          <span class="text-xs font-bold tracking-wider opacity-90">SYSTEM</span>
        </div>
        <div class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--widget-border)] text-[var(--widget-muted)]">
          {{ pingVal }} ms
        </div>
      </div>

      <div class="flex-1 flex flex-col gap-3">
        <div>
          <div class="flex justify-between text-[10px] text-[var(--widget-muted)] font-bold uppercase mb-1.5 tracking-wide">
            <div class="flex items-center gap-1.5">
              <PhCpu size="14"/>
              Memory
            </div>
            <span class="text-[var(--widget-text)]">{{ memPercent }}%</span>
          </div>
          <div class="h-2 w-full bg-[var(--widget-border)] rounded-full overflow-hidden">
            <div
                class="h-full bg-gradient-to-r from-[var(--accent-color)] to-indigo-500 transition-all duration-700"
                :style="{ width: memPercent + '%' }"
            ></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-auto">
          <div class="bg-[var(--widget-surface-2)] border border-[var(--widget-border)] rounded-lg p-2 flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <component :is="batteryIcon" size="14" :class="battery.charging ? 'text-green-500' : 'text-amber-500'"/>
              <span class="text-[9px] font-bold opacity-60">BAT</span>
            </div>
            <span class="text-[11px] font-bold">{{ Math.round(battery.level * 100) }}%</span>
          </div>

          <div class="bg-[var(--widget-surface-2)] border border-[var(--widget-border)] rounded-lg p-2 flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <PhDesktop size="14" class="text-sky-500"/>
              <span class="text-[9px] font-bold opacity-60">OS</span>
            </div>
            <span class="text-[11px] font-bold truncate">{{ stats?.browser.ua.includes('Win') ? 'Windows' : 'System' }}</span>
          </div>
        </div>

        <div v-if="layout.isLarge" class="mt-2 pt-2 border-t border-[var(--widget-border)] space-y-2">
          <div class="text-[10px] text-[var(--widget-muted)] font-bold flex items-center gap-1">
            <PhGlobe size="12"/>
            NETWORK METRICS
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="text-[10px] flex flex-col bg-[var(--widget-surface-2)] p-1.5 rounded border border-[var(--widget-border)]">
              <span class="opacity-50 mb-0.5">Downlink</span>
              <span class="font-mono font-bold">{{ stats?.net.downlinkMbps ?? '-' }} Mbps</span>
            </div>
            <div class="text-[10px] flex flex-col bg-[var(--widget-surface-2)] p-1.5 rounded border border-[var(--widget-border)]">
              <span class="opacity-50 mb-0.5">Type</span>
              <span class="font-mono font-bold uppercase">{{ stats?.net.effectiveType ?? '4g' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <SystemMonitorDetailModal :show="showModal" :stats="stats" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>
</style>
