<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
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
  isEditMode?: boolean;
}>();

defineEmits(['delete']);

const isLoaded = ref(false);
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前是否 auto 模式（兼容旧数据没有 iconType） */
const isAuto = computed(() => props.item.iconType === 'auto' || !props.item.iconType);

/** 自动图标 URL（auto 才生成） */
const autoIconUrl = computed(() => {
  if (!isAuto.value) return '';
  if (!props.item.url) return '';
  return getHighResIconUrl(props.item.url);
});

/** 文字显示（主要用于 text 模式 + 兜底） */
const displayIconValue = computed(() => {
  if (props.item.iconType !== 'text') return '';
  if (props.item.iconValue && props.item.iconValue.length > 0) return props.item.iconValue;

  // 兜底：尽量不依赖这里（正常应由 normalize / setIconFallback 补齐）
  const clean = (props.item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
  return (clean.substring(0, 4).toUpperCase() || (props.item.title || 'A').substring(0, 2));
});

/** 动态字体大小 */
const dynamicFontSize = computed(() => {
  const baseSize = Number(store.config.theme.iconSize);
  const text = displayIconValue.value || '';
  const len = text.length;
  if (len >= 4) return baseSize * 0.3;
  if (len === 3) return baseSize * 0.35;
  if (len === 2) return baseSize * 0.42;
  return baseSize * 0.5;
});

/** icon 模式组件 */
const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) {
    const name = 'Ph' + props.item.iconValue.replace(/^Ph/, '');
    return (PhIcons as any)[name] || PhGlobe;
  }
  return PhGlobe;
});

const clearTimer = () => {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
};

const triggerFallback = () => {
  // 只允许 auto 模式降级，避免 text/icon 被误伤
  if (!isAuto.value) return;
  store.setIconFallback(props.item.id);
};

/** 图片成功加载 */
const handleImgLoad = () => {
  isLoaded.value = true;
  clearTimer();
};

/** 统一启动超时：防止被拦截/内网等导致一直 pending */
const startTimeout = () => {
  clearTimer();
  isLoaded.value = false;

  // 仅 auto 且存在 url 才设超时
  if (!isAuto.value) return;
  if (!autoIconUrl.value) return;

  timeoutTimer = setTimeout(() => {
    if (!isLoaded.value) triggerFallback();
  }, 2500);
};

/** item 变化时：重置加载状态 + 重新计时 */
watch(
    () => [props.item.url, props.item.iconType, props.item.iconValue, props.item.bgColor, props.item.title],
    () => {
      startTimeout();
    },
    {immediate: true}
);

onMounted(() => {
  startTimeout();
});

onUnmounted(() => {
  clearTimer();
});

/** 编辑模式：拦截点击跳转 */
const handleClick = (e: MouseEvent) => {
  if (props.isEditMode) {
    e.preventDefault();
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
      <!-- auto 图标 -->
      <img
          v-if="isAuto && autoIconUrl"
          :src="autoIconUrl"
          class="w-full h-full object-cover bg-white"
          loading="lazy"
          @load="handleImgLoad"
          @error="triggerFallback"
          alt="icon"
      />

      <!-- auto 的占位图标（未加载/无url） -->
      <PhGlobe
          v-if="isAuto && (!isLoaded || !autoIconUrl)"
          :size="Number(store.config.theme.iconSize) * 0.5"
          weight="duotone"
          class="absolute z-[-1]"
      />

      <!-- text 模式 -->
      <span
          v-else-if="item.iconType === 'text'"
          class="font-bold select-none leading-none flex items-center justify-center text-center break-all px-0.5"
          :style="{ fontSize: dynamicFontSize + 'px' }"
      >
        {{ displayIconValue }}
      </span>

      <!-- icon 模式 -->
      <component
          v-else
          :is="PhosphorIcon"
          :size="Number(store.config.theme.iconSize) * 0.5"
          weight="fill"
      />

      <!-- 编辑遮罩 -->
      <div
          v-if="isEditMode"
          class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 animate-fade-in"
      >
        <PhPencilSimple size="24" class="text-white drop-shadow-md"/>
      </div>
    </div>

    <!-- 名称 -->
    <span
        v-if="store.config.theme.showIconName"
        class="font-medium opacity-80 group-hover:opacity-100 transition-opacity truncate text-center leading-tight"
        :style="{
        width: (Number(store.config.theme.iconSize) + 16) + 'px',
        fontSize: store.config.theme.iconTextSize + 'px',
        color: 'var(--text-primary)',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
      }"
    >
      {{ item.title }}
    </span>

    <!-- 删除按钮 -->
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
