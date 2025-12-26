<script setup lang="ts">
import {ref, onMounted} from 'vue';

const greeting = ref('');
const quote = ref('');

// --- 1. 时段问候逻辑 ---
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8) return '早安，起得真早';
  if (hour >= 8 && hour < 11) return '上午好，元气满满';
  if (hour >= 11 && hour < 13) return '中午好，记得午休';
  if (hour >= 13 && hour < 17) return '下午好，喝杯咖啡提提神';
  if (hour >= 17 && hour < 19) return '傍晚好，日落很美';
  if (hour >= 19 && hour < 23) return '晚上好，享受私人时间';
  return '夜深了，早点休息';
};

// --- 2. 随机金句库 (你可以随意扩充) ---
const quotes = [
  "保持饥渴，保持愚蠢。",
  "代码是写给人看的，只是顺便给机器运行。",
  "种一棵树最好的时间是十年前，其次是现在。",
  "优雅永不过时。",
  "简单是终极的复杂。",
  "不要等待机会，而要创造机会。",
  "今天也是充满希望的一天。",
  "Stay foolish, stay hungry.",
  "Hello World, Hello Future.",
  "生活原本沉闷，但跑起来就有风。",
  "满怀希望，就会所向披靡。"
];

onMounted(() => {
  greeting.value = getGreeting();
  // 随机取一句
  quote.value = quotes[Math.floor(Math.random() * quotes.length)];
});
</script>

<template>
  <div class="flex flex-col items-center justify-center space-y-2 select-none animate-fade-in-up">
    <h2 class="text-xl md:text-2xl font-bold tracking-wide" style="color: var(--text-primary)">
      {{ greeting }}
    </h2>

    <p class="text-sm md:text-base font-medium opacity-60 max-w-md text-center leading-relaxed"
       style="color: var(--text-secondary)">
      “ {{ quote }} ”
    </p>
  </div>
</template>

<style scoped>
/* 简单的上浮淡入动画 */
.animate-fade-in-up {
  animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>