<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref} from 'vue';
import {useTheme} from './composables/useTheme';
import {useConfigStore} from './stores/useConfigStore';
import {useUiStore} from './stores/useUiStore';
import {PhSpinner} from '@phosphor-icons/vue';

import CustomCursor from './components/ui/CustomCursor.vue';
import SideBar from './components/layout/SideBar.vue';
import ContextMenu from './components/ui/context-menu/ContextMenu.vue';
import WallpaperLayer from './components/layout/WallpaperLayer.vue';
import TopActions from './components/layout/TopActions.vue';
import HomeMain from './components/layout/HomeMain.vue';
import MobileGroupNav from './components/layout/MobileGroupNav.vue';
import DeleteConfirmHost from './components/ui/DeleteConfirmHost.vue';

const SettingsModal = defineAsyncComponent(() => import('./components/settings/SettingsModal.vue'));
const WidgetPanel = defineAsyncComponent(() => import('./components/layout/WidgetPanel.vue'));
const SiteDialog = defineAsyncComponent(() => import('./components/ui/dialogs/SiteDialog.vue'));
const GroupDialog = defineAsyncComponent(() => import('./components/ui/dialogs/GroupDialog.vue'));
const AiChatPanel = defineAsyncComponent(() => import('./components/layout/AiChatPanel.vue'));

const store = useConfigStore();
const ui = useUiStore();
useTheme();

const showAiPanel = ref(false);
const showSettings = ref(false);
const showWidgetModal = ref(false);

const activeGroupId = ref('');
const isGlobalEditMode = ref(false);

const isFocusMode = computed({
  get: () => store.config.focusMode,
  set: (val: boolean) => {
    store.config.focusMode = val;
    store.saveConfig();
  }
});

const showGreeting = computed(() => {
  const widget = store.config.widgets.find((w: any) => w.id === 'greeting');
  return widget ? widget.visible : true;
});

const toggleSidebarPos = () => {
  store.config.theme.sidebarPos = store.config.theme.sidebarPos === 'left' ? 'right' : 'left';
};

const setActiveGroupId = (id: string) => {
  activeGroupId.value = id;
};

import {useDialogs} from './composables/useDialogs';

const dialogLogic = useDialogs(store, ui);

const WHEEL_THRESHOLD = 80;
const WHEEL_COOLDOWN = 360;

let wheelAcc = 0;
let lastWheelTs = 0;
let wheelLocked = false;
let wheelHandler: ((e: WheelEvent) => void) | null = null;

function canWheelSwitchGroup() {
  if (!store.isLoaded) return false;
  if (isFocusMode.value) return false;

  //  整理模式：不接管滚轮（允许滚动 + 拖拽边缘滚动）
  if (isGlobalEditMode.value) return false;

  if (showSettings.value || showWidgetModal.value || showAiPanel.value) return false;
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

  // 最高优先级：在允许滚动区域内，永远放行（不拦截、不切组）
  if (target?.closest?.('[data-wheel-allow="true"]')) return;

  // 下面才是“切分组”的逻辑
  if (!canWheelSwitchGroup()) return;
  if (isTypingTarget(target)) return;

  //  非整理模式：禁止页面滚动
  e.preventDefault();

  if (wheelLocked) return;

  const now = performance.now();
  if (now - lastWheelTs > 180) wheelAcc = 0;
  lastWheelTs = now;

  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;

  const dir = wheelAcc > 0 ? (1 as const) : (-1 as const);
  wheelAcc = 0;

  wheelLocked = true;
  switchGroup(dir);

  window.setTimeout(() => {
    wheelLocked = false;
  }, WHEEL_COOLDOWN);
}


onMounted(async () => {
  await store.loadConfig();
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;

  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
  document.documentElement.classList.toggle('dark', store.config.theme.mode === 'dark');

  wheelHandler = (e: WheelEvent) => onWheelCapture(e);
  window.addEventListener('wheel', wheelHandler, {capture: true, passive: false});
});

onUnmounted(() => {
  if (wheelHandler) window.removeEventListener('wheel', wheelHandler, true);
});
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
      class="h-screen w-full relative overflow-hidden font-sans"
      :class="[{ 'cursor-none': store.config.theme.customCursor }]"
      @click="ui.closeContextMenu()"
      @contextmenu="ui.closeContextMenu()"
      style="color: var(--text-primary);"
  >
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
          :showGreeting="showGreeting"
          :sidebarPos="store.config.theme.sidebarPos"
          @openSettings="showSettings = true"
      />
    </div>

    <div class="fixed inset-0 z-[60] pointer-events-none">
      <CustomCursor class="pointer-events-auto"/>
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

    <ContextMenu @edit="dialogLogic.handleContextMenuEdit"/>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
