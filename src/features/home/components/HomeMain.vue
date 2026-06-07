<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';

import TimeWidget from '../../widgets/builtins/clock/TimeWidget.vue';
import SearchBar from '../../widgets/builtins/search/SearchBar.vue';
import MainGrid from './MainGrid.vue';

const props = defineProps<{
  isFocusMode: boolean;
  activeGroupId: string;
  isEditMode: boolean;
  sidebarPos: 'left' | 'right';

  // 来自 App.vue（由 MobileGroupNav emit）
  mobileNarrow?: boolean; // true 表示屏幕很窄，需要保证至少一行 2 个
  mobileWidth?: number;   // 可选，后续你要更精细判断可以用
}>();

const emit = defineEmits<{
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
  (e: 'openWidgets'): void;
  (e: 'update:isEditMode', val: boolean): void;
}>();

const store = useConfigStore();
const ui = useUiStore();

/** =========================
 *   计算“最终站点卡片宽度”
 *  - 用户设置 (store.config.theme.siteCard.w) 可以是 2 或 3
 *  - 窄屏强制 <= 2（保证一行至少两个）
 *  ========================= */
const userCardW = computed(() => {
  const w = Number((store.config.theme as any)?.siteCard?.w ?? 2);
  return Number.isFinite(w) ? Math.max(1, Math.min(6, w)) : 2;
});

const effectiveCardW = computed(() => {
  // 你也可以把阈值做得更智能：比如 mobileWidth < 420 强制 2
  const force2 = !!props.mobileNarrow;
  return force2 ? Math.min(userCardW.value, 2) : userCardW.value;
});

const userCardH = computed(() => {
  const h = Number((store.config.theme as any)?.siteCard?.h ?? 1);
  return Number.isFinite(h) ? Math.max(1, Math.min(6, h)) : 1;
});

/** =========================
 *  1) 核心布局：动态计算顶部间距
 *  ========================= */
const mainContainerClass = computed(() => {
  const base =
      'flex flex-col w-full h-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

  // 侧边栏留白 (仅普通模式)
  let paddingX = '';
  if (!props.isFocusMode) {
    paddingX = props.sidebarPos === 'left' ? 'md:pl-28' : 'md:pr-28';
  }

  if (props.isFocusMode) {
    const topSpacing = store.config.theme.showTime ? 'pt-[20vh]' : 'pt-[25vh]';
    return `${base} justify-start ${topSpacing} items-center ${paddingX}`;
  } else {
    return `${base} justify-start pt-24 md:pt-14 ${paddingX}`;
  }
});

/** =========================
 *  2) 搜索框容器
 *  ========================= */
const searchWrapperClass = computed(() => {
  const base =
      'w-full flex justify-center px-4 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

  if (props.isFocusMode) return `${base} relative z-30 mb-8 scale-110`;
  return `${base} sticky top-0 z-30 pb-2`;
});

const handleGlobalContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  if (props.isFocusMode) return;
  ui.openContextMenu(e, null, 'blank', props.activeGroupId);
};

const handleBackgroundClick = () => {
  if (props.isEditMode) emit('update:isEditMode', false);
};
</script>

<template>
  <main
      id="main-content"
      tabindex="-1"
      aria-label="主内容"
      data-main-scroll="1"
      :data-wheel-allow="isEditMode ? 'true' : null"
      class="flex-1 relative overflow-x-hidden overflow-y-auto no-scrollbar"
      :class="mainContainerClass"
      @contextmenu="handleGlobalContextMenu"
      @click="handleBackgroundClick"
  >
    <transition name="fade-slide">
      <div
          v-if="store.config.theme.showTime"
          class="w-full flex flex-col items-center shrink-0 mb-6 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          :class="isFocusMode ? 'scale-110' : 'scale-[0.85] origin-bottom'"
      >
        <TimeWidget/>
      </div>
    </transition>

    <div :class="searchWrapperClass">
      <div class="w-full flex justify-center pointer-events-auto max-w-[680px]">
        <SearchBar @openSettings="emit('openSettings')"/>
      </div>
    </div>

    <div
        class="w-full px-4 md:px-12 pb-16 min-h-[450px] transition-all duration-500 ease-out origin-top"
        :class="
        isFocusMode
          ? 'opacity-0 translate-y-10 pointer-events-none scale-95 blur-sm'
          : 'opacity-100 translate-y-0 scale-100 blur-0'
      "
        @contextmenu.stop="handleGlobalContextMenu"
    >
      <!--  把“最终卡片尺寸”传给 MainGrid -->
      <MainGrid
          v-if="!isFocusMode"
          :activeGroupId="activeGroupId"
          :isEditMode="isEditMode"
          :siteCardW="effectiveCardW"
          :siteCardH="userCardH"
          @openSettings="emit('openSettings')"
          @openGroupDialog="emit('openGroupDialog')"
          @openWidgets="emit('openWidgets')"
      />
    </div>
  </main>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 200px;
  opacity: 1;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
  transform: scale(0.9);
}

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.no-scrollbar::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
</style>
