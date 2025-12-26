<script setup lang="ts">
import {ref, onMounted, provide, computed, defineAsyncComponent} from 'vue'; // ✨ 引入 defineAsyncComponent
import {useTheme} from './composables/useTheme';
import {useConfigStore} from './stores/useConfigStore';
import {PhEye, PhEyeSlash, PhCards, PhSpinner, PhGear, PhSquaresFour} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

// --- 首屏核心组件 (保持同步引入，保证立刻显示) ---
import CustomCursor from './components/ui/CustomCursor.vue';
import TimeWidget from './components/widgets/TimeWidget.vue';
import SearchBar from './components/widgets/SearchBar.vue';
import SideBar from './components/layout/SideBar.vue';
import MainGrid from './components/layout/MainGrid.vue';
import GreetingWidget from './components/widgets/GreetingWidget.vue';
import ContextMenu from './components/ui/ContextMenu.vue'; // 右键菜单体积小，保持同步

// --- ✨ 优化：非首屏组件改为异步引入 (大幅减小 index.js 体积) ---
// 只有当用户点击按钮时，浏览器才会去下载这些组件的代码
const SettingsModal = defineAsyncComponent(() => import('./components/settings/SettingsModal.vue'));
const WidgetPanel = defineAsyncComponent(() => import('./components/layout/WidgetPanel.vue'));
const SiteDialog = defineAsyncComponent(() => import('./components/ui/SiteDialog.vue'));
const GroupDialog = defineAsyncComponent(() => import('./components/ui/GroupDialog.vue'));

useTheme();
const store = useConfigStore();

const showSettings = ref(false);
const showWidgetModal = ref(false);
const isFocusMode = ref(false);
const activeGroupId = ref('');

// 弹窗状态管理
interface DialogState {
  show: boolean;
  isEdit: boolean;
  groupId: string;
  initialData: any;
}

const siteDialog = ref<DialogState>({show: false, isEdit: false, groupId: '', initialData: null});
const groupDialog = ref<DialogState>({show: false, isEdit: false, groupId: '', initialData: null});

// 处理全局右键菜单的“编辑”事件
const handleGlobalEdit = () => {
  const {type, item, groupId} = store.contextMenu;
  if (type === 'site') {
    siteDialog.value = {show: true, isEdit: true, groupId: groupId, initialData: {...item}};
  } else if (type === 'group') {
    groupDialog.value = {show: true, isEdit: true, groupId: '', initialData: {...item}};
  }
};

const openAddSiteDialog = (gid: string) => {
  siteDialog.value = {show: true, isEdit: false, groupId: gid, initialData: null};
};
const openAddGroupDialog = () => {
  groupDialog.value = {show: true, isEdit: false, groupId: '', initialData: null};
};

provide('dialog', {
  openAddDialog: openAddSiteDialog,
  openGroupDialog: openAddGroupDialog,
});

const onSiteSubmit = (data: any) => {
  if (siteDialog.value.isEdit && siteDialog.value.initialData) store.updateSite(siteDialog.value.groupId, siteDialog.value.initialData.id, data);
  else store.addSite(siteDialog.value.groupId, data);
};

const onGroupSubmit = (data: any) => {
  if (groupDialog.value.isEdit && groupDialog.value.initialData) store.updateGroup(groupDialog.value.initialData.id, data);
  else store.addGroup(data);
};

const isVideo = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.startsWith('data:video/');
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

  <div v-else class="h-screen w-full relative overflow-hidden font-sans flex flex-col transition-all duration-500"
       :class="[store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row', { 'cursor-hidden': store.config.theme.customCursor }]"
       @click="store.closeContextMenu()"
       @contextmenu="store.closeContextMenu()"
       style="color: var(--text-primary);">

    <CustomCursor/>

    <div class="fixed inset-0 z-[-1] bg-[#050505] dark:bg-[#050505] transition-colors">

      <transition name="fade">
        <video
            v-if="isVideo(store.config.theme.wallpaper)"
            autoplay loop muted playsinline
            class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
            :style="{
              filter: `blur(${store.config.theme.blur}px) brightness(${1 - store.config.theme.opacity * 0.5})`
            }"
        >
          <source :src="store.config.theme.wallpaper" type="video/mp4">
        </video>
      </transition>

      <transition name="fade">
        <img
            v-if="!isVideo(store.config.theme.wallpaper) && store.config.theme.wallpaper"
            :src="store.config.theme.wallpaper"
            class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
            :style="{
               filter: `blur(${store.config.theme.blur}px) brightness(${1 - store.config.theme.opacity * 0.5})`
            }"
            loading="eager"
            alt="wallpaper"
        />
      </transition>

      <div class="absolute inset-0 transition-all duration-500"
           :style="{ background: 'var(--bg-overlay)', opacity: store.config.theme.opacity }"></div>
      <div class="absolute inset-0 backdrop-blur-[var(--glass-backdrop-blur)] transition-all duration-300"></div>
    </div>

    <div class="fixed top-6 z-50 flex items-center gap-3 transition-all duration-500"
         :class="store.config.theme.sidebarPos === 'right' ? 'left-6' : 'right-6'">
      <button @click="showWidgetModal = true"
              class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95"
              title="控制台">
        <PhCards size="20" weight="bold"/>
      </button>
      <button @click="isFocusMode = !isFocusMode"
              class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--accent-color)] shadow-lg hover:scale-110 active:scale-95"
              title="专注模式">
        <component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold"/>
      </button>
    </div>

    <SideBar
        class="hidden md:flex"
        :activeGroupId="activeGroupId"
        :isFocusMode="isFocusMode"
        @update:activeGroupId="id => activeGroupId = id"
        @openSettings="showSettings = true"
        @openGroupDialog="openAddGroupDialog"
    />

    <main
        class="flex-1 w-full flex flex-col items-center relative overflow-hidden pt-16 md:pt-20 justify-start transition-all duration-300"
        :class="[
          !isFocusMode && store.config.theme.sidebarPos === 'left' ? 'md:pl-28' : '',
          !isFocusMode && store.config.theme.sidebarPos === 'right' ? 'md:pr-28' : ''
        ]"
    >
      <transition name="fade">
        <div :class="isFocusMode ? 'scale-110 translate-y-[20vh]' : ''"
             class="transition-all duration-500 w-full flex flex-col items-center z-30 shrink-0">
          <TimeWidget/>
          <div v-if="showGreeting && !isFocusMode" class="mt-4 mb-8">
            <GreetingWidget/>
          </div>
          <SearchBar @openSettings="showSettings = true"/>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="!isFocusMode"
             class="flex-1 w-full overflow-y-auto px-4 md:px-12 pb-32 md:pb-20 pt-2 scroll-smooth no-scrollbar z-20">
          <MainGrid :activeGroupId="activeGroupId"/>
        </div>
      </transition>
    </main>

    <div v-if="!isFocusMode"
         class="fixed bottom-0 left-0 right-0 z-40 md:hidden flex items-center justify-between px-4 py-3 border-t border-white/10 transition-transform duration-300"
         style="background: var(--modal-bg); backdrop-filter: blur(20px);">

      <div class="flex-1 flex items-center gap-3 overflow-x-auto no-scrollbar pr-4">
        <button
            v-for="group in store.config.layout"
            :key="group.id"
            @click="activeGroupId = group.id"
            class="flex flex-col items-center justify-center p-2 rounded-xl transition-all min-w-[3.5rem]"
            :class="activeGroupId === group.id ? 'bg-[var(--accent-color)] text-white shadow-lg' : 'text-[var(--text-primary)] opacity-50'"
        >
          <component :is="(PhIcons as any)['Ph' + group.icon] || PhSquaresFour" size="20" weight="bold"/>
          <span class="text-[10px] font-bold mt-1 truncate max-w-[4em]">{{ group.title }}</span>
        </button>
      </div>

      <div class="pl-3 border-l border-current/10 ml-1">
        <button @click="showSettings = true"
                class="p-2.5 rounded-full bg-black/5 dark:bg-white/10 text-[var(--text-primary)] active:scale-95 transition-transform">
          <PhGear size="20" weight="fill"/>
        </button>
      </div>
    </div>

    <SettingsModal :show="showSettings" @close="showSettings = false"/>
    <WidgetPanel :isOpen="showWidgetModal" @close="showWidgetModal = false"/>
    <SiteDialog :show="siteDialog.show" :isEdit="siteDialog.isEdit" :initialData="siteDialog.initialData"
                @close="siteDialog.show = false" @submit="onSiteSubmit"/>
    <GroupDialog :show="groupDialog.show" :isEdit="groupDialog.isEdit" :initialData="groupDialog.initialData"
                 @close="groupDialog.show = false" @submit="onGroupSubmit"/>
    <ContextMenu @edit="handleGlobalEdit"/>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>