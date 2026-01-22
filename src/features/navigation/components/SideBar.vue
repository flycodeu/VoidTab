<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useUiStore} from '../../../stores/ui/useUiStore.ts';
import {PhPlus, PhGear} from '@phosphor-icons/vue';

import SidebarGroupButton from './sidebar/SidebarGroupButton.vue';
import {useSidebarDragHandlers} from '../composables/useSidebarDragHandlers.ts';
import BrandLogo from '../../../app/shell/BrandLogo.vue';

const ui = useUiStore();
const store = useConfigStore();

const props = defineProps<{ activeGroupId: string; isFocusMode: boolean }>();
const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
  (e: 'openGroupDialog'): void;
}>();

/** 右键菜单 */
const handleGroupContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  e.stopPropagation();
  ui.openContextMenu(e, group, 'group', group.id);
};

/** 拖拽逻辑（站点拖入分组等，你原有逻辑保持不动） */
const {handleDragEnter, handleDragLeave, handleDrop} = useSidebarDragHandlers({
  dragState: ui.dragState,
  getActiveGroupId: () => props.activeGroupId,
  setActiveGroupId: (id) => emit('update:activeGroupId', id),
  moveSite: (from, to, siteId) => store.moveSite(from, to, siteId),
  endDrag: () => ui.setDragState(false),
  hoverDelay: 600
});

const shouldShowDropHint = (groupId: string) => {
  return !!(ui.dragState?.isDragging && props.activeGroupId !== groupId);
};

/** 滚动定位 */
const listRef = ref<HTMLElement | null>(null);
watch(
    () => props.activeGroupId,
    async (id) => {
      await nextTick();
      const host = listRef.value;
      if (!host) return;
      const el = host.querySelector(`[data-group-id="${id}"]`) as HTMLElement | null;
      el?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    },
    {immediate: true}
);

/** 贴边样式 */
const railClass = computed(() => {
  const isRight = store.config.theme.sidebarPos === 'right';
  return isRight ? 'right-0 rounded-l-[24px]' : 'left-0 rounded-r-[24px]';
});

const transitionName = computed(() => {
  return store.config.theme.sidebarPos === 'right' ? 'slide-fade-right' : 'slide-fade';
});

/** 呼吸灯频率（秒） */
const breathSeconds = computed<number>(() => {
  const raw = Number((store.config.theme as any).breathingDuration ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(12, Math.max(1, raw));
});

/** scoped 下也能用：用 style 喂 CSS 变量（动画用） */
const railStyle = computed(() => {
  return {
    '--sidebar-breath-duration': `${breathSeconds.value}s`
  } as Record<string, string>;
});

/** ================================
 *  拖拽排序期间：滚轮滚动分组列表（关键）
 *  - 解决拖拽时 target 变 ghost，wheel 无法命中 listRef 的问题
 *  - 避免全局 wheel 切组逻辑抢事件
 * ================================ */

const isGroupSorting = ref(false);

/** 滚动速度倍率（触摸板可调小一些，鼠标滚轮可调大一些） */
const WHEEL_SPEED = 1.15;

const onWheelWhileSorting = (e: WheelEvent) => {
  if (!isGroupSorting.value) return;

  const host = listRef.value;
  if (!host) return;

  // 我们要“接管”这次滚轮，让它只滚侧栏列表
  // 必须 passive:false 才能 preventDefault
  if (e.cancelable) {
    e.preventDefault();
    e.stopPropagation();
  }

  host.scrollTop += e.deltaY * WHEEL_SPEED;
};

const bindSortingWheel = () => {
  // 捕获阶段监听更稳：拖拽时 wheel target 可能是 ghost/overlay
  window.addEventListener('wheel', onWheelWhileSorting, {capture: true, passive: false});
};

const unbindSortingWheel = () => {
  window.removeEventListener('wheel', onWheelWhileSorting as any, true);
};

const onGroupSortStart = () => {
  isGroupSorting.value = true;

  // 给全局 wheel 切组逻辑一个“硬退出”信号（建议你在 App 的 canWheelSwitchGroup 里判断它）
  (ui as any).isGroupSorting = true;

  bindSortingWheel();
};

const onGroupSortEnd = () => {
  isGroupSorting.value = false;
  (ui as any).isGroupSorting = false;

  unbindSortingWheel();
  store.saveConfig();
};

onBeforeUnmount(() => {
  (ui as any).isGroupSorting = false;
  unbindSortingWheel();
});
</script>

<template>
  <div
      v-if="!isFocusMode"
      class="fixed inset-y-0 z-40 pointer-events-none flex flex-col justify-center py-4"
      :class="store.config.theme.sidebarPos === 'right' ? 'right-0' : 'left-0'"
  >
    <transition :name="transitionName">
      <aside
          class="hidden md:flex pointer-events-auto h-full w-[82px] flex-col items-center transition-all duration-300 overflow-hidden sidebar-rail"
          :class="[
          railClass,
          { 'is-breathing': !!store.config.theme.breathingLight }
        ]"
          :data-side="store.config.theme.sidebarPos"
          :style="railStyle"
      >
        <!-- 顶部 -->
        <div class="flex-shrink-0 pt-6 pb-4 w-full flex flex-col items-center border-b gap-2 sidebar-divider">
          <div
              class="w-10 h-10 rounded-xl flex items-center justify-center ring-1 transition-transform hover:scale-110 sidebar-brand">
            <BrandLogo/>
          </div>

          <transition name="fade">
            <span
                v-if="store.config.theme.showLogoText"
                class="text-[10px] font-bold tracking-widest uppercase truncate max-w-[90%] px-1 select-none sidebar-title"
            >
              {{ store.config.theme.customLogoText || 'VOID' }}
            </span>
          </transition>
        </div>

        <!-- 中部 -->
        <div class="flex-1 w-full flex flex-col overflow-hidden">
          <div class="px-0 py-3 text-center">
            <span class="text-[10px] font-bold uppercase tracking-widest sidebar-muted">分组</span>
          </div>

          <!-- 加 data-wheel-allow="true" 让全局滚轮切组逻辑放行正常滚动
               同时加 data-sidebar-list="1" 便于你后续在 App 里按区域放行（可选） -->
          <div
              ref="listRef"
              data-wheel-allow="true"
              data-sidebar-list="1"
              class="flex-1 w-full px-2 overflow-y-auto no-scrollbar pb-4 space-y-2"
          >
            <VueDraggable
                v-model="store.config.layout"
                :animation="180"
                handle=".group-sort-handle"
                ghost-class="group-ghost"
                chosen-class="group-chosen"
                drag-class="group-drag"
                class="flex flex-col gap-2"
                :disabled="!!ui.dragState?.isDragging"
                @start="onGroupSortStart"
                @end="onGroupSortEnd"
            >
              <SidebarGroupButton
                  v-for="group in store.config.layout"
                  :key="group.id"
                  :class="[
                  'group-sort-handle',
                  'sidebar-group-btn',
                  { 'is-active': props.activeGroupId === group.id }
                ]"
                  :group="group"
                  :active="props.activeGroupId === group.id"
                  :isDragging="!!ui.dragState?.isDragging"
                  :showDropHint="shouldShowDropHint(group.id)"
                  :breathingLight="!!store.config.theme.breathingLight"
                  :onSelect="(id) => emit('update:activeGroupId', id)"
                  :onContextMenu="handleGroupContextMenu"
                  :onDragEnter="handleDragEnter"
                  :onDragLeave="handleDragLeave"
                  :onDrop="handleDrop"
              />
            </VueDraggable>

            <!-- 新建分组按钮 -->
            <button
                @click="emit('openGroupDialog')"
                class="w-full h-12 rounded-xl flex items-center justify-center transition-all group sidebar-add-btn"
                aria-label="Add group"
                title="新建分组"
            >
              <PhPlus size="18" weight="bold" class="group-hover:scale-110 transition-transform"/>
            </button>
          </div>
        </div>

        <!-- 底部 -->
        <div class="flex-shrink-0 w-full p-4 flex justify-center sidebar-footer">
          <button
              @click="emit('openSettings')"
              class="p-2.5 rounded-full transition-all active:scale-95 sidebar-icon-btn"
              aria-label="Settings"
              title="系统设置"
          >
            <PhGear :size="20" weight="fill"/>
          </button>
        </div>
      </aside>
    </transition>

    <transition name="slide-up">
      <slot name="mobile-nav"></slot>
    </transition>
  </div>
</template>

<style scoped>
/* ------------------------------ */
/* Drag 状态                      */
/* ------------------------------ */
.group-ghost {
  opacity: 0.3;
  transform: scale(0.95);
  filter: grayscale(1);
}
.group-chosen {
  opacity: 1;
  transform: scale(1.02);
}
.group-drag {
  cursor: grabbing;
}

/* ===================================================================== */
/*  Sidebar Rail：玻璃底 + 贴边框呼吸灯（不外扩）                        */
/* - 呼吸灯只作用在边框附近（inset ring），不做大面积 glow               */
/* ===================================================================== */
.sidebar-rail {
  position: relative;
  isolation: isolate;

  background: rgba(var(--sidebar-surface-rgb), var(--sidebar-alpha));
  border: 1px solid var(--sidebar-border);
  box-shadow: var(--sidebar-shadow);
  color: var(--sidebar-text);

  backdrop-filter: blur(var(--sidebar-blur)) saturate(var(--sidebar-saturate, 120%));
  -webkit-backdrop-filter: blur(var(--sidebar-blur)) saturate(var(--sidebar-saturate, 120%));

  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

/*  rail hover 不染色 */
.sidebar-rail:hover {
  background: rgba(var(--sidebar-surface-rgb), var(--sidebar-alpha));
}

/* 贴边那侧不画边框（Edge 风格） */
.sidebar-rail[data-side='left'] { border-left: none; }
.sidebar-rail[data-side='right'] { border-right: none; }

.sidebar-divider { border-color: var(--sidebar-divider) !important; }
.sidebar-muted { color: var(--sidebar-muted) !important; }
.sidebar-title {
  color: var(--sidebar-text);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.10);
}

/* 顶部 Logo：中性玻璃 */
.sidebar-brand {
  color: var(--sidebar-text);
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}
.sidebar-brand:hover { background: rgba(255, 255, 255, 0.14); }
html.light .sidebar-brand { background: rgba(0, 0, 0, 0.04); }
html.light .sidebar-brand:hover { background: rgba(0, 0, 0, 0.06); }

/* footer */
.sidebar-footer {
  background: var(--sidebar-footer);
  border-top: 1px solid var(--sidebar-divider);
}

/* 底部 icon btn：中性 hover */
.sidebar-icon-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.sidebar-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--sidebar-border);
  box-shadow: none;
}
html.light .sidebar-icon-btn { background: rgba(0, 0, 0, 0.04); }
html.light .sidebar-icon-btn:hover { background: rgba(0, 0, 0, 0.06); }

/* ===================================================================== */
/*  贴边框呼吸灯（关键）                                                 */
/* - 用“inset ring”模拟贴边发光，不外扩                                    */
/* - 只对 rail 生效，不影响内部按钮                                         */
/* ===================================================================== */

/* 给 rail 加一个贴边的内层高光，默认很淡 */
.sidebar-rail::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;

  /* 默认不亮 */
  opacity: 0;
}

/* 呼吸灯动画：只改变边框色 + 内侧贴边线（inset shadow），不做外圈大光晕 */
.sidebar-rail.is-breathing[data-side='left'] {
  animation: rail-border-breath-left var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}
.sidebar-rail.is-breathing[data-side='right'] {
  animation: rail-border-breath-right var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

/* 内层贴边“光线”——只在呼吸时出现 */
.sidebar-rail.is-breathing::after {
  opacity: 1;
  animation: rail-innerline-breath var(--sidebar-breath-duration, 3s) ease-in-out infinite;
}

/* 左贴边：强调右边框 */
@keyframes rail-border-breath-left {
  0%, 100% {
    border-right-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-right-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

/* 右贴边：强调左边框 */
@keyframes rail-border-breath-right {
  0%, 100% {
    border-left-color: rgba(var(--accent-color-rgb), 0.30);
  }
  50% {
    border-left-color: rgba(var(--accent-color-rgb), 0.85);
  }
}

/* 内侧贴边线：用 inset box-shadow 做“紧贴边框”的发光 */
@keyframes rail-innerline-breath {
  0%, 100% {
    box-shadow:
        inset 0 0 0 1px rgba(var(--accent-color-rgb), 0.10),
        inset 0 0 10px rgba(var(--accent-color-rgb), 0.06);
  }
  50% {
    box-shadow:
        inset 0 0 0 1px rgba(var(--accent-color-rgb), 0.28),
        inset 0 0 14px rgba(var(--accent-color-rgb), 0.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-rail.is-breathing {
    animation: none !important;
  }
  .sidebar-rail.is-breathing::after {
    animation: none !important;
    opacity: 0.6;
  }
}

/* ===================================================================== */
/*  分组按钮：不加“边框呼吸灯/外圈 glow”                                   */
/* - hover 仍然有轻微中性反馈                                               */
/* - active 只做清晰选中（背景 + 小阴影），不做发光 ring                     */
/* ===================================================================== */
:deep(.sidebar-group-btn) {
  background: transparent !important;
  border: 1px solid transparent !important;  /* 不要发光边 */
  border-radius: 16px !important;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

/* hover：中性雾面 */
:deep(.sidebar-group-btn:hover) {
  background: rgba(255, 255, 255, 0.10) !important;
  border-color: transparent !important;      /*  hover 不出边框 */
  transform: translateY(-1px);
}
html.light :deep(.sidebar-group-btn:hover) {
  background: rgba(0, 0, 0, 0.04) !important;
}

/* active：更直观但不发光（无 ring、无 accent 外圈） */
:deep(.sidebar-group-btn.is-active) {
  position: relative !important;
  background: rgba(255, 255, 255, 0.22) !important;
  border-color: transparent !important;      /*  active 不出边框 */

  transform: translateY(-1px) !important;
  box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.14),
      0 0 0 1px rgba(0, 0, 0, 0.06) inset !important; /*  仅内描边阴影 */
}
html.light :deep(.sidebar-group-btn.is-active) {
  background: rgba(0, 0, 0, 0.06) !important;
  box-shadow:
      0 10px 20px rgba(0, 0, 0, 0.08),
      0 0 0 1px rgba(255, 255, 255, 0.55) inset !important;
}

/*  去除左侧竖线 */
:deep(.sidebar-group-btn.is-active)::before {
  content: none !important;
}

/* 文本更醒目 */
:deep(.sidebar-group-btn.is-active span),
:deep(.sidebar-group-btn.is-active .group-title) {
  opacity: 1 !important;
  font-weight: 800 !important;
}

/* focus：小范围提示（不做 ring glow） */
:deep(.sidebar-group-btn:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.10);
}
html.light :deep(.sidebar-group-btn:focus-visible) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
}

/* 新建分组按钮：中性 hover */
.sidebar-add-btn {
  border: 1px dashed var(--sidebar-border);
  color: var(--sidebar-muted);
  background: transparent;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}
.sidebar-add-btn:hover {
  border-color: var(--sidebar-border);
  color: var(--sidebar-text);
  background: rgba(255, 255, 255, 0.08);
}
html.light .sidebar-add-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

/* ------------------------------ */
/* 动效（保留你原来的）            */
/* ------------------------------ */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
.slide-fade-right-enter-active,
.slide-fade-right-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>


