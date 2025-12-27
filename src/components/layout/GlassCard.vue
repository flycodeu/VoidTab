<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {PhTrash, PhPencilSimple} from '@phosphor-icons/vue';
import type {SiteItem} from '../../core/config/types';
import SiteIcon from './SiteIcon.vue';
import {useAutoIcon} from '../../composables/useAutoIcon';

const store = useConfigStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
}>();

const emit = defineEmits(['delete']);

// 当前是否 auto（兼容旧数据）
const isAuto = computed(() => props.item.iconType === 'auto' || !props.item.iconType);

// text 文字（尽量和 normalize 保持一致，这里只做 UI 展示兜底）
const displayText = computed(() => {
  if (props.item.iconType !== 'text') return '';
  if (props.item.iconValue && props.item.iconValue.length > 0) return props.item.iconValue;

  const clean = (props.item.title || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
  return (clean.substring(0, 4).toUpperCase() || (props.item.title || 'A').substring(0, 2));
});

const dynamicFontSize = computed(() => {
  const baseSize = Number(store.config.theme.iconSize);
  const len = (displayText.value || '').length;
  if (len >= 4) return baseSize * 0.3;
  if (len === 3) return baseSize * 0.35;
  if (len === 2) return baseSize * 0.42;
  return baseSize * 0.5;
});

// auto favicon 逻辑
const {autoIconUrl, isLoaded, handleImgLoad, triggerFallback} = useAutoIcon({
  url: computed(() => props.item.url),
  isAuto,
  timeoutMs: 2500,
  onFallback: () => store.setIconFallback(props.item.id),
});

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
      :class="[isEditMode ? 'cursor-grab active:cursor-grabbing animate-shake' : 'hover:-translate-y-1 cursor-pointer']"
  >
    <SiteIcon
        :item="item"
        :size="Number(store.config.theme.iconSize)"
        :radius="Number(store.config.theme.radius)"
        :isAuto="isAuto"
        :autoIconUrl="autoIconUrl"
        :isLoaded="isLoaded"
        :text="displayText"
        :textFontSize="dynamicFontSize"
        @loaded="handleImgLoad"
        @fallback="triggerFallback"
    />

    <!-- 编辑遮罩（放在图标外面也可以，视你的 UI 需求） -->
    <div
        v-if="isEditMode"
        class="absolute top-1 left-1 right-1"
    >
      <div class="pointer-events-none w-full flex items-center justify-center">
        <!-- 也可以把遮罩挪回 SiteIcon 内部，看你想怎么改 UI -->
      </div>
    </div>

    <div
        v-if="isEditMode"
        class="absolute inset-[4px] rounded-[18px] bg-black/0 pointer-events-none"
    ></div>

    <div
        v-if="isEditMode"
        class="absolute inset-0 pointer-events-none flex items-start justify-center"
    >
      <div class="mt-2 bg-black/40 backdrop-blur-[1px] rounded-xl px-2 py-1">
        <PhPencilSimple size="18" class="text-white drop-shadow-md"/>
      </div>
    </div>

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
</style>
