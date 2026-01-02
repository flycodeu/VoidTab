<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import type {SiteItem} from '../../../core/config/types';
import { PhCpu, PhWifiHigh} from '@phosphor-icons/vue';
import SystemMonitorDetailModal from './SystemMonitorDetailModal.vue';

const props = defineProps<{ item: SiteItem }>();
const showModal = ref(false);

const stats = ref({
  ping: 24, download: 12.5, upload: 2.1, memory: 45,
  ip: '192.168.1.105', browser: 'Chrome (820MB)'
});

let interval: any = null;
onMounted(() => {
  interval = setInterval(() => {
    stats.value.ping = Math.floor(Math.random() * 20) + 10;
    stats.value.memory = Math.floor(Math.random() * 10) + 40;
  }, 3000);
});
onUnmounted(() => clearInterval(interval));

const layout = computed(() => {
  const w = props.item?.w ?? 2;
  const h = props.item?.h ?? 2;
  return {
    isMini: w === 1 && h === 1,
    isSlim: w === 1 && h === 2,
    isStandard: w === 2 && h === 2,
    isWide: w === 4
  };
});
</script>

<template>
  <div
      class="w-full h-full p-3.5 bg-[#121212] rounded-[22px] text-white flex flex-col cursor-pointer transition-transform active:scale-95"
      @click.stop="showModal = true">

    <div class="flex-1 flex flex-col justify-center gap-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 overflow-hidden">
          <PhWifiHigh size="18" class="text-green-400 shrink-0"/>
          <span class="text-xs font-medium text-white/50 truncate uppercase tracking-tight">网络延迟</span>
        </div>
        <span class="text-sm font-bold tabular-nums shrink-0">{{ stats.ping }}ms</span>
      </div>

      <div v-if="layout.isStandard || layout.isWide" class="space-y-1.5">
        <div class="flex justify-between text-[10px] text-white/40 font-bold uppercase">
          <div class="flex items-center gap-1">
            <PhCpu size="12"/>
            Memory
          </div>
          <span>{{ stats.memory }}%</span>
        </div>
        <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 transition-all duration-700" :style="{ width: stats.memory + '%' }"></div>
        </div>
      </div>

      <div v-if="layout.isStandard || layout.isWide" class="flex gap-2">
        <div class="flex-1 p-2 rounded-xl bg-white/5 border border-white/5 min-w-0">
          <div class="text-[8px] text-white/30 uppercase font-bold mb-0.5 truncate">IP Address</div>
          <div class="text-[10px] font-mono truncate text-blue-300/80">{{ stats.ip }}</div>
        </div>
        <div class="flex-1 p-2 rounded-xl bg-white/5 border border-white/5 min-w-0">
          <div class="text-[8px] text-white/30 uppercase font-bold mb-0.5 truncate">Resources</div>
          <div class="text-[10px] truncate text-white/70">{{ stats.browser.split(' ')[0] }}</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <SystemMonitorDetailModal :show="showModal" :stats="stats" @close="showModal = false"/>
    </Teleport>
  </div>
</template>