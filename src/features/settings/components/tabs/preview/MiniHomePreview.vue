<script setup lang="ts">
import {computed} from 'vue';
import {
  PhGithubLogo,
  PhYoutubeLogo,
  PhDribbbleLogo,
  PhFigmaLogo,
  PhDiscordLogo,
  PhSpotifyLogo,
  PhMagnifyingGlass
} from '@phosphor-icons/vue';

// 定义 Props，接收所有视觉参数
const props = defineProps<{
  iconSize: number;
  radius: number;
  gap: number;
  showName: boolean;
  textSize: number;
}>();

// 假数据用于展示
const mockSites = [
  {id: 1, label: 'GitHub', icon: PhGithubLogo, color: 'bg-gray-800'},
  {id: 2, label: 'YouTube', icon: PhYoutubeLogo, color: 'bg-red-600'},
  {id: 3, label: 'Figma', icon: PhFigmaLogo, color: 'bg-purple-600'},
  {id: 4, label: 'Dribbble', icon: PhDribbbleLogo, color: 'bg-pink-500'},
  {id: 5, label: 'Discord', icon: PhDiscordLogo, color: 'bg-indigo-500'},
  {id: 6, label: 'Spotify', icon: PhSpotifyLogo, color: 'bg-green-500'},
];

// 计算单个图标容器的样式
const iconBoxStyle = computed(() => ({
  width: `${props.iconSize}px`,
  height: `${props.iconSize}px`,
  borderRadius: `${props.radius}px`,
}));

// 计算网格容器的样式
const gridStyle = computed(() => ({
  gap: `${props.gap}px`,
  padding: '20px'
}));
</script>

<template>
  <div
      class="relative w-full h-[320px] rounded-xl overflow-hidden border border-white/10 shadow-inner select-none bg-gradient-to-br from-[#2b5876] to-[#4e4376]"
      aria-hidden="true"
  >
    <div class="w-full h-full origin-top flex flex-col items-center pt-10 transition-all duration-300 scale-[0.6]">

      <div class="text-white flex flex-col items-center mb-8 drop-shadow-md">
        <span class="text-7xl font-bold tracking-tight">12:30</span>
        <span class="text-xl opacity-80 mt-2 font-medium">Wednesday, Dec 31</span>
      </div>

      <div
          class="w-[420px] h-12 mb-10 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center px-4 shadow-lg">
        <PhMagnifyingGlass size="20" class="text-white/60 mr-3"/>
        <div class="h-2 w-24 bg-white/20 rounded-full"></div>
      </div>

      <div class="flex flex-wrap justify-center max-w-[800px]" :style="gridStyle">
        <div
            v-for="site in mockSites"
            :key="site.id"
            class="flex flex-col items-center group"
        >
          <div
              class="flex items-center justify-center transition-all shadow-lg backdrop-blur-sm bg-white/10 border border-white/10 text-white group-hover:bg-white/20"
              :style="iconBoxStyle"
          >
            <component :is="site.icon" :size="props.iconSize * 0.45" weight="duotone"/>
          </div>

          <span
              v-if="props.showName"
              class="mt-2 text-white font-medium text-center leading-tight drop-shadow-md transition-all truncate max-w-[120%]"
              :style="{ fontSize: `${props.textSize}px` }"
          >
            {{ site.label }}
          </span>
        </div>
      </div>

    </div>

    <div
        class="absolute bottom-3 right-3 px-2 py-1 bg-black/40 backdrop-blur rounded text-[10px] text-white/50 font-mono border border-white/5">
      PREVIEW MODE
    </div>
  </div>
</template>

<style scoped>
/* 简单的淡入动画 */
div {
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}
</style>