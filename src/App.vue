<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref} from 'vue';
import {useTheme} from './shared/composables/theme/useTheme.ts';
import {useConfigStore} from './stores/useConfigStore';
import {useUiStore} from './stores/ui/useUiStore.ts';
import {PhSpinner} from '@phosphor-icons/vue';
import {useDialogs} from './shared/composables/dialog/useDialogs.ts';

// 基础组件
import CustomCursor from './shared/ui/cursor/CustomCursor.vue';
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

const store = useConfigStore();
const ui = useUiStore();
useTheme(); // 初始化主题

const showAiPanel = ref(false);
const showSettings = ref(false);
const showWidgetModal = ref(false);

const activeGroupId = ref('');
const isGlobalEditMode = ref(false);

// 核心状态：终端模式是否开启 (依赖持久化 Store)
const isTerminalOpen = computed(() => store.config.runtime?.terminal?.isOpen || false);

const isFocusMode = computed({
  get: () => store.config.focusMode,
  set: (val: boolean) => {
    store.config.focusMode = val;
    store.saveConfig();
  }
});

const toggleSidebarPos = () => {
  store.config.theme.sidebarPos = store.config.theme.sidebarPos === 'left' ? 'right' : 'left';
};

const setActiveGroupId = (id: string) => {
  activeGroupId.value = id;
};

const dialogLogic = useDialogs(store, ui);

// --- 滚轮切换分组逻辑 ---
const WHEEL_THRESHOLD = 80;
const WHEEL_COOLDOWN = 360;
let wheelAcc = 0;
let lastWheelTs = 0;
let wheelLocked = false;
let wheelHandler: ((e: WheelEvent) => void) | null = null;

function canWheelSwitchGroup() {
  if (!store.isLoaded) return false;
  if (isFocusMode.value) return false;
  if (isGlobalEditMode.value) return false; // 编辑模式下禁用滚轮切组
  if (showSettings.value || showWidgetModal.value || showAiPanel.value) return false;
  if (isTerminalOpen.value) return false; // 终端模式下禁用滚轮切组
  if (ui.dragState?.isDragging) return false;
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
  const idx = groups.findIndex(g => g.id === current);
  const base = idx >= 0 ? idx : 0;
  const nextIdx = (base + dir + groups.length) % groups.length;
  const nextId = groups[nextIdx]?.id;
  if (nextId) activeGroupId.value = nextId;
}

function onWheelCapture(e: WheelEvent) {
  if (!e.cancelable) return;
  const target = e.target as HTMLElement | null;
  const scrollContainer = target?.closest('[data-main-scroll="1"], .overflow-y-auto') as HTMLElement | null;

  if (scrollContainer) {
    const {scrollTop, scrollHeight, clientHeight} = scrollContainer;
    const hasScrollbar = scrollHeight > clientHeight + 1;
    if (hasScrollbar) {
      const isScrollingUp = e.deltaY < 0;
      const isScrollingDown = e.deltaY > 0;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
      if ((isScrollingUp && !isAtTop) || (isScrollingDown && !isAtBottom)) {
        return;
      }
    }
  }

  if (target?.closest?.('[data-wheel-allow="true"]')) return;
  if (!canWheelSwitchGroup()) return;
  if (isTypingTarget(target)) return;

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

// 切换终端模式 (更新 Store 并保存)
const handleToggleTerminal = () => {
  if (!store.config.runtime.terminal) {
    store.config.runtime.terminal = {history: [], theme: 'dark', isOpen: false};
  }
  store.config.runtime.terminal.isOpen = !store.config.runtime.terminal.isOpen;
  store.saveConfig();
};

// 关闭终端 (由终端组件触发)
const closeTerminal = () => {
  if (store.config.runtime.terminal) {
    store.config.runtime.terminal.isOpen = false;
    store.saveConfig();
  }
};

onMounted(async () => {
  await store.loadConfig();
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;

  wheelHandler = (e: WheelEvent) => onWheelCapture(e);
  window.addEventListener('wheel', wheelHandler, {capture: true, passive: false});
});

onUnmounted(() => {
  if (wheelHandler) window.removeEventListener('wheel', wheelHandler, true);
});

// 处理事件：切换编辑模式
const handleToggleEdit = () => {
  isGlobalEditMode.value = !isGlobalEditMode.value;
}

// 处理事件：配置组件
const handleEditWidgetSettings = (item: any) => {
  console.log("配置组件", item);
  // 这里可以添加打开组件配置弹窗的逻辑
}
</script>

<template>
  <div v-if="!store.isLoaded" class="fixed inset-0 flex items-center justify-center bg-[#121212] text-white z-[9999]">
    <div class="flex flex-col items-center gap-4">
      <PhSpinner size="40" class="animate-spin text-[var(--accent-color)]"/>
      <span class="font-mono tracking-widest text-xs opacity-70 animate-pulse">SYSTEM INITIALIZING...</span>
    </div>
  </div>

  <div
      v-else
      class="h-screen w-full relative overflow-hidden font-sans isolate"
      :class="[{ 'cursor-none': store.config.theme.customCursor }]"
      @click="ui.closeContextMenu()"
      @contextmenu="ui.closeContextMenu()"
      style="color: var(--text-primary);"
  >

    <Transition name="fade">
      <TerminalPanel
          v-if="isTerminalOpen"
          class="z-[9999]"
          @close="closeTerminal"
      />
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
        <div class="absolute top-0 left-0 right-0 z-50 pointer-events-none">
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
        </div>

        <SideBar
            class="hidden md:flex z-40"
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
        />

        <ContextMenu
            @toggleEdit="handleToggleEdit"
            @editWidgetSettings="handleEditWidgetSettings"
            @edit="dialogLogic.handleContextMenuEdit"
        />
      </div>

      <MobileGroupNav
          class="z-[70]"
          :show="!isFocusMode"
          :groups="store.config.layout"
          :activeGroupId="activeGroupId"
          @update:activeGroupId="setActiveGroupId"
          @openSettings="showSettings = true"
      />

      <Transition name="slide-fade">
        <AiChatPanel
            v-if="showAiPanel"
            class="z-[80]"
            :isOpen="showAiPanel"
            @close="showAiPanel = false"
        />
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

    <div class="fixed inset-0 z-[10000] pointer-events-none">
      <CustomCursor class="pointer-events-auto"/>
    </div>

  </div>
</template>

<style>
/* 全局强制隐藏滚动条 - 解决插件模式下样式丢失问题 */
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden; /* 防止 body 滚动 */
}

/* 隐藏所有元素的滚动条但保留滚动功能 */
::-webkit-scrollbar {
  width: 0;
  height: 0;
  background: transparent;
}
</style>