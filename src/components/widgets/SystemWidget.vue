<script setup lang="ts">
import { ref, computed } from 'vue'; // 补上 computed 引用
import { useBattery, useNetwork, useMemory, useFps } from '@vueuse/core';
import { PhCpu, PhWifiHigh, PhBatteryCharging, PhBatteryHigh, PhGauge, PhActivity } from '@phosphor-icons/vue';

// 1. 电池状态
const { charging, level } = useBattery();

// 2. 网络状态
const { effectiveType, downlink, rtt } = useNetwork();

// 3. 内存状态 (修复：正确获取 memory 对象)
const { isSupported: memorySupported, memory } = useMemory();

// 4. FPS (帧率)
const fps = useFps();

// 5. 硬件并发数 (CPU核心)
const cores = navigator.hardwareConcurrency || 4;

// 格式化内存
const formatMem = (v: number) => {
  if (!v) return '0';
  return (v / 1024 / 1024).toFixed(0);
};

// 计算内存百分比 (修复：通过 memory.value 访问)
const memPercent = computed(() => {
  if (!memorySupported.value || !memory.value) return 0;
  // PerformanceMemory 接口包含 jsHeapSizeLimit 和 usedJSHeapSize
  const { jsHeapSizeLimit, usedJSHeapSize } = memory.value as any;
  if (!jsHeapSizeLimit) return 0;
  return (usedJSHeapSize / jsHeapSizeLimit) * 100;
});

// 模拟 CPU 负载波动 (仅视觉效果)
const load = ref(30);
setInterval(() => {
  load.value = Math.min(100, Math.max(10, load.value + (Math.random() - 0.5) * 20));
}, 800);

</script>

<template>
  <div class="h-full flex flex-col apple-glass rounded-2xl overflow-hidden bg-[var(--sidebar-active)] border border-[var(--glass-border)] text-[var(--text-primary)]">

    <div class="flex items-center gap-2 px-5 py-4 border-b border-[var(--glass-border)] bg-black/5">
      <PhActivity size="20" weight="fill" class="text-[var(--accent-color)]" />
      <span class="text-xs font-bold font-tech tracking-widest opacity-80">SYSTEM MONITOR</span>
      <div class="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
    </div>

    <div class="flex-1 p-5 flex flex-col justify-between font-tech text-xs">

      <div class="space-y-1">
        <div class="flex justify-between items-center opacity-70">
          <span class="flex items-center gap-2"><PhCpu size="14"/> CPU_CORES: {{ cores }}</span>
          <span class="text-[var(--accent-color)] font-bold">{{ load.toFixed(0) }}%</span>
        </div>
        <div class="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
          <div class="h-full bg-[var(--accent-color)] transition-all duration-500" :style="{ width: load + '%' }"></div>
        </div>
      </div>

      <div class="space-y-1" v-if="memorySupported && memory">
        <div class="flex justify-between items-center opacity-70">
          <span class="flex items-center gap-2"><PhGauge size="14"/> MEMORY (HEAP)</span>
          <span>{{ formatMem((memory as any).usedJSHeapSize) }}MB</span>
        </div>
        <div class="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
          <div class="h-full bg-purple-500 transition-all duration-300" :style="{ width: memPercent + '%' }"></div>
        </div>
      </div>
      <div class="space-y-1" v-else>
        <div class="flex justify-between items-center opacity-50">
          <span class="flex items-center gap-2"><PhGauge size="14"/> MEMORY</span>
          <span>N/A</span>
        </div>
        <div class="h-1.5 w-full bg-black/10 rounded-full overflow-hidden"></div>
      </div>

      <div class="p-3 rounded-xl bg-black/5 border border-[var(--glass-border)] flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] opacity-50 font-bold mb-1">NETWORK</span>
          <div class="flex items-center gap-2 font-bold text-lg">
            <PhWifiHigh size="18" class="text-blue-500"/>
            {{ downlink || 0 }} <span class="text-[10px] opacity-60 self-end mb-1">Mbps</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] opacity-50 font-bold uppercase">{{ effectiveType || 'Offline' }}</div>
          <div class="font-bold text-green-500">{{ rtt || 0 }}ms</div>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="flex-1 p-3 rounded-xl bg-black/5 border border-[var(--glass-border)] flex flex-col justify-center items-center gap-1">
          <component :is="charging ? PhBatteryCharging : PhBatteryHigh" size="20" :class="charging ? 'text-green-500' : 'opacity-70'"/>
          <span class="font-bold">{{ level ? (level * 100).toFixed(0) : 100 }}%</span>
        </div>
        <div class="flex-1 p-3 rounded-xl bg-black/5 border border-[var(--glass-border)] flex flex-col justify-center items-center gap-1">
          <span class="text-[10px] opacity-50 font-bold">FPS</span>
          <span class="font-bold text-lg text-yellow-500">{{ fps || 60 }}</span>
        </div>
      </div>

    </div>
  </div>
</template>