<script setup lang="ts">
import {computed} from 'vue';
import {
  PhEye,
  PhEyeSlash,
  PhArrowsLeftRight,
  PhPencilSimple,
  PhCheck,
  PhRobot,
  PhTerminalWindow
} from '@phosphor-icons/vue';

import {useConfigStore} from '../../../stores/useConfigStore.ts';
import type {SidebarPosition} from '../../../core/config/types.ts';

const props = defineProps<{
  sidebarPos: SidebarPosition;
  isFocusMode: boolean;
  isEditMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleSidebarPos'): void;
  (e: 'toggleEdit'): void;
  (e: 'toggleFocus'): void;
  (e: 'toggleAi'): void;
  (e: 'toggleTerminal'): void;
}>();

const store = useConfigStore();

/** 呼吸频率（秒） */
const breathSeconds = computed<number>(() => {
  const raw = Number((store.config.theme as any).breathingDuration ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(12, Math.max(1, raw));
});

const isBreathing = computed(() => !!store.config.theme.breathingLight);
const isNeon = computed(() => !!store.config.theme.neonGlow);

const toolbarClass = computed(() => {
  if (props.sidebarPos === 'right') return 'top-6 left-6';
  if (props.sidebarPos === 'top') return 'top-[116px] right-6';
  return 'top-6 right-6';
});

const nextSidebarLabel = computed(() => {
  const labels: Record<SidebarPosition, string> = {
    left: '切换到右侧布局',
    right: '切换到顶部布局',
    top: '切换到底部布局',
    bottom: '切换到左侧布局',
  };
  return labels[props.sidebarPos] || '切换分组栏位置';
});

/** 用 style 绑定 animationDuration（避免 TS 对 CSS var 的类型问题） */
const breathAnimStyle = computed(() => {
  if (!isBreathing.value) return undefined;
  return {animationDuration: `${breathSeconds.value}s`} as any;
});
</script>

<template>
  <div
      class="top-actions fixed z-50 flex items-center gap-3 transition-all duration-500"
      :class="toolbarClass"
      role="toolbar"
      aria-label="快捷操作"
  >
    <template v-if="!isFocusMode">
      <!-- 切换侧边栏位置 -->
      <button
          type="button"
          @click="emit('toggleSidebarPos')"
          class="fab-btn group"
          :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
          :style="breathAnimStyle"
          :aria-label="nextSidebarLabel"
          :title="nextSidebarLabel"
      >
        <PhArrowsLeftRight
            size="20"
            weight="bold"
            class="group-hover:rotate-180 transition-transform duration-500"
            aria-hidden="true"
        />
      </button>

      <!-- 终端 -->
      <button
          type="button"
          @click="emit('toggleTerminal')"
          class="fab-btn group"
          :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
          :style="breathAnimStyle"
          aria-label="切换终端模式"
          title="终端模式 (CMD)"
      >
        <!--  不写死颜色，吃按钮 currentColor -->
        <PhTerminalWindow size="20" weight="bold" aria-hidden="true"/>
      </button>

      <!-- AI -->
      <button
          type="button"
          @click="emit('toggleAi')"
          class="fab-btn group relative"
          :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
          :style="breathAnimStyle"
          aria-label="切换 AI 助手"
          title="AI 助手"
      >
        <PhRobot size="20" weight="bold" aria-hidden="true"/>
      </button>

      <!-- 整理桌面 -->
      <button
          type="button"
          @click="emit('toggleEdit')"
          class="fab-btn group"
          :class="[
          { 'is-breathing': isBreathing, 'is-neon': isNeon },
          isEditMode ? 'fab-btn--active' : ''
        ]"
          :style="breathAnimStyle"
          :aria-label="isEditMode ? '完成整理桌面' : '整理桌面'"
          :aria-pressed="isEditMode"
          title="整理桌面"
      >
        <component :is="isEditMode ? PhCheck : PhPencilSimple" size="20" weight="bold" aria-hidden="true"/>
      </button>
    </template>

    <!-- 专注模式 -->
    <button
        type="button"
        @click="emit('toggleFocus')"
        class="fab-btn group"
        :class="[
        { 'is-breathing': isBreathing, 'is-neon': isNeon },
        isFocusMode ? 'fab-btn--focus' : ''
      ]"
        :style="breathAnimStyle"
        :aria-label="isFocusMode ? '退出专注模式' : '进入专注模式'"
        :aria-pressed="isFocusMode"
        :title="isFocusMode ? '退出专注' : '专注模式'"
    >
      <component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold" aria-hidden="true"/>
    </button>
  </div>
</template>

<style scoped>
.fab-btn {
  width: 44px;
  height: 44px;
  border-radius: 999px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  /*  背景/边框/阴影跟随主题（light/dark） */
  background: var(--fab-bg);
  border: 1px solid var(--fab-border);
  box-shadow: var(--fab-shadow);

  /*  默认就是主题色：图标吃 currentColor */
  color: var(--accent-color);

  backdrop-filter: none;
  -webkit-backdrop-filter: none;

  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
}

.fab-btn:hover {
  transform: translateY(-1px) scale(1.06);

  /* hover 背景更亮一点 + 主题色边框 */
  background: var(--fab-bg-hover);
  border-color: rgba(var(--accent-color-rgb), 0.32);

  /* hover 图标更“饱和”一点 */
  color: rgba(var(--accent-color-rgb), 0.95);
}

.fab-btn:active {
  transform: scale(0.96);
}

.fab-btn:focus-visible {
  outline: none;
  box-shadow: var(--fab-shadow),
  0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

/* active：Edge 风格（细边框 + 柔底） */
.fab-btn--active {
  background: rgba(var(--accent-color-rgb), 0.16);
  border-color: rgba(var(--accent-color-rgb), 0.50);
  color: rgba(var(--accent-color-rgb), 0.98);

  box-shadow: var(--fab-shadow),
  0 0 0 1px rgba(var(--accent-color-rgb), 0.10) inset;
}

/* focus 模式按钮 */
.fab-btn--focus {
  background: rgba(var(--accent-color-rgb), 0.14);
  border-color: rgba(var(--accent-color-rgb), 0.30);
  color: rgba(var(--accent-color-rgb), 0.98);
}

/* 霓虹发光（neonGlow=true） */
.is-neon:hover {
  box-shadow: var(--fab-shadow),
  0 0 18px rgba(var(--accent-color-rgb), 0.28);
}

.is-neon.fab-btn--active {
  box-shadow: var(--fab-shadow),
  0 0 22px rgba(var(--accent-color-rgb), 0.32),
  0 0 0 1px rgba(var(--accent-color-rgb), 0.10) inset;
}

/*  呼吸灯（breathingLight=true） */
.is-breathing {
  animation-name: fab-breath;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes fab-breath {
  0%, 100% {
    border-color: rgba(var(--accent-color-rgb), 0.22);
    box-shadow: var(--fab-shadow),
    0 0 0 rgba(var(--accent-color-rgb), 0);
  }
  50% {
    border-color: rgba(var(--accent-color-rgb), 0.65);
    box-shadow: var(--fab-shadow),
    0 0 22px rgba(var(--accent-color-rgb), 0.30);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-breathing {
    animation: none !important;
  }
}

@media (max-width: 767px) {
  .top-actions {
    gap: 8px;
    padding: 6px;
    border-radius: 999px;
    background: rgba(var(--overlay-rgb), 0.34);
    border: 1px solid rgba(var(--overlay-rgb), 0.18);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  }

  .fab-btn {
    width: 38px;
    height: 38px;
  }
}
</style>
