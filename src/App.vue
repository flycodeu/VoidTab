<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref} from 'vue';
import {useTheme} from './shared/composables/theme/useTheme.ts';
import {useConfigStore} from './stores/useConfigStore';
import {useUiStore} from './stores/ui/useUiStore.ts';
import {PhSpinner} from '@phosphor-icons/vue';
import {useDialogs} from './shared/composables/dialog/useDialogs.ts';
import {PhWarning} from '@phosphor-icons/vue';

// 基础组件
import SideBar from './features/navigation/components/SideBar.vue';
import ContextMenu from './features/context-menu/components/ContextMenu.vue';
import WallpaperLayer from './app/shell/WallpaperLayer.vue';
import TopActions from './features/navigation/components/TopActions.vue';
import HomeMain from './features/home/components/HomeMain.vue';
import MobileGroupNav from './features/navigation/components/MobileGroupNav.vue';
import DeleteConfirmHost from './features/confirm-delete/components/DeleteConfirmHost.vue';

// 异步加载弹窗
const SettingsModal = defineAsyncComponent(() => import('./features/settings/components/SettingsModal.vue'));
const WidgetPanel = defineAsyncComponent(() => import('./features/widgets/components/WidgetPanel.vue'));
const SiteDialog = defineAsyncComponent(() => import('./shared/ui/dialogs/SiteDialog.vue'));
const GroupDialog = defineAsyncComponent(() => import('./shared/ui/dialogs/GroupDialog.vue'));
const AiChatPanel = defineAsyncComponent(() => import('./features/ai/components/AiChatPanel.vue'));
const TerminalPanel = defineAsyncComponent(() => import('./features/teminal/components/TerminalPanel.vue'));
import {useThemeRuntimeSync} from './shared/composables/theme/useThemeRuntimeSync.ts';
import ConfirmDialog from './shared/ui/dialogs/ConfirmDialog.vue';
import Toast from './shared/ui/Toast.vue';
import ErrorBoundary from './shared/ui/ErrorBoundary.vue';
import {useToast} from './shared/composables/useToast';

const store = useConfigStore();
const ui = useUiStore();
const toast = useToast();
useTheme();
useThemeRuntimeSync(store);

const showAiPanel = ref(false);
const showSettings = ref(false);
const showWidgetModal = ref(false);

const activeGroupId = ref('');
const isGlobalEditMode = ref(false);

// 核心状态：终端模式是否开启
const isTerminalOpen = computed(() => store.config.runtime?.terminal?.isOpen || false);

const isFocusMode = computed({
  get: () => store.config.focusMode,
  set: (val: boolean) => {
    store.config.focusMode = val;
    store.saveConfig();
  },
});

const toggleSidebarPos = () => {
  store.config.theme.sidebarPos = store.config.theme.sidebarPos === 'left' ? 'right' : 'left';
};

const getGroupTitle = (id: string) => {
  return store.config.layout.find((group) => group.id === id)?.title || '';
};

const setActiveGroupId = (id: string) => {
  activeGroupId.value = id;
  const title = getGroupTitle(id);
  if (title) ui.announce(`已切换到「${title}」分组`);
};

const dialogLogic = useDialogs(store, ui);

// ======================================================
// 滚轮切换分组逻辑：只在“没有可滚容器还能滚”时才切组
// ======================================================
const WHEEL_THRESHOLD = 80;
const WHEEL_COOLDOWN = 360;
let wheelAcc = 0;
let lastWheelTs = 0;
let wheelLocked = false;
let wheelHandler: ((e: WheelEvent) => void) | null = null;

function isPointerInsideSidebarList(e: WheelEvent) {
  const el = document.querySelector('[data-sidebar-list="1"]') as HTMLElement | null;
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

function isInsideAnyModalByTarget(target: HTMLElement | null) {
  return !!target?.closest?.('[data-modal="1"]');
}

function getPointerElementFromWheel(e: WheelEvent) {
  return (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) || (e.target as HTMLElement | null);
}

function findScrollableAncestor(start: HTMLElement | null) {
  let el: HTMLElement | null = start;
  while (el) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    const isScrollableY = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
    const hasScroll = el.scrollHeight > el.clientHeight + 1;
    if (isScrollableY && hasScroll) return el;
    el = el.parentElement;
  }
  return null;
}

function canScrollInDirection(el: HTMLElement, deltaY: number) {
  // 如果没有滚动内容，返回 false 允许切换分组
  if (el.scrollHeight <= el.clientHeight + 1) return false;

  if (deltaY < 0) return el.scrollTop > 0;
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return false;
}

function canWheelSwitchGroup() {
  if (!store.isLoaded) return false;
  if (isFocusMode.value) return false;
  if (isGlobalEditMode.value) return false;
  if (showSettings.value || showWidgetModal.value || showAiPanel.value) return false;
  if (isTerminalOpen.value) return false;
  if (ui.dragState?.isDragging) return false;
  if (ui.isGroupSorting) return false;
  return true;
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as any).isContentEditable) return true;
  return false;
}

function switchGroup(dir: 1 | -1) {
  const groups = store.config.layout || [];
  if (groups.length <= 1) return;
  const current = activeGroupId.value;
  const idx = groups.findIndex((g) => g.id === current);
  const base = idx >= 0 ? idx : 0;
  const nextIdx = (base + dir + groups.length) % groups.length;
  const nextId = groups[nextIdx]?.id;
  if (nextId) setActiveGroupId(nextId);
}

function onWheelCapture(e: WheelEvent) {
  if (!e.cancelable) return;

  const pointerEl = getPointerElementFromWheel(e);

  // 任意 modal 内直接放行（不要抢滚动）
  if (isInsideAnyModalByTarget(pointerEl)) return;

  // 侧栏列表区域放行
  if (isPointerInsideSidebarList(e)) return;

  // 分组排序放行
  if (ui.isGroupSorting) return;

  // 指针下存在可滚容器且还能滚 -> 放行
  const scrollable = findScrollableAncestor(pointerEl);
  if (scrollable && canScrollInDirection(scrollable, e.deltaY)) return;

  // 显式允许区域放行
  if (pointerEl?.closest?.('[data-wheel-allow="true"]')) return;

  if (!canWheelSwitchGroup()) return;
  if (isTypingTarget(pointerEl)) return;

  // 只有无处可滚时才切组
  e.preventDefault();

  if (wheelLocked) return;
  const now = performance.now();
  if (now - lastWheelTs > 180) wheelAcc = 0;
  lastWheelTs = now;
  wheelAcc += e.deltaY;

  if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;

  const dir = wheelAcc > 0 ? 1 : -1;
  wheelAcc = 0;
  wheelLocked = true;
  switchGroup(dir as 1 | -1);
  window.setTimeout(() => {
    wheelLocked = false;
  }, WHEEL_COOLDOWN);
}

// ======================================================
// 修复：整理模式拖拽靠边自动滚动（使用 dragover 而不是 pointermove）
// ======================================================

/** 边缘触发范围（px） */
const AUTO_SCROLL_MARGIN = 110;
/** 基础速度（px/帧） */
const AUTO_SCROLL_BASE_SPEED = 10;
/** 最大速度（px/帧） */
const AUTO_SCROLL_MAX_SPEED = 28;

let autoScrollRaf: number | null = null;
let lastPointerY = 0;

/** 选择真正可滚动的主容器：
 * - 允许你在多个 data-main-scroll="1" 中选“真的能滚”的那个
 */
function pickMainScrollEl(): HTMLElement | null {
  const list = Array.from(document.querySelectorAll('[data-main-scroll="1"]')) as HTMLElement[];
  if (!list.length) return null;

  // 选 scrollHeight - clientHeight 最大的那个（最可能是主滚动容器）
  let best: HTMLElement | null = null;
  let bestDelta = 0;

  for (const el of list) {
    const delta = el.scrollHeight - el.clientHeight;
    if (delta > bestDelta + 1) {
      best = el;
      bestDelta = delta;
    }
  }

  return best ?? list[0] ?? null;
}

/** 判断“现在是否在拖拽中”
 * - 不只依赖 ui.dragState（site/icon 拖拽可能不走这套）
 * - 兜底用 DOM class（Sortable/VueDraggable 常见）
 */
function isAnyDraggingNow(): boolean {
  if (ui.dragState?.isDragging) return true;
  if (ui.isGroupSorting) return true;

  // DOM 兜底（按你项目里出现过的 class）
  const hit =
      document.querySelector('.sortable-ghost') ||
      document.querySelector('.group-ghost') ||
      document.querySelector('.group-drag') ||
      document.querySelector('.vue-draggable-dragging') ||
      document.querySelector('.dragging') ||
      document.querySelector('[draggable="true"].dragging');

  return !!hit;
}

/** auto-scroll 生效条件：只在整理模式拖拽时 */
function canAutoScroll(): boolean {
  if (!store.isLoaded) return false;
  if (isFocusMode.value) return false;
  if (!isGlobalEditMode.value) return false;
  if (showSettings.value || showWidgetModal.value || showAiPanel.value) return false;
  if (isTerminalOpen.value) return false;

  // 拖拽中（不只看 ui.dragState）
  if (!isAnyDraggingNow()) return false;

  return true;
}

/** 根据靠近边缘程度计算速度（越靠近越快） */
function calcSpeed(y: number): { dir: -1 | 0 | 1; speed: number } {
  const vh = window.innerHeight;

  // 顶部
  if (y <= AUTO_SCROLL_MARGIN) {
    const k = Math.min(1, (AUTO_SCROLL_MARGIN - y) / AUTO_SCROLL_MARGIN);
    const speed = AUTO_SCROLL_BASE_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_BASE_SPEED) * k;
    return {dir: -1, speed};
  }

  // 底部
  if (y >= vh - AUTO_SCROLL_MARGIN) {
    const dist = vh - y;
    const k = Math.min(1, (AUTO_SCROLL_MARGIN - dist) / AUTO_SCROLL_MARGIN);
    const speed = AUTO_SCROLL_BASE_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_BASE_SPEED) * k;
    return {dir: 1, speed};
  }

  return {dir: 0, speed: 0};
}

function stopAutoScroll() {
  if (autoScrollRaf != null) cancelAnimationFrame(autoScrollRaf);
  autoScrollRaf = null;
}

function autoScrollTick() {
  if (!canAutoScroll()) {
    stopAutoScroll();
    return;
  }

  const sc = pickMainScrollEl();
  if (!sc) {
    stopAutoScroll();
    return;
  }

  const {dir, speed} = calcSpeed(lastPointerY);
  if (dir === 0) {
    // 在中间区域就停，但保持下一次 dragover 可以再启动
    stopAutoScroll();
    return;
  }

  sc.scrollTop += dir * speed;
  autoScrollRaf = requestAnimationFrame(autoScrollTick);
}

function ensureAutoScrollRunning() {
  if (autoScrollRaf != null) return;
  autoScrollRaf = requestAnimationFrame(autoScrollTick);
}

/** 用 DragEvent 更新指针位置（拖拽时一定会触发） */
function onDragOverForAutoScroll(e: DragEvent) {
  if (!e) return;

  // 如果在自动滚动状态，阻止默认行为
  if (canAutoScroll()) {
    if (e.cancelable) {
      e.preventDefault();
    }
  }

  // dragover 会持续触发，拿 clientY 更新即可
  lastPointerY = e.clientY || lastPointerY;

  if (!canAutoScroll()) return;

  const {dir} = calcSpeed(lastPointerY);
  if (dir !== 0) ensureAutoScrollRunning();
}

/** 兜底：有些实现仍会有 mousemove */
function onMouseMoveForAutoScroll(e: MouseEvent) {
  lastPointerY = e.clientY || lastPointerY;
}

/** dragend/drop 时停止 */
function onDragEndForAutoScroll() {
  stopAutoScroll();
}

// ======================================================
// 终端
// ======================================================
const handleToggleTerminal = () => {
  if (!store.config.runtime.terminal) {
    store.config.runtime.terminal = {history: [], theme: 'dark', isOpen: false};
  }
  store.config.runtime.terminal.isOpen = !store.config.runtime.terminal.isOpen;
  store.saveConfig();
};

const closeTerminal = () => {
  if (store.config.runtime.terminal) {
    store.config.runtime.terminal.isOpen = false;
    store.saveConfig();
  }
};

onMounted(async () => {
  if (!store.isLoaded) await store.loadConfig();
  if (store.config.layout.length > 0) setActiveGroupId(store.config.layout[0].id);
  void store.refreshAutoSiteIconsBatch();

  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
  document.documentElement.classList.toggle('dark', store.config.theme.mode === 'dark');

  wheelHandler = (e: WheelEvent) => onWheelCapture(e);
  window.addEventListener('wheel', wheelHandler, {capture: true, passive: false});

  // 核心：dragover 驱动自动滚动（最关键）
  window.addEventListener('dragover', onDragOverForAutoScroll, {capture: true, passive: false});
  window.addEventListener('dragend', onDragEndForAutoScroll, {capture: true, passive: true});
  window.addEventListener('drop', onDragEndForAutoScroll, {capture: true, passive: true});

  // 兜底：部分拖拽实现仍会有 mousemove
  window.addEventListener('mousemove', onMouseMoveForAutoScroll, {capture: true, passive: true});

  window.addEventListener('blur', onDragEndForAutoScroll);
});

onUnmounted(() => {
  if (wheelHandler) window.removeEventListener('wheel', wheelHandler, true);

  window.removeEventListener('dragover', onDragOverForAutoScroll, true);
  window.removeEventListener('dragend', onDragEndForAutoScroll, true);
  window.removeEventListener('drop', onDragEndForAutoScroll, true);
  window.removeEventListener('mousemove', onMouseMoveForAutoScroll, true);
  window.removeEventListener('blur', onDragEndForAutoScroll);

  stopAutoScroll();
});

// 处理事件：切换编辑模式
const handleToggleEdit = () => {
  isGlobalEditMode.value = !isGlobalEditMode.value;
};

// 处理事件：配置组件
const handleEditWidgetSettings = (item: any) => {
  showWidgetModal.value = true;
  const title = item?.title ? `「${item.title}」` : '该组件';
  toast.info(`已打开组件面板，可在这里管理${title}。`);
  ui.announce(`已打开组件面板，可管理${item?.title || '该组件'}`);
};

// 移动端视口信息
const mobileViewport = ref<{ width: number; isNarrow: boolean }>({
  width: 0,
  isNarrow: false,
});
const handleMobileViewport = (v: { width: number; isNarrow: boolean }) => {
  mobileViewport.value = v;
};

const showDevtoolsTip = ref(false);
const openDevToolsTip = () => {
  showDevtoolsTip.value = true;
};
const closeDevToolsTip = () => {
  showDevtoolsTip.value = false;
};
const handleOpenDevTools = () => {
  openDevToolsTip();
};

const tryOpenDevTools = () => {
  try {
    const evt = new KeyboardEvent('keydown', {
      key: 'F12',
      code: 'F12',
      keyCode: 123,
      which: 123,
      bubbles: true,
      cancelable: true,
    } as any);
    window.dispatchEvent(evt);
  } catch (e) {
    // ignore
  }
  handleOpenDevTools();
};
</script>

<template>
  <ErrorBoundary>
  <a href="#main-content" class="skip-link">跳到主内容</a>
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ ui.announcement }}</div>

  <div v-if="!store.isLoaded" class="fixed inset-0 flex items-center justify-center bg-[#121212] text-white z-[9999]">
    <div class="flex flex-col items-center gap-4">
      <PhSpinner size="40" class="animate-spin text-[var(--accent-color)]"/>
      <span class="font-mono tracking-widest text-xs opacity-70 animate-pulse">SYSTEM INITIALIZING...</span>
    </div>
  </div>

  <div
      v-else
      class="h-screen w-full relative overflow-hidden font-sans isolate"
      :class="[
      { 'theme-tech-font': store.config.theme.techFont },
      { 'theme-breathing': store.config.theme.breathingLight },
      { 'theme-neon': store.config.theme.neonGlow }
    ]"
      @click="ui.closeContextMenu()"
      @contextmenu="ui.closeContextMenu()"
      style="color: var(--text-primary);"
  >
    <Transition name="fade">
      <TerminalPanel v-if="isTerminalOpen" class="z-[9999]" @close="closeTerminal"/>
    </Transition>

    <div v-show="!isTerminalOpen" class="w-full h-full relative">
      <WallpaperLayer
          :wallpaper="store.config.theme.wallpaper"
          :blur="store.config.theme.blur"
          :opacity="store.config.theme.opacity"
      />

      <div
          class="relative z-10 w-full h-full flex flex-col transition-all duration-500"
          :class="store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row'"
      >
        <header class="absolute top-0 left-0 right-0 z-50 pointer-events-none" aria-label="全局操作">
          <TopActions
              class="pointer-events-auto"
              :sidebarPos="store.config.theme.sidebarPos"
              :isFocusMode="isFocusMode"
              :isEditMode="isGlobalEditMode"
              @toggleSidebarPos="toggleSidebarPos"
              @toggleEdit="isGlobalEditMode = !isGlobalEditMode"
              @openWidgets="showWidgetModal = true"
              @toggleFocus="isFocusMode = !isFocusMode"
              @toggleAi="showAiPanel = true"
              @toggleTerminal="handleToggleTerminal"
          />
        </header>

        <SideBar
            class="hidden lg:flex z-40"
            :activeGroupId="activeGroupId"
            :isFocusMode="isFocusMode"
            @update:activeGroupId="setActiveGroupId"
            @openSettings="showSettings = true"
            @openGroupDialog="dialogLogic.openAddGroupDialog"
        />

        <HomeMain
            class="flex-1 z-30"
            :isFocusMode="isFocusMode"
            :activeGroupId="activeGroupId"
            :isEditMode="isGlobalEditMode"
            @update:isEditMode="isGlobalEditMode = $event"
            :sidebarPos="store.config.theme.sidebarPos"
            @openSettings="showSettings = true"
            @openGroupDialog="dialogLogic.openAddGroupDialog"
            @openWidgets="showWidgetModal = true"
            :mobileNarrow="mobileViewport.isNarrow"
            :mobileWidth="mobileViewport.width"
        />

        <ContextMenu
            @toggleEdit="handleToggleEdit"
            @editWidgetSettings="handleEditWidgetSettings"
            @edit="dialogLogic.handleContextMenuEdit"
            @openSettings="showSettings = true"
            @openDevTools="tryOpenDevTools"
        />
      </div>

      <MobileGroupNav
          class="z-[70]"
          :show="!isFocusMode"
          :groups="store.config.layout"
          :activeGroupId="activeGroupId"
          @update:activeGroupId="setActiveGroupId"
          @openSettings="showSettings = true"
          @viewport="handleMobileViewport"
      />

      <Transition name="slide-fade">
        <AiChatPanel v-if="showAiPanel" class="z-[80]" :isOpen="showAiPanel" @close="showAiPanel = false"/>
      </Transition>

      <div class="relative z-[100]">
        <SettingsModal :show="showSettings" @close="showSettings = false"/>
        <WidgetPanel :isOpen="showWidgetModal" @close="showWidgetModal = false"/>

        <SiteDialog
            :show="dialogLogic.siteDialog.show"
            :isEdit="dialogLogic.siteDialog.isEdit"
            :initialData="dialogLogic.siteDialog.initialData"
            @close="dialogLogic.siteDialog.show = false"
            @submit="dialogLogic.onSiteSubmit"
        />

        <GroupDialog
            :show="dialogLogic.groupDialog.show"
            :isEdit="dialogLogic.groupDialog.isEdit"
            :initialData="dialogLogic.groupDialog.initialData"
            @close="dialogLogic.groupDialog.show = false"
            @submit="dialogLogic.onGroupSubmit"
        />

        <DeleteConfirmHost/>
      </div>
    </div>
  </div>

  <ConfirmDialog
      :show="showDevtoolsTip"
      title="无法自动打开开发者工具"
      :message="[
      '浏览器出于安全策略，页面无法强制打开 DevTools。',
      '',
      '请使用快捷键：',
      'Windows/Linux：F12 或 Ctrl + Shift + I',
      'macOS：⌥⌘I'
    ]"
      confirmText="我知道了"
      cancelText="关闭"
      :danger="false"
      :closeOnBackdrop="true"
      @cancel="closeDevToolsTip"
      @confirm="closeDevToolsTip"
  >
    <template #icon>
      <PhWarning :size="32" weight="duotone"/>
    </template>
  </ConfirmDialog>

  <!-- 🔔 全局 Toast 通知系统 -->
  <Toast />
  </ErrorBoundary>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* 隐藏所有元素滚动条但保留滚动功能 */
::-webkit-scrollbar {
  width: 0;
  height: 0;
  background: transparent;
}
</style>
