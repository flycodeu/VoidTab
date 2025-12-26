<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import * as PhIcons from '@phosphor-icons/vue';
import {PhGlobe, PhTrash, PhPencilSimple} from '@phosphor-icons/vue';
import {getHighResIconUrl} from '../../utils/icon';

const store = useConfigStore();

const props = defineProps<{
  item: {
    id: string;
    title: string;
    url: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;
  };
  // 接收编辑模式
  isEditMode?: boolean;
}>();

// 定义删除事件
defineEmits(['delete']);

const isLoaded = ref(false);
let timeoutTimer: any = null;

// --- URL 计算逻辑 ---
const autoIconUrl = computed(() => {
  if (props.item.iconType === 'text' || props.item.iconType === 'icon') return '';
  return getHighResIconUrl(props.item.url);
});

// --- 文字显示逻辑 ---
const displayIconValue = computed(() => {
  if (props.item.iconType === 'text') {
    if (props.item.iconValue && props.item.iconValue.length > 1) return props.item.iconValue;
    const clean = (props.item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
    return clean.substring(0, 4).toUpperCase() || props.item.title.substring(0, 2);
  }
  return '';
});

// --- 动态字体大小 ---
const dynamicFontSize = computed(() => {
  const baseSize = Number(store.config.theme.iconSize);
  const text = displayIconValue.value;
  const len = text.length;
  if (len >= 4) return baseSize * 0.3;
  if (len === 3) return baseSize * 0.35;
  if (len === 2) return baseSize * 0.42;
  return baseSize * 0.5;
});

const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) {
    const name = 'Ph' + props.item.iconValue.replace(/^Ph/, '');
    return (PhIcons as any)[name] || PhGlobe;
  }
  return PhGlobe;
});

// --- 加载处理 ---
const handleImgLoad = () => {
  isLoaded.value = true;
  if (timeoutTimer) clearTimeout(timeoutTimer);
};

const triggerFallback = () => {
  if (props.item.iconType === 'auto' || !props.item.iconType) {
    store.setIconFallback(props.item.id);
  }
};

onMounted(() => {
  if ((props.item.iconType === 'auto' || !props.item.iconType) && autoIconUrl.value) {
    timeoutTimer = setTimeout(() => {
      if (!isLoaded.value) {
        // console.warn('图标加载超时(可能是被拦截)，强制转为文字:', props.item.title);
        triggerFallback();
      }
    }, 2500);
  }
});

onUnmounted(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer);
});

//  核心：拦截点击事件
const handleClick = (e: MouseEvent) => {
  if (props.isEditMode) {
    e.preventDefault(); // 阻止跳转
    e.stopPropagation();
  }
};
</script>

<template>
  <a
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="group relative flex flex-col items-center gap-2 p-1 rounded-xl transition-all duration-300"
      :class="[
        // ✨ 编辑模式下：添加抓手样式、取消原有 hover、添加抖动动画
        isEditMode ? 'cursor-grab active:cursor-grabbing animate-shake' : 'hover:-translate-y-1 cursor-pointer'
      ]"
  >
    <div
        class="site-icon-container flex items-center justify-center text-white shadow-lg overflow-hidden relative transition-all duration-300"
        :style="{
        backgroundColor: (item.bgColor === '#ffffff' && item.iconType === 'text') ? '#475569' : (item.bgColor || '#3b82f6'),
        width: Number(store.config.theme.iconSize) + 'px',
        height: Number(store.config.theme.iconSize) + 'px',
        borderRadius: store.config.theme.radius + 'px'
      }"
    >

      <img
          v-if="(item.iconType === 'auto' || !item.iconType) && autoIconUrl"
          :src="autoIconUrl"
          class="w-full h-full object-cover bg-white"
          loading="lazy"
          @load="handleImgLoad"
          @error="triggerFallback"
          alt="icon"
      />

      <PhGlobe
          v-if="(item.iconType === 'auto' || !item.iconType) && (!isLoaded || !autoIconUrl)"
          :size="Number(store.config.theme.iconSize) * 0.5"
          weight="duotone"
          class="absolute z-[-1]"
      />

      <span v-else-if="item.iconType === 'text'"
            class="font-bold select-none leading-none flex items-center justify-center text-center break-all px-0.5"
            :style="{ fontSize: dynamicFontSize + 'px' }">
        {{ displayIconValue }}
      </span>

      <component
          v-else
          :is="PhosphorIcon"
          :size="Number(store.config.theme.iconSize) * 0.5"
          weight="fill"
      />

      <div v-if="isEditMode"
           class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 animate-fade-in">
        <PhPencilSimple size="24" class="text-white drop-shadow-md"/>
      </div>
    </div>

    <span v-if="store.config.theme.showIconName"
          class="font-medium opacity-80 group-hover:opacity-100 transition-opacity truncate text-center leading-tight"
          :style="{
            width: (Number(store.config.theme.iconSize) + 16) + 'px',
            fontSize: store.config.theme.iconTextSize + 'px',
            color: 'var(--text-primary)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
          }">
      {{ item.title }}
    </span>

    <button
        v-if="isEditMode"
        @click.prevent.stop="$emit('delete')"
        class="absolute -top-2 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 hover:scale-110 transition-all z-20 animate-pop-in"
    >
      <PhTrash size="12" weight="bold"/>
    </button>
  </a>
</template>

<style scoped>
/* ✨ 抖动动画 */
@keyframes shake {
  0% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(1.5deg);
  }
  50% {
    transform: rotate(0deg);
  }
  75% {
    transform: rotate(-1.5deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.animate-shake {
  animation: shake 0.25s infinite ease-in-out;
}

/* 按钮弹出动画 */
@keyframes popIn {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  80% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-pop-in {
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>