<script setup lang="ts">
import {ref, computed, onBeforeUnmount, watch} from 'vue';
import {useIntervalFn, useDebounceFn} from '@vueuse/core';
import type {SiteItem} from '../../../../core/config/types';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useToast} from '../../../../shared/composables/useToast';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';

import {
  PhHandsPraying, PhSpeakerHigh, PhSpeakerSlash,
  PhLightning, PhWaves, PhTrendUp
} from '@phosphor-icons/vue';

const store = useConfigStore();
const toast = useToast();

if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.widgetState) store.config.runtime.widgetState = {};
const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 1), h: Number(props.item.h || 1)}));

// === 状态管理 ===
const saveDebounced = useDebounceFn(() => store.saveConfig?.(), 300);
type MeritState = { meritCount: number; soundEnabled: boolean };

const getState = (): MeritState => {
  const id = props.item.id;
  if (!store.config.runtime.widgetState[id]) {
    store.config.runtime.widgetState[id] = {meritCount: 0, soundEnabled: true};
  }
  return store.config.runtime.widgetState[id];
};

const meritCount = computed<number>({
  get: () => getState().meritCount ?? 0,
  set: (v) => {
    getState().meritCount = Number(v) || 0;
    saveDebounced();
  },
});

const soundEnabled = computed<boolean>({
  get: () => getState().soundEnabled ?? true,
  set: (v) => {
    getState().soundEnabled = !!v;
    saveDebounced();
  },
});

const isAutoMode = ref(false);
let audioFailureNotified = false;

// 动画状态
const isAnimate = ref(false);
const isHammering = ref(false);
const floatingTexts = ref<{ id: number; x: number; y: number; text: string; scale: number }[]>([]);
let textIdCounter = 0;

// === 布局判断 ===
const layout = computed(() => {
  const {w, h} = tileSize.value.placement;
  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    isTall: w === 1 && h >= 2,
    isStandard: w === 2 && h === 2,
    isLarge: w >= 2 && h >= 3         // 2x4 布局
  };
});

// 计算境界
const meritLevel = computed(() => {
  const count = meritCount.value;
  if (count < 100) return '沙弥';
  if (count < 1000) return '比丘';
  if (count < 10000) return '住持';
  if (count < 100000) return '罗汉';
  if (count < 1000000) return '菩萨';
  return '佛陀';
});

// === 声音合成 ===
const playWoodSound = () => {
  if (!soundEnabled.value) return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    // ... (声音逻辑保持不变)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);

    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(50, now + 0.15);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.5, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
    osc2.start(now);
    osc2.stop(now + 0.25);
  } catch {
    if (!audioFailureNotified) {
      audioFailureNotified = true;
      toast.warning('音频播放失败，请检查浏览器音频权限');
    }
  }
};

// === 敲击 ===
const knock = (e?: MouseEvent) => {
  if (props.isEditMode) return;

  meritCount.value++;
  playWoodSound();

  if (navigator.vibrate) navigator.vibrate(15);

  isAnimate.value = true;
  isHammering.value = true;

  setTimeout(() => isAnimate.value = false, 100);
  setTimeout(() => isHammering.value = false, 150);

  if (floatingTexts.value.length > 20) floatingTexts.value.shift();

  let startX, startY;
  // 2x4 适配：文字从中间上方飘起
  if (layout.value.isLarge) {
    startX = 50 + (Math.random() * 40);
    startY = 50;
  } else {
    startX = e ? e.offsetX : (Math.random() * 60 + (layout.value.isMini ? 10 : 40));
    startY = e ? e.offsetY : (layout.value.isMini ? 20 : 50);
  }

  const id = textIdCounter++;
  floatingTexts.value.push({
    id,
    x: startX,
    y: startY,
    text: '功德 +1',
    scale: 0.8 + Math.random() * 0.4
  });

  setTimeout(() => {
    floatingTexts.value = floatingTexts.value.filter(t => t.id !== id);
  }, 800);
};

// === 自动挂机 ===
const {pause, resume} = useIntervalFn(() => {
  knock();
}, 700, {immediate: false});

watch(isAutoMode, (val) => {
  if (val) resume();
  else pause();
});

onBeforeUnmount(() => pause());
</script>

<template>
  <div
      class="w-full h-full relative cursor-pointer select-none overflow-hidden group font-sans transition-all duration-300"
      :class="[
        'bg-[#121212] text-[#E0E0E0]',
        layout.isLarge ? 'bg-gradient-to-b from-[#151515] to-[#050505]' : ''
      ]"
      @click="knock"
  >
    <div class="absolute inset-0 pointer-events-none opacity-[0.03] z-0">
      <svg width="100%" height="100%">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>
    </div>

    <div class="absolute inset-0 pointer-events-none overflow-hidden z-[60]">
      <transition-group name="float-up">
        <div
            v-for="item in floatingTexts"
            :key="item.id"
            class="absolute font-bold text-amber-400 whitespace-nowrap drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
            :style="{
              left: item.x + 'px',
              top: item.y + 'px',
              fontSize: layout.isMini ? '10px' : '14px',
              transform: `scale(${item.scale})`
            }"
        >
          {{ item.text }}
        </div>
      </transition-group>
    </div>

    <div v-if="layout.isMini" class="w-full h-full flex flex-col items-center justify-center relative z-10">
      <RealisticWoodenFish :animate="isAnimate" size="52"/>
      <div class="text-[10px] font-mono opacity-60 tabular-nums tracking-tighter mt-1">
        {{ meritCount > 999 ? (meritCount / 1000).toFixed(1) + 'k' : meritCount }}
      </div>
    </div>

    <div v-else-if="layout.isWide" class="w-full h-full flex items-center justify-between px-6 z-10 relative">
      <div class="flex items-center gap-4">
        <RealisticWoodenFish :animate="isAnimate" size="60"/>
        <div class="flex flex-col">
          <span class="text-xs font-bold text-amber-500">电子木鱼</span>
          <span class="text-[10px] text-white/40">Zen Mode</span>
        </div>
      </div>
      <div class="text-xl font-mono font-bold text-white/90 tabular-nums">
        {{ meritCount }}
      </div>
    </div>

    <div v-else-if="layout.isTall" class="w-full h-full flex flex-col items-center justify-between py-6 z-10 relative">
      <div class="flex flex-col items-center gap-1">
        <PhWaves weight="fill" class="text-amber-500/50"/>
        <span class="text-[10px] opacity-40 uppercase tracking-widest">Merit</span>
      </div>
      <RealisticWoodenFish :animate="isAnimate" size="70"/>
      <div class="flex flex-col items-center w-full px-4">
        <div class="text-lg font-mono font-bold tabular-nums text-amber-100">{{ meritCount }}</div>
        <div class="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
               :style="{ width: Math.min((meritCount % 100), 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-else-if="layout.isStandard" class="w-full h-full flex flex-col p-4 z-10 relative justify-between">
      <div class="flex justify-between items-start w-full z-20">
        <div class="flex items-center gap-1.5 text-amber-500">
          <PhHandsPraying size="16" weight="duotone"/>
          <span class="text-xs font-bold">功德</span>
        </div>

        <div class="flex items-center gap-2">
          <button
              @click.stop="isAutoMode = !isAutoMode"
              class="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 border"
              :class="isAutoMode ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'"
              title="自动积德"
          >
            <PhLightning size="12" weight="fill"/>
          </button>

          <button
              @click.stop="soundEnabled = !soundEnabled"
              class="flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <component :is="soundEnabled ? PhSpeakerHigh : PhSpeakerSlash" size="14"/>
          </button>
        </div>
      </div>

      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <RealisticWoodenFish :animate="isAnimate" size="100"/>
        <div v-if="isAutoMode" class="absolute inset-0 flex items-center justify-center -z-10">
          <div class="w-32 h-32 bg-amber-500/10 rounded-full blur-2xl animate-pulse"></div>
        </div>
      </div>

      <div class="flex justify-center mt-auto z-10">
        <div
            class="bg-[#1a1a1a]/80 border border-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-mono font-bold tracking-wider text-amber-100 shadow-lg tabular-nums">
          {{ meritCount }}
        </div>
      </div>
    </div>

    <div v-else class="w-full h-full relative p-3 z-10 flex flex-col justify-between">

      <div class="absolute top-3 right-3 flex gap-1.5 z-40">
        <button
            @click.stop="soundEnabled = !soundEnabled"
            class="w-6 h-6 flex items-center justify-center rounded-md bg-white/5 text-white/40 hover:text-white transition-colors border border-white/5"
        >
          <component :is="soundEnabled ? PhSpeakerHigh : PhSpeakerSlash" size="12"/>
        </button>

        <button
            @click.stop="isAutoMode = !isAutoMode"
            class="flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-medium transition-all border"
            :class="isAutoMode
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'"
        >
          <div class="w-1 h-1 rounded-full"
               :class="isAutoMode ? 'bg-green-400 animate-pulse' : 'bg-white/20'"></div>
          {{ isAutoMode ? '挂机' : '挂机' }}
        </button>
      </div>

      <div class="absolute inset-0 flex items-center justify-center pb-8 pointer-events-none">
        <div v-if="isAutoMode"
             class="absolute w-32 h-32 bg-amber-500/10 rounded-full blur-3xl animate-pulse pointer-events-none"></div>

        <div
            class="absolute z-20 transition-transform duration-75 ease-out origin-bottom-right"
            style="right: 25%; top: 20%; width: 80px; height: 80px;"
            :class="isHammering ? 'rotate-[-35deg] translate-y-2' : 'rotate-0'"
        >
          <div
              class="absolute bottom-1 left-1 w-5 h-8 bg-gradient-to-br from-[#5c5c5c] to-[#2a2a2a] rounded-lg shadow-lg transform -rotate-12 z-20"></div>
          <div
              class="absolute bottom-3 left-2 w-2 h-14 bg-gradient-to-r from-[#8B4513] to-[#5D2906] rounded-full transform -rotate-12 shadow-md z-10 origin-bottom"></div>
        </div>

        <RealisticWoodenFish :animate="isAnimate" size="120" class="drop-shadow-2xl z-10"/>
      </div>

      <div class="mt-auto flex justify-between items-end w-full gap-2 z-30">
        <div
            class="flex-1 bg-[#1E1E1E]/80 backdrop-blur-sm rounded-lg p-2 border border-white/5 flex flex-col justify-center shadow-lg h-[50px]">
          <span class="text-[9px] text-gray-500 font-medium tracking-wide">当前境界</span>
          <span class="text-sm font-bold text-amber-300 truncate mt-0.5">{{ meritLevel }}</span>
        </div>

        <div
            class="flex-1 bg-[#1E1E1E]/80 backdrop-blur-sm rounded-lg p-2 border border-white/5 flex flex-col justify-center shadow-lg h-[50px] relative overflow-hidden">
          <div class="absolute right-0 top-0 p-1 opacity-10 text-white">
            <PhTrendUp size="20" weight="fill"/>
          </div>
          <span class="text-[9px] text-gray-500 font-medium tracking-wide">累计功德</span>
          <span class="text-sm font-mono font-bold text-white tabular-nums tracking-tight break-all leading-none mt-1">
                {{ meritCount }}
            </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {defineComponent, h} from 'vue';

const RealisticWoodenFish = defineComponent({
  props: {size: {type: [Number, String], default: 64}, animate: Boolean},
  setup(props) {
    return () => h('svg', {
      width: props.size,
      height: props.size,
      viewBox: "0 0 200 200",
      class: `transition-all duration-75 ease-out ${props.animate ? 'scale-95 translate-y-1' : 'scale-100'}`,
      style: {overflow: 'visible'}
    }, [
      h('ellipse', {cx: "100", cy: "170", rx: "70", ry: "15", fill: "black", opacity: "0.4", filter: "blur(8px)"}),
      h('defs', [
        h('linearGradient', {id: "woodGradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%"}, [
          h('stop', {offset: "0%", 'stop-color': "#D4A373"}),
          h('stop', {offset: "50%", 'stop-color': "#9C6644"}),
          h('stop', {offset: "100%", 'stop-color': "#603813"})
        ])
      ]),
      h('path', {
        d: "M100,20 C145,20 180,55 180,100 C180,145 145,175 100,175 C55,175 20,145 20,100 C20,55 55,20 100,20 Z",
        fill: "url(#woodGradient)",
        stroke: "#4A2c0F",
        'stroke-width': "2"
      }),
      h('path', {d: "M60,50 Q100,30 140,50 Q130,40 100,40 Q70,40 60,50", fill: "rgba(255,255,255,0.2)"}),
      h('path', {
        d: "M40,100 Q100,130 160,100 Q160,125 100,150 Q40,125 40,100 Z",
        fill: "#2A1808",
        stroke: "#3E2723",
        'stroke-width': "1"
      }),
      h('path', {
        d: "M40,100 Q100,130 160,100",
        fill: "none",
        stroke: "rgba(255,255,255,0.15)",
        'stroke-width': "2",
        'stroke-linecap': "round"
      }),
      h('path', {
        d: "M175,100 Q185,100 190,95",
        fill: "none",
        stroke: "#603813",
        'stroke-width': "3",
        'stroke-linecap': "round"
      })
    ]);
  }
});
</script>

<style scoped>
.float-up-enter-active {
  transition: all 0.8s cubic-bezier(0.215, 0.610, 0.355, 1.000);
}

.float-up-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.5);
}

.float-up-leave-active {
  transition: all 0.6s ease-in;
}

.float-up-leave-to {
  opacity: 0;
  transform: translateY(-60px);
}
</style>
