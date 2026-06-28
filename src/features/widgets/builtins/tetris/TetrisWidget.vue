<script setup lang="ts">
import {ref, defineAsyncComponent} from 'vue';

// 异步加载游戏本体
const TetrisGameModal = defineAsyncComponent(() => import('./TetrisGameModal.vue'));

const props = defineProps<{
  item?: any;
  isEditMode?: boolean;
}>();

const isHovered = ref(false);
const showGame = ref(false);

const handleClick = () => {
  if (props.isEditMode) return;
  showGame.value = true;
};
</script>

<template>
  <div
      class="w-full h-full flex flex-col items-center justify-center cursor-pointer relative overflow-hidden bg-zinc-900 rounded-3xl border border-zinc-700 shadow-lg transition-all hover:border-cyan-500 group"
      @click="handleClick"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
  >
    <div class="absolute inset-0 opacity-20"
         style="background-image: radial-gradient(#3f3f46 1px, transparent 1px); background-size: 8px 8px;">
    </div>

    <div class="relative w-16 h-16 transition-transform duration-300" :class="{ 'scale-110': isHovered }">
      <!-- T 形方块 -->
      <div class="absolute left-2 top-2 w-4 h-4 bg-fuchsia-500 rounded-sm shadow-[0_0_8px_rgba(217,70,239,0.5)]"></div>
      <div class="absolute left-6 top-2 w-4 h-4 bg-fuchsia-500 rounded-sm shadow-[0_0_8px_rgba(217,70,239,0.5)]"></div>
      <div class="absolute left-10 top-2 w-4 h-4 bg-fuchsia-500 rounded-sm shadow-[0_0_8px_rgba(217,70,239,0.5)]"></div>
      <div class="absolute left-6 top-6 w-4 h-4 bg-fuchsia-400 rounded-sm shadow-[0_0_8px_rgba(217,70,239,0.6)]"></div>
      <!-- 底部堆叠 -->
      <div class="absolute left-0 bottom-0 w-4 h-4 bg-cyan-500 rounded-sm"></div>
      <div class="absolute left-4 bottom-0 w-4 h-4 bg-amber-500 rounded-sm"></div>
      <div class="absolute left-8 bottom-0 w-4 h-4 bg-cyan-500 rounded-sm"></div>
      <div class="absolute left-12 bottom-0 w-4 h-4 bg-amber-500 rounded-sm"></div>
    </div>

    <div class="mt-4 font-bold text-zinc-400 font-mono text-xs group-hover:text-cyan-400 transition-colors">
      俄罗斯方块
    </div>
  </div>

  <Teleport to="body">
    <TetrisGameModal
        v-if="showGame"
        :show="showGame"
        @close="showGame = false"
    />
  </Teleport>
</template>
