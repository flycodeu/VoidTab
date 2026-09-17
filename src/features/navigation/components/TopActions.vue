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
  showSidebar: boolean;
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

const breathSeconds = computed<number>(() => {
  const raw = Number((store.config.theme as any).breathingDuration ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(12, Math.max(1, raw));
});

const isBreathing = computed(() => !!store.config.theme.breathingLight);
const isNeon = computed(() => !!store.config.theme.neonGlow);

const toolbarClass = computed(() => {
  if (!props.showSidebar) return 'top-5 right-6';
  if (props.sidebarPos === 'right') return 'top-5 left-6';
  if (props.sidebarPos === 'top') return 'top-[80px] right-6';
  return 'top-5 right-6';
});

const nextSidebarLabel = computed(() => {
  if (!props.showSidebar) return '切换分组栏位置';
  const labels: Record<SidebarPosition, string> = {
    left: '切换到右侧布局',
    right: '切换到顶部布局',
    top: '切换到底部布局',
    bottom: '切换到左侧布局',
  };
  return labels[props.sidebarPos] || '切换分组栏位置';
});

const breathAnimStyle = computed(() => {
  if (!isBreathing.value) return undefined;
  return {animationDuration: `${breathSeconds.value}s`} as any;
});
</script>

<template>
  <div
      class="top-actions fixed z-50 transition-all duration-500"
      :class="toolbarClass"
      role="toolbar"
      aria-label="快捷操作"
  >
    <div class="top-actions-capsule flex items-center gap-1.5 p-1 rounded-full">
      <template v-if="!isFocusMode">
        <button
            type="button"
            @click="emit('toggleSidebarPos')"
            class="fab-btn fab-btn--desktop-only group"
            :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
            :style="breathAnimStyle"
            :aria-label="nextSidebarLabel"
            :title="nextSidebarLabel"
        >
          <PhArrowsLeftRight
              size="18"
              weight="bold"
              class="group-hover:rotate-180 transition-transform duration-500"
              aria-hidden="true"
          />
        </button>

        <button
            type="button"
            @click="emit('toggleTerminal')"
            class="fab-btn group"
            :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
            :style="breathAnimStyle"
            aria-label="切换终端模式"
            title="终端模式 (CMD)"
        >
          <PhTerminalWindow size="18" weight="bold" aria-hidden="true"/>
        </button>

        <button
            type="button"
            @click="emit('toggleAi')"
            class="fab-btn group relative"
            :class="[{ 'is-breathing': isBreathing, 'is-neon': isNeon }]"
            :style="breathAnimStyle"
            aria-label="切换 AI 助手"
            title="AI 助手"
        >
          <PhRobot size="18" weight="bold" aria-hidden="true"/>
        </button>

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
          <component :is="isEditMode ? PhCheck : PhPencilSimple" size="18" weight="bold" aria-hidden="true"/>
        </button>

        <div class="divider-v" aria-hidden="true"></div>
      </template>

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
        <component :is="isFocusMode ? PhEyeSlash : PhEye" size="18" weight="bold" aria-hidden="true"/>
      </button>
    </div>
  </div>
</template>

<style scoped>
.top-actions-capsule {
  background: rgba(var(--sidebar-surface-rgb), 0.65);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  opacity: 0.8;
  transition: opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.top-actions:hover .top-actions-capsule {
  opacity: 1;
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.divider-v {
  width: 1px;
  height: 18px;
  background: var(--sidebar-divider);
  opacity: 0.8;
  margin: 0 2px;
}

.fab-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: transparent;
  border: 1px solid transparent;

  color: var(--sidebar-text);
  opacity: 0.85;

  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease, color 0.16s ease;
}

.fab-btn--desktop-only {
  display: none;
}

@media (min-width: 1024px) {
  .fab-btn--desktop-only {
    display: inline-flex;
  }
}

.fab-btn:hover {
  transform: scale(1.08);
  opacity: 1;
  background: rgba(255, 255, 255, 0.14);
  color: var(--accent-color);
}

html.light .fab-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.fab-btn:active {
  transform: scale(0.94);
}

.fab-btn:focus-visible {
  outline: none;
  border-color: var(--accent-color);
}

.fab-btn--active {
  background: rgba(var(--accent-color-rgb), 0.18);
  color: var(--accent-color);
  opacity: 1;
}

.fab-btn--focus {
  background: rgba(var(--accent-color-rgb), 0.18);
  color: var(--accent-color);
  opacity: 1;
}

.is-neon:hover {
  box-shadow: 0 0 12px rgba(var(--accent-color-rgb), 0.4);
}

.is-breathing {
  animation-name: fab-breath;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes fab-breath {
  0%, 100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
    color: var(--accent-color);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-breathing {
    animation: none !important;
  }
}

@media (max-width: 767px) {
  .fab-btn {
    width: 32px;
    height: 32px;
  }
}
</style>
