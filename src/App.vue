<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, ref} from 'vue';
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

import {useDialogs} from './composables/useDialogs';
import DeleteConfirmHost from './components/ui/DeleteConfirmHost.vue';

// --- 非首屏组件 ---
const SettingsModal = defineAsyncComponent(() => import('./components/settings/SettingsModal.vue'));
const WidgetPanel = defineAsyncComponent(() => import('./components/layout/WidgetPanel.vue'));
const SiteDialog = defineAsyncComponent(() => import('./components/ui/dialogs/SiteDialog.vue'));
const GroupDialog = defineAsyncComponent(() => import('./components/ui/dialogs/GroupDialog.vue'));

useTheme();

const store = useConfigStore();
const ui = useUiStore();

const showSettings = ref(false);
const showWidgetModal = ref(false);

const isFocusMode = ref(false);
const activeGroupId = ref('');
const isGlobalEditMode = ref(false);

// ✅ 拆分后的对话框逻辑
const dialogs = useDialogs(store, ui);

const toggleSidebarPos = () => {
  store.config.theme.sidebarPos = store.config.theme.sidebarPos === 'left' ? 'right' : 'left';
};

const showGreeting = computed(() => {
  const widget = store.config.widgets.find((w: any) => w.id === 'greeting');
  return widget ? widget.visible : true;
});

onMounted(async () => {
  await store.loadConfig();
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;
  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
});
</script>

<template>
  <div v-if="!store.isLoaded" class="h-screen w-full flex items-center justify-center bg-black text-white z-[9999]">
    <div class="flex flex-col items-center gap-4">
      <PhSpinner size="40" class="animate-spin text-[var(--accent-color)]"/>
      <span class="font-tech tracking-widest text-xs opacity-70 animate-pulse">SYSTEM INITIALIZING...</span>
    </div>
  </div>

  <div
      v-else
      class="h-screen w-full relative overflow-hidden font-sans flex flex-col transition-all duration-500"
      :class="[
      store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row',
      { 'cursor-hidden': store.config.theme.customCursor }
    ]"
      @click="ui.closeContextMenu()"
      @contextmenu="ui.closeContextMenu()"
      style="color: var(--text-primary);"
  >
    <CustomCursor/>

    <WallpaperLayer
        :wallpaper="store.config.theme.wallpaper"
        :blur="store.config.theme.blur"
        :opacity="store.config.theme.opacity"
    />

    <TopActions
        :sidebarPos="store.config.theme.sidebarPos"
        :isFocusMode="isFocusMode"
        :isEditMode="isGlobalEditMode"
        @toggleSidebarPos="toggleSidebarPos"
        @toggleEdit="isGlobalEditMode = !isGlobalEditMode"
        @openWidgets="showWidgetModal = true"
        @toggleFocus="isFocusMode = !isFocusMode"
    />

    <SideBar
        class="hidden md:flex"
        :activeGroupId="activeGroupId"
        :isFocusMode="isFocusMode"
        @update:activeGroupId="id => (activeGroupId = id)"
        @openSettings="showSettings = true"
        @openGroupDialog="dialogs.openAddGroupDialog"
    />

    <HomeMain
        :isFocusMode="isFocusMode"
        :activeGroupId="activeGroupId"
        :isEditMode="isGlobalEditMode"
        :showGreeting="showGreeting"
        :sidebarPos="store.config.theme.sidebarPos"
        @openSettings="showSettings = true"
    />

    <MobileGroupNav
        :show="!isFocusMode"
        :groups="store.config.layout"
        :activeGroupId="activeGroupId"
        @update:activeGroupId="id => (activeGroupId = id)"
        @openSettings="showSettings = true"
    />

    <SettingsModal :show="showSettings" @close="showSettings = false"/>
    <WidgetPanel :isOpen="showWidgetModal" @close="showWidgetModal = false"/>

    <SiteDialog
        :show="dialogs.siteDialog.show"
        :isEdit="dialogs.siteDialog.isEdit"
        :initialData="dialogs.siteDialog.initialData"
        @close="dialogs.siteDialog.show = false"
        @submit="dialogs.onSiteSubmit"
    />

    <GroupDialog
        :show="dialogs.groupDialog.show"
        :isEdit="dialogs.groupDialog.isEdit"
        :initialData="dialogs.groupDialog.initialData"
        @close="dialogs.groupDialog.show = false"
        @submit="dialogs.onGroupSubmit"
    />

    <ContextMenu @edit="dialogs.handleContextMenuEdit"/>

    <DeleteConfirmHost />
  </div>
</template>

<style scoped>
.custom-main-scroll::-webkit-scrollbar {
  width: 6px;
}

.custom-main-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-main-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 10px;
}

.custom-main-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.4);
}
</style>
