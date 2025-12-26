<script setup lang="ts">
import {ref, onMounted, provide, computed, defineAsyncComponent} from 'vue';
import {useTheme} from './composables/useTheme';
import {useConfigStore} from './stores/useConfigStore';
import {
  PhEye, PhEyeSlash, PhCards, PhSpinner, PhGear, PhSquaresFour,
  PhArrowsLeftRight, PhPencilSimple, PhCheck
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

// --- 首屏核心组件 ---
import CustomCursor from './components/ui/CustomCursor.vue';
import TimeWidget from './components/widgets/TimeWidget.vue';
import SearchBar from './components/widgets/SearchBar.vue';
import SideBar from './components/layout/SideBar.vue';
import MainGrid from './components/layout/MainGrid.vue';
import GreetingWidget from './components/widgets/GreetingWidget.vue';
import ContextMenu from './components/ui/ContextMenu.vue';

// --- 非首屏组件 ---
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
const isGlobalEditMode = ref(false);

interface DialogState {
  show: boolean;
  isEdit: boolean;
  groupId: string;
  initialData: any;
}

const siteDialog = ref<DialogState>({show: false, isEdit: false, groupId: '', initialData: null});
const groupDialog = ref<DialogState>({show: false, isEdit: false, groupId: '', initialData: null});

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

const toggleSidebarPos = () => {
  store.config.theme.sidebarPos = store.config.theme.sidebarPos === 'left' ? 'right' : 'left';
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

      <button @click="toggleSidebarPos"
              class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95 group"
              :title="store.config.theme.sidebarPos === 'left' ? '切换到右侧布局' : '切换到左侧布局'">
        <PhArrowsLeftRight size="20" weight="bold" class="group-hover:rotate-180 transition-transform duration-500"/>
      </button>

      <button @click="isGlobalEditMode = !isGlobalEditMode"
              class="p-3 rounded-full apple-glass transition-all shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center gap-1"
              :class="isGlobalEditMode ? 'bg-white text-black scale-110 ring-4 ring-black/10' : 'hover:bg-white/10 text-[var(--text-primary)]'"
              title="整理桌面">
        <component :is="isGlobalEditMode ? PhCheck : PhPencilSimple" size="20" weight="bold"/>
      </button>

      <button @click="showWidgetModal = true"
              class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--text-primary)] shadow-lg hover:scale-110 active:scale-95"
              title="小组件控制台">
        <PhCards size="20" weight="bold"/>
      </button>

      <button @click="isFocusMode = !isFocusMode"
              class="p-3 rounded-full apple-glass hover:bg-white/10 transition-all shadow-lg hover:scale-110 active:scale-95"
              :class="isFocusMode ? 'text-[var(--accent-color)] bg-white/5' : 'text-[var(--text-primary)]'"
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
        class="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden scroll-smooth custom-main-scroll transition-all duration-300"
        :class="[
          !isFocusMode && store.config.theme.sidebarPos === 'left' ? 'md:pl-28' : '',
          !isFocusMode && store.config.theme.sidebarPos === 'right' ? 'md:pr-28' : ''
        ]"
    >

      <transition name="fade">
        <div :class="isFocusMode ? 'scale-110 translate-y-[20vh]' : ''"
             class="transition-all duration-500 w-full flex flex-col items-center pt-16 md:pt-24 pb-4 shrink-0">
          <TimeWidget/>
          <div v-if="showGreeting && !isFocusMode" class="mt-4 mb-2">
            <GreetingWidget/>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div
            class="sticky top-0 z-20 w-full h-[120px] -mb-[120px] pointer-events-none soft-mist-layer"
            :class="isFocusMode ? 'translate-y-[20vh]' : ''"
        ></div>
      </transition>

      <transition name="fade">
        <div
            class="sticky top-0 z-30 w-full flex justify-center pt-6 pb-4 transition-all duration-300 pointer-events-none"
            :class="isFocusMode ? 'translate-y-[20vh]' : ''"
        >
          <div class="pointer-events-auto w-full flex justify-center px-4">
            <SearchBar @openSettings="showSettings = true"/>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="!isFocusMode"
             class="w-full px-4 md:px-12 pb-32 md:pb-20 pt-2 min-h-[500px]">
          <MainGrid :activeGroupId="activeGroupId" :isEditMode="isGlobalEditMode"/>
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

/* ✨✨✨ 单独定义的磨砂层样式 ✨✨✨ */
.soft-mist-layer {
  /* 背景极淡，只负责模糊 */
  background-color: rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);

  /* 遮罩：让这个模糊层在底部渐变消失 */
  /* 注意：这个 mask 只作用于模糊层自己，不会切掉上面的搜索框 */
  -webkit-mask-image: -webkit-linear-gradient(top, black 20%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 20%, transparent 100%);
}

:global(.dark) .soft-mist-layer {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>