<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue';
import {PhCornersOut, PhCornersIn, PhX} from '@phosphor-icons/vue';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
useEscapeClose(() => props.show, () => emit('close'));

const isFullscreen = ref(false);

// 存储当前时间数字和上一秒数字
const currentDigits = ref(['0', '0', '0', '0', '0', '0']);
const prevDigits = ref(['0', '0', '0', '0', '0', '0']);

const updateTime = () => {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');

  const newDigits = [...h, ...m, ...s];

  if (newDigits.join('') !== currentDigits.value.join('')) {
    prevDigits.value = [...currentDigits.value];
    currentDigits.value = newDigits;
  }
};

let timer: any = null;
onMounted(() => {
  updateTime();
  timer = setInterval(updateTime, 1000);
});
onUnmounted(() => clearInterval(timer));

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    isFullscreen.value = true;
  } else {
    document.exitFullscreen();
    isFullscreen.value = false;
  }
};
</script>

<template>
  <Transition name="overlay">
    <div v-if="show"
         class="clock-overlay fixed inset-0 z-[99999] bg-black flex items-center justify-center overflow-hidden font-sans">

      <div class="absolute top-8 right-8 flex gap-6 text-white/20 z-[100] items-center">
        <button @click="toggleFullscreen" class="hover:text-white transition-colors">
          <PhCornersOut v-if="!isFullscreen" size="22" weight="duotone"/>
          <PhCornersIn v-else size="22" weight="duotone"/>
        </button>
        <div class="w-[1px] h-4 bg-white/10 mx-1"></div>
        <button @click="emit('close')" class="hover:text-red-500 transition-colors">
          <PhX size="22" weight="bold"/>
        </button>
      </div>

      <div class="flex items-center gap-2 md:gap-4 lg:gap-6 scale-75 md:scale-100">
        <template v-for="(digit, index) in currentDigits" :key="index">

          <div class="flip-unit relative" :class="{ 'animating': digit !== prevDigits[index] }">

            <div class="upper-card">
              <span>{{ digit }}</span>
            </div>

            <div class="lower-card">
              <span>{{ digit }}</span>
            </div>

            <div class="flip-card top-flip">
              <span>{{ prevDigits[index] }}</span>
            </div>

            <div class="flip-card bottom-flip">
              <span>{{ digit }}</span>
            </div>

            <div class="cut-line"></div>
          </div>

          <div v-if="index === 1 || index === 3" class="separator">
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        </template>
      </div>

      <div class="absolute bottom-12 text-white/10 text-[10px] tracking-[0.6em] font-medium uppercase select-none">
        Studio Timepiece
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 核心变量：控制卡片尺寸 */
.flip-unit {
  width: 80px;
  height: 120px;
  perspective: 1000px;
  position: relative;
  background-color: #111;
  border-radius: 8px;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 1);
}

@media (min-width: 768px) {
  .flip-unit {
    width: 120px;
    height: 180px;
    border-radius: 12px;
  }
}

/* 隐藏光标 */
.clock-overlay {
  cursor: none;
}

.clock-overlay:hover {
  cursor: default;
}

/* 卡片通用样式 */
.upper-card, .lower-card, .flip-card {
  width: 100%;
  height: 50%;
  position: absolute;
  left: 0;
  overflow: hidden;
  background-color: #1a1a1a; /* 卡片底色 */
  color: #e5e5e5; /* 字体颜色：灰白，不刺眼 */
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-weight: 700;
  font-size: 70px;
  line-height: 120px; /* 等于容器高度 */
  text-align: center;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

@media (min-width: 768px) {
  .upper-card, .lower-card, .flip-card {
    font-size: 110px;
    line-height: 180px;
  }
}

/* 核心定位修复：
  所有 span 都是 200% 高度，绝对居中。
  Top 容器只显示上半部分 (top: 0)。
  Bottom 容器只显示下半部分 (top: -100%)。
*/
.upper-card span, .lower-card span, .flip-card span {
  display: block;
  height: 200%;
  width: 100%;
  position: absolute;
  left: 0;
}

/* 上半部分配置 */
.upper-card, .top-flip {
  top: 0;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(to bottom, #262626 0%, #1a1a1a 100%); /* 微弱的高光渐变 */
  z-index: 1;
}

@media (min-width: 768px) {
  .upper-card, .top-flip {
    border-radius: 12px 12px 0 0;
  }
}

.upper-card span, .top-flip span {
  top: 0;
}

/* 下半部分配置 */
.lower-card, .bottom-flip {
  bottom: 0;
  border-radius: 0 0 8px 8px;
  background: linear-gradient(to bottom, #1a1a1a 0%, #202020 100%);
  z-index: 0;
}

@media (min-width: 768px) {
  .lower-card, .bottom-flip {
    border-radius: 0 0 12px 12px;
  }
}

.lower-card span, .bottom-flip span {
  top: -100%; /* 向上偏移以显示下半截 */
}

/* 翻转动画逻辑 */
.top-flip {
  z-index: 2; /* 在最上层，准备翻下去 */
  transform-origin: bottom; /* 沿底边旋转 */
}

.bottom-flip {
  z-index: 2;
  transform-origin: top; /* 沿顶边旋转 */
  transform: rotateX(90deg); /* 初始状态：折叠在里面 */
}

/* 触发动画 */
.animating .top-flip {
  animation: flip-top 0.6s ease-in forwards;
}

.animating .bottom-flip {
  animation: flip-bottom 0.6s ease-out forwards;
}

@keyframes flip-top {
  0% {
    transform: rotateX(0deg);
  }
  100% {
    transform: rotateX(-90deg);
  }
}

@keyframes flip-bottom {
  0% {
    transform: rotateX(90deg);
  }
  100% {
    transform: rotateX(0deg);
  }
}

/* 中缝切割线 */
.cut-line {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  background: #000;
  opacity: 0.6;
  z-index: 5;
  transform: translateY(-50%);
}

/* 分隔符 */
.separator {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 4px;
}

.dot {
  width: 6px;
  height: 6px;
  background-color: #333;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
}

/* 过渡 */
.overlay-enter-active, .overlay-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-enter-from, .overlay-leave-to {
  opacity: 0;
}
</style>
