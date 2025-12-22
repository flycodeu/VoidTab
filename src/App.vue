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
import GroupDialog from './components/ui/GroupDialog.vue'; // 假设你有这个组件
import ContextMenu from './components/ui/ContextMenu.vue';

useTheme();
const store = useConfigStore();

const showSettings = ref(false);
const showWidgetModal = ref(false);
const isFocusMode = ref(false);
const activeGroupId = ref('');

// 弹窗状态管理
interface DialogState { show: boolean; isEdit: boolean; groupId: string; initialData: any; }

const siteDialog = ref<DialogState>({ show: false, isEdit: false, groupId: '', initialData: null });
const groupDialog = ref<DialogState>({ show: false, isEdit: false, groupId: '', initialData: null });

// ✨ 1. 处理全局右键菜单的“编辑”事件
const handleGlobalEdit = () => {
  // 从 Store 中获取当前右键选中的目标信息
  const { type, item, groupId } = store.contextMenu;

  if (type === 'site') {
    // 编辑网站：填充数据并打开 SiteDialog
    siteDialog.value = {
      show: true,
      isEdit: true,
      groupId: groupId, // 记录所属分组ID
      initialData: { ...item } // 复制数据，防止直接引用
    };
  } else if (type === 'group') {
    // 编辑分组：填充数据并打开 GroupDialog
    groupDialog.value = {
      show: true,
      isEdit: true,
      groupId: '', // 分组编辑通常不需要父ID
      initialData: { ...item }
    };
  }
};

// 打开“添加网站”弹窗的方法
const openAddSiteDialog = (gid: string) => {
  siteDialog.value = { show: true, isEdit: false, groupId: gid, initialData: null };
};

// 打开“添加分组”弹窗的方法
const openAddGroupDialog = () => {
  groupDialog.value = { show: true, isEdit: false, groupId: '', initialData: null };
};

// 注入给子组件 (Sidebar "添加"按钮 和 MainGrid "添加"块)
provide('dialog', {
  openAddDialog: openAddSiteDialog,
  openGroupDialog: openAddGroupDialog,
  // openEditDialog 不需要了，因为编辑走右键菜单流程
});

// 处理网站保存
const onSiteSubmit = (data: any) => {
  if (siteDialog.value.isEdit && siteDialog.value.initialData) {
    // 编辑模式：需要传入 groupId 和 siteId
    store.updateSite(siteDialog.value.groupId, siteDialog.value.initialData.id, data);
  } else {
    // 新增模式
    store.addSite(siteDialog.value.groupId, data);
  }
};

// 处理分组保存
const onGroupSubmit = (data: any) => {
  if (groupDialog.value.isEdit && groupDialog.value.initialData) {
    // 编辑模式：传入 groupId
    store.updateGroup(groupDialog.value.initialData.id, data);
  } else {
    // 新增模式
    store.addGroup(data);
  }
};

onMounted(async () => {
  await store.loadConfig();
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
       @click="store.closeContextMenu()"
       @contextmenu="store.closeContextMenu()"
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
        @openGroupDialog="openAddGroupDialog"
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

    <SiteDialog
        :show="siteDialog.show"
        :isEdit="siteDialog.isEdit"
        :initialData="siteDialog.initialData"
        @close="siteDialog.show = false"
        @submit="onSiteSubmit"
    />

    <GroupDialog
        :show="groupDialog.show"
        :isEdit="groupDialog.isEdit"
        :initialData="groupDialog.initialData"
        @close="groupDialog.show = false"
        @submit="onGroupSubmit"
    />

    <ContextMenu @edit="handleGlobalEdit" />

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>