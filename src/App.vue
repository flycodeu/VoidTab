<script setup lang="ts">
import { ref, onMounted, provide } from 'vue';
import { useTheme } from './composables/useTheme';
import { useConfigStore } from './stores/useConfigStore';
import { PhEye, PhEyeSlash, PhCards, PhSpinner } from '@phosphor-icons/vue';

import CustomCursor from './components/ui/CustomCursor.vue';
import TimeWidget from './components/widgets/TimeWidget.vue';
import SearchBar from './components/widgets/SearchBar.vue';
import SideBar from './components/layout/SideBar.vue';
import SettingsModal from './components/settings/SettingsModal.vue';
import MainGrid from './components/layout/MainGrid.vue';
import WidgetPanel from './components/layout/WidgetPanel.vue';
import SiteDialog from './components/ui/SiteDialog.vue';
import GroupDialog from './components/ui/GroupDialog.vue';
import ContextMenu from './components/ui/ContextMenu.vue';

useTheme();
const store = useConfigStore();

const showSettings = ref(false);
const showWidgetModal = ref(false);
const isFocusMode = ref(false);
const activeGroupId = ref('');

interface DialogState { show: boolean; isEdit: boolean; groupId: string; initialData: any; }
const siteDialog = ref<DialogState>({ show: false, isEdit: false, groupId: '', initialData: null });
const groupDialog = ref<DialogState>({ show: false, isEdit: false, groupId: '', initialData: null });
const contextMenu = ref({ show: false, x: 0, y: 0, type: 'group', targetId: '', data: null as any });

provide('dialog', {
  openAddDialog: (gid: string) => { siteDialog.value = { show: true, isEdit: false, groupId: gid, initialData: null }; },
  openEditDialog: (gid: string, item: any) => { siteDialog.value = { show: true, isEdit: true, groupId: gid, initialData: item }; }
});

const onSiteSubmit = (data: any) => {
  if (siteDialog.value.isEdit && siteDialog.value.initialData) store.updateSite(siteDialog.value.groupId, siteDialog.value.initialData.id, data);
  else store.addSite(siteDialog.value.groupId, data);
};
const onGroupSubmit = (data: any) => {
  if (groupDialog.value.isEdit) store.updateGroup(groupDialog.value.groupId, data);
  else store.addGroup(data);
};
const openContextMenu = (e: MouseEvent, group: any) => {
  e.preventDefault();
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, type: 'group', targetId: group.id, data: group };
};
const handleMenuAction = (action: 'edit' | 'delete') => {
  contextMenu.value.show = false;
  if (action === 'edit') groupDialog.value = { show: true, isEdit: true, groupId: contextMenu.value.targetId, initialData: contextMenu.value.data };
  else if (action === 'delete') store.removeGroup(contextMenu.value.targetId);
};

onMounted(async () => {
  // 1. 触发异步加载 (无论是从 localStorage 还是 chrome.storage)
  await store.loadConfig();

  // 2. 数据加载完成后，再初始化 UI 状态，避免闪烁
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;
  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
});
</script>

<template>
  <div v-if="!store.isLoaded" class="h-screen w-full flex items-center justify-center bg-black text-white z-[9999]">
    <div class="flex flex-col items-center gap-4">
      <PhSpinner size="40" class="animate-spin text-[var(--accent-color)]" />
      <span class="font-tech tracking-widest text-xs opacity-70 animate-pulse">SYSTEM INITIALIZING...</span>
    </div>
  </div>

  <div v-else class="h-screen w-full relative overflow-hidden font-sans flex flex-col transition-all duration-500"
       :class="[store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row', { 'cursor-hidden': store.config.theme.customCursor }]"
       @click="contextMenu.show = false"
       style="color: var(--text-primary);">

    <CustomCursor />

    <div class="fixed inset-0 z-[-1]">
      <div class="absolute inset-0 bg-cover bg-center transition-all duration-700" :style="{ backgroundImage: `var(--bg-image)` }"></div>
      <div class="absolute inset-0 transition-all duration-500" style="background: var(--bg-overlay); opacity: var(--bg-overlay-opacity, 1);"></div>
      <div class="absolute inset-0 backdrop-blur-[var(--glass-backdrop-blur)] transition-all duration-300"></div>
    </div>

    <div class="fixed top-6 right-6 z-50 flex items-center gap-3">
      <button @click="showWidgetModal = true" class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95" title="控制台"><PhCards size="20" weight="bold" /></button>
      <button @click="isFocusMode = !isFocusMode" class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--accent-color)] shadow-lg hover:scale-110 active:scale-95" title="专注模式"><component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold" /></button>
    </div>

    <SideBar
        :activeGroupId="activeGroupId"
        :isFocusMode="isFocusMode"
        @update:activeGroupId="id => activeGroupId = id"
        @openSettings="showSettings = true"
        @openGroupDialog="groupDialog = { show: true, isEdit: false, groupId: '', initialData: null }"
        @openContextMenu="openContextMenu"
    />

    <main class="flex-1 w-full flex flex-col items-center relative overflow-hidden pt-16 md:pt-20 justify-start">
      <transition name="fade">
        <div :class="isFocusMode ? 'scale-110 translate-y-[20vh]' : ''" class="transition-all duration-500 w-full flex flex-col items-center z-30 shrink-0">
          <TimeWidget />
          <SearchBar @openSettings="showSettings = true" />
        </div>
      </transition>

      <transition name="fade">
        <div v-if="!isFocusMode" class="flex-1 w-full overflow-y-auto px-4 md:px-12 pb-20 pt-2 scroll-smooth no-scrollbar z-20">
          <MainGrid :activeGroupId="activeGroupId" />
        </div>
      </transition>
    </main>

    <SettingsModal :show="showSettings" @close="showSettings = false" />
    <WidgetPanel :isOpen="showWidgetModal" @close="showWidgetModal = false" />
    <SiteDialog :show="siteDialog.show" :isEdit="siteDialog.isEdit" :initialData="siteDialog.initialData" @close="siteDialog.show = false" @submit="onSiteSubmit" />
    <GroupDialog :show="groupDialog.show" :isEdit="groupDialog.isEdit" :initialData="groupDialog.initialData" @close="groupDialog.show = false" @submit="onGroupSubmit" />
    <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" @close="contextMenu.show = false" @edit="handleMenuAction('edit')" @delete="handleMenuAction('delete')" />

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>