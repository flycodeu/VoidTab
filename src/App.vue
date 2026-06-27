<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref} from 'vue';
import {PhSpinner, PhWarning} from '@phosphor-icons/vue';
import {useTheme} from './shared/composables/theme/useTheme.ts';
import {useThemeRuntimeSync} from './shared/composables/theme/useThemeRuntimeSync.ts';
import {useConfigStore} from './stores/useConfigStore';
import {useUiStore} from './stores/ui/useUiStore.ts';
import {useDialogs} from './shared/composables/dialog/useDialogs.ts';
import {useToast} from './shared/composables/useToast';
import {useAppDragAutoScroll} from './app/composables/useAppDragAutoScroll';
import {useAppGroupNavigation} from './app/composables/useAppGroupNavigation';
import {useBackgroundIconRefresh} from './app/composables/useBackgroundIconRefresh';
import {useDesktopViewport} from './app/composables/useDesktopViewport';
import type {SidebarPosition} from './core/config/types.ts';

import SideBar from './features/navigation/components/SideBar.vue';
import ContextMenu from './features/context-menu/components/ContextMenu.vue';
import WallpaperLayer from './app/shell/WallpaperLayer.vue';
import TopActions from './features/navigation/components/TopActions.vue';
import HomeMain from './features/home/components/HomeMain.vue';
import MobileGroupNav from './features/navigation/components/MobileGroupNav.vue';
import DeleteConfirmHost from './features/confirm-delete/components/DeleteConfirmHost.vue';
import ConfirmDialog from './shared/ui/dialogs/ConfirmDialog.vue';
import Toast from './shared/ui/Toast.vue';
import ErrorBoundary from './shared/ui/ErrorBoundary.vue';
import AmbientController from './app/shell/AmbientController.vue';
import MusicMiniPlayer from './app/shell/MusicMiniPlayer.vue';

const SettingsModal = defineAsyncComponent(() => import('./features/settings/components/SettingsModal.vue'));
const WidgetPanel = defineAsyncComponent(() => import('./features/widgets/components/WidgetPanel.vue'));
const SiteDialog = defineAsyncComponent(() => import('./shared/ui/dialogs/SiteDialog.vue'));
const GroupDialog = defineAsyncComponent(() => import('./shared/ui/dialogs/GroupDialog.vue'));
const AiChatPanel = defineAsyncComponent(() => import('./features/ai/components/AiChatPanel.vue'));
const TerminalPanel = defineAsyncComponent(() => import('./features/terminal/components/TerminalPanel.vue'));
const PrivacyVaultModal = defineAsyncComponent(() => import('./features/privacy/components/PrivacyVaultModal.vue'));
const DesignerModal = defineAsyncComponent(() => import('./features/designer/components/DesignerModal.vue'));

const store = useConfigStore();
const ui = useUiStore();
const toast = useToast();
useTheme();
useThemeRuntimeSync(store);

const showAiPanel = ref(false);
const showSettings = ref(false);
const showWidgetModal = ref(false);
const showPrivacyVault = ref(false);
const showDesigner = ref(false);
const widgetPanelGroupId = ref('');
const isGlobalEditMode = ref(false);
const showDevtoolsTip = ref(false);
const mobileViewport = ref<{ width: number; isNarrow: boolean }>({
  width: 0,
  isNarrow: false,
});

const sidebarPositionCycle: SidebarPosition[] = ['left', 'right', 'top', 'bottom'];
const {isDesktopViewport, mount: mountDesktopViewport, unmount: unmountDesktopViewport} = useDesktopViewport();
const dialogLogic = useDialogs(store, ui);

const isTerminalOpen = computed(() => store.config.runtime?.terminal?.isOpen || false);
const showSidebarNav = computed(() => store.config.theme.showSidebar !== false);
const workspaceLayout = computed(() => store.config.layout);
const effectiveSidebarPos = computed<SidebarPosition>(() => {
  return isDesktopViewport.value ? store.config.theme.sidebarPos : 'bottom';
});

const isFocusMode = computed({
  get: () => store.config.focusMode,
  set: (val: boolean) => {
    store.config.focusMode = val;
    store.saveConfig();
  },
});

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

const groupNavigation = useAppGroupNavigation({
  getGroups: () => workspaceLayout.value,
  getGroupTitle: (id) => workspaceLayout.value.find((group) => group.id === id)?.title || '',
  shouldUseContinuousScroll: () => store.config.theme.showAllGroupsInMain,
  isWheelDisabled: () => !canWheelSwitchGroup(),
  announce: (message) => ui.announce(message),
});

const {
  activeGroupId,
  setActiveGroupId,
  selectGroupId,
  syncActiveGroupIdFromScroll,
} = groupNavigation;

const canRunDragAutoScroll = () => {
  if (!store.isLoaded) return false;
  if (isFocusMode.value) return false;
  if (!isGlobalEditMode.value) return false;
  if (showSettings.value || showWidgetModal.value || showAiPanel.value) return false;
  if (isTerminalOpen.value) return false;
  return true;
};

const dragAutoScroll = useAppDragAutoScroll({
  isEnabled: canRunDragAutoScroll,
  isDragging: () => !!ui.dragState?.isDragging || ui.isGroupSorting,
});

const backgroundIconRefresh = useBackgroundIconRefresh((options) => store.refreshAutoSiteIconsBatch(options));

const toggleSidebarPos = () => {
  if (!isDesktopViewport.value) return;

  const current = store.config.theme.sidebarPos;
  const index = sidebarPositionCycle.indexOf(current);
  store.config.theme.sidebarPos = sidebarPositionCycle[(index + 1) % sidebarPositionCycle.length] || 'left';
  store.saveConfig();
};

const handleToggleTerminal = () => {
  if (!store.config.runtime.terminal) {
    store.config.runtime.terminal = {history: [], theme: 'dark', isOpen: false};
  }
  store.config.runtime.terminal.isOpen = !store.config.runtime.terminal.isOpen;
  store.saveConfig();
};

const closeTerminal = () => {
  if (!store.config.runtime.terminal) return;
  store.config.runtime.terminal.isOpen = false;
  store.saveConfig();
};

const handleToggleEdit = () => {
  isGlobalEditMode.value = !isGlobalEditMode.value;
};

const handleEditWidgetSettings = (item: any) => {
  widgetPanelGroupId.value = activeGroupId.value;
  showWidgetModal.value = true;

  const title = item?.title ? `「${item.title}」` : '该组件';
  toast.info(`已打开组件面板，可在这里管理${title}。`);
  ui.announce(`已打开组件面板，可管理${item?.title || '该组件'}`);
};

const openWidgetPanel = (groupId?: string) => {
  widgetPanelGroupId.value = groupId || activeGroupId.value;
  showWidgetModal.value = true;
};

const handleMobileViewport = (v: { width: number; isNarrow: boolean }) => {
  mobileViewport.value = v;
};

const closeDevToolsTip = () => {
  showDevtoolsTip.value = false;
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
  } catch {
  }
  showDevtoolsTip.value = true;
};

const handlePrivacyShortcut = (event: KeyboardEvent) => {
  const isPrivacyShortcut = event.ctrlKey && event.shiftKey && (event.code === 'Period' || event.key === '.' || event.key === '>');
  if (!isPrivacyShortcut) return;
  event.preventDefault();
  showPrivacyVault.value = true;
};

const openPrivacyVault = () => {
  showPrivacyVault.value = true;
};

const openDesigner = () => {
  showDesigner.value = true;
};

const openPrivacyVaultFromSettings = () => {
  showSettings.value = false;
  showPrivacyVault.value = true;
};

onMounted(async () => {
  if (!store.isLoaded) await store.loadConfig();
  if (store.config.layout.length > 0) setActiveGroupId(store.config.layout[0].id);

  backgroundIconRefresh.schedule();
  mountDesktopViewport();

  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
  document.documentElement.classList.toggle('dark', store.config.theme.mode === 'dark');

  groupNavigation.mount();
  dragAutoScroll.mount();
  window.addEventListener('keydown', handlePrivacyShortcut);
  window.addEventListener('voidtab:open-privacy-vault', openPrivacyVault);
  window.addEventListener('voidtab:open-designer', openDesigner);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handlePrivacyShortcut);
  window.removeEventListener('voidtab:open-privacy-vault', openPrivacyVault);
  window.removeEventListener('voidtab:open-designer', openDesigner);
  groupNavigation.unmount();
  dragAutoScroll.unmount();
  unmountDesktopViewport();
  backgroundIconRefresh.cancel();
});
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
          :class="effectiveSidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row'"
      >
        <header class="absolute top-0 left-0 right-0 z-50 pointer-events-none" aria-label="全局操作">
          <TopActions
              class="pointer-events-auto"
              :sidebarPos="effectiveSidebarPos"
              :showSidebar="showSidebarNav"
              :isFocusMode="isFocusMode"
              :isEditMode="isGlobalEditMode"
              @toggleSidebarPos="toggleSidebarPos"
              @toggleEdit="isGlobalEditMode = !isGlobalEditMode"
              @openWidgets="openWidgetPanel()"
              @toggleFocus="isFocusMode = !isFocusMode"
              @toggleAi="showAiPanel = true"
              @toggleTerminal="handleToggleTerminal"
          />
        </header>

        <SideBar
            v-if="showSidebarNav"
            class="hidden lg:flex z-40"
            :activeGroupId="activeGroupId"
            :isFocusMode="isFocusMode"
            @update:activeGroupId="selectGroupId"
            @openSettings="showSettings = true"
            @openGroupDialog="dialogLogic.openAddGroupDialog"
        />

        <HomeMain
            class="flex-1 z-30"
            :isFocusMode="isFocusMode"
            :activeGroupId="activeGroupId"
            :isEditMode="isGlobalEditMode"
            @update:isEditMode="isGlobalEditMode = $event"
            :sidebarPos="effectiveSidebarPos"
            :showSidebar="showSidebarNav"
            @openSettings="showSettings = true"
            @openGroupDialog="dialogLogic.openAddGroupDialog"
            @openWidgets="openWidgetPanel(activeGroupId)"
            :mobileNarrow="mobileViewport.isNarrow"
            :mobileWidth="mobileViewport.width"
            @update:activeGroupId="syncActiveGroupIdFromScroll"
        />

        <ContextMenu
            @toggleEdit="handleToggleEdit"
            @editWidgetSettings="handleEditWidgetSettings"
            @openWidgets="openWidgetPanel"
            @edit="dialogLogic.handleContextMenuEdit"
            @openSettings="showSettings = true"
            @openDevTools="tryOpenDevTools"
        />
      </div>

      <MobileGroupNav
          class="z-[70]"
          :show="!isFocusMode && showSidebarNav"
          :groups="store.config.layout"
          :activeGroupId="activeGroupId"
          @update:activeGroupId="selectGroupId"
          @openSettings="showSettings = true"
          @viewport="handleMobileViewport"
      />

      <Transition name="slide-fade">
        <AiChatPanel v-if="showAiPanel" class="z-[80]" :isOpen="showAiPanel" @close="showAiPanel = false"/>
      </Transition>

      <div class="relative z-[100]">
        <SettingsModal
            :show="showSettings"
            @close="showSettings = false"
            @openPrivacyVault="openPrivacyVaultFromSettings"
        />
        <WidgetPanel :isOpen="showWidgetModal" :activeGroupId="widgetPanelGroupId || activeGroupId" @close="showWidgetModal = false"/>
        <PrivacyVaultModal :show="showPrivacyVault" @close="showPrivacyVault = false"/>
        <DesignerModal :show="showDesigner" @close="showDesigner = false"/>

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

  <Toast />
  <AmbientController v-if="store.isLoaded"/>
  <MusicMiniPlayer v-if="store.isLoaded"/>
  </ErrorBoundary>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 0;
  height: 0;
  background: transparent;
}
</style>
