<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue';
import { useTheme } from './composables/useTheme';
import MainGrid from './components/layout/MainGrid.vue';
import SiteDialog from './components/ui/SiteDialog.vue';
import GroupDialog from './components/ui/GroupDialog.vue';
import ContextMenu from './components/ui/ContextMenu.vue';
import {
  PhMagnifyingGlass, PhGear, PhPlus, PhMoon, PhSun, PhX,
  PhLayout, PhImage, PhMonitor, PhTrash, PhGlobe,
  PhSquaresFour, PhTextT, PhFrameCorners, PhClock, PhEye, PhEyeSlash, PhUploadSimple
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import { useConfigStore } from './stores/useConfigStore';
import { useNow, useDateFormat } from '@vueuse/core';

useTheme();
const store = useConfigStore();

// Time
const now = useNow();
const timeStr = useDateFormat(now, 'HH:mm');
const dateStr = useDateFormat(now, 'MM月DD日 dddd');

// State
const showSettings = ref(false);
const isFocusMode = ref(false);
const activeGroupId = ref('');
const searchText = ref('');
const showEngineMenu = ref(false);
const settingsTab = ref<'layout' | 'icon' | 'theme' | 'search'>('icon');

// Search
const handleSearch = () => {
  if (!searchText.value) return;
  const currentEngine = store.config.searchEngines.find(e => e.id === store.config.currentEngineId);
  if (currentEngine) {
    window.open(currentEngine.url + encodeURIComponent(searchText.value), '_blank');
    searchText.value = '';
  }
};
const currentEngineIcon = computed(() => {
  const engine = store.config.searchEngines.find(e => e.id === store.config.currentEngineId);
  return engine ? (PhIcons as any)['Ph' + engine.icon] || PhIcons.PhMagnifyingGlass : PhIcons.PhMagnifyingGlass;
});
const newEngineForm = ref({ name: '', url: '' });
const handleAddEngine = () => {
  if(newEngineForm.value.name && newEngineForm.value.url) {
    store.addEngine(newEngineForm.value.name, newEngineForm.value.url);
    newEngineForm.value = { name: '', url: '' };
  }
};

// Dialogs
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
  else store.addGroup(data.title);
};
const handleMenuAction = (action: 'edit' | 'delete') => {
  contextMenu.value.show = false;
  if (action === 'edit') groupDialog.value = { show: true, isEdit: true, groupId: contextMenu.value.targetId, initialData: contextMenu.value.data };
  else if (action === 'delete' && confirm('确定删除?')) store.removeGroup(contextMenu.value.targetId);
};
const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && file.size < 2*1024*1024) {
    const reader = new FileReader();
    reader.onload = (e) => { if(e.target?.result) store.config.theme.wallpaper = e.target.result as string; };
    reader.readAsDataURL(file);
  } else { alert("图片需小于 2MB"); }
};

onMounted(() => {
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;
  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
});

const toggleTheme = (mode: 'light' | 'dark') => {
  store.config.theme.mode = mode;
  document.documentElement.classList.toggle('light', mode === 'light');
};

const containerClass = computed(() => store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row');
</script>

<template>
  <div class="h-screen w-full relative overflow-hidden font-sans flex transition-all duration-500"
       :class="containerClass"
       @click="contextMenu.show = false; showEngineMenu = false"
       style="color: var(--text-primary);">

    <div class="fixed inset-0 z-[-1]">
      <div class="absolute inset-0 bg-cover bg-center transition-all duration-700" :style="{ backgroundImage: `var(--bg-image)` }"></div>
      <div class="absolute inset-0 transition-all duration-500" style="background: var(--bg-overlay); opacity: var(--bg-overlay-opacity, 1);"></div>
      <div class="absolute inset-0 backdrop-blur-[var(--glass-backdrop-blur)] transition-all duration-300"></div>
    </div>

    <button @click="isFocusMode = !isFocusMode" class="fixed top-6 right-6 z-50 p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--accent-color)] shadow-lg">
      <component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold" />
    </button>

    <transition name="slide-fade">
      <aside v-if="!isFocusMode" class="w-[90px] h-[96%] my-auto mx-4 rounded-[24px] apple-glass flex flex-col items-center py-6 z-20 transition-all duration-300 shadow-2xl flex-shrink-0">
        <div class="mb-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
          <PhMonitor weight="fill" size="24" />
        </div>
        <div class="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto no-scrollbar">
          <button v-for="group in store.config.layout" :key="group.id" @click="activeGroupId = group.id" @contextmenu.stop="(e) => { e.preventDefault(); contextMenu = { show: true, x: e.clientX, y: e.clientY, type: 'group', targetId: group.id, data: group }; }"
                  class="relative w-full aspect-square rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group/btn"
                  :class="activeGroupId === group.id ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)]' : 'hover:bg-[var(--sidebar-active)] opacity-60 hover:opacity-100'">
            <component :is="(PhIcons as any)['Ph' + group.icon]" size="26" weight="duotone" class="transition-transform group-hover/btn:scale-110"/>
            <span class="text-[10px] font-bold tracking-wide truncate max-w-full px-1">{{ group.title }}</span>
            <div v-if="activeGroupId === group.id" class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"></div>
          </button>
          <button @click="groupDialog = { show: true, isEdit: false, groupId: '', initialData: null }" class="w-full aspect-square rounded-2xl border-2 border-dashed border-current opacity-20 hover:opacity-60 flex items-center justify-center mt-2"><PhPlus size="24" /></button>
        </div>
        <button @click="showSettings = true" class="mt-4 p-3 rounded-xl hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100 transition-all"><PhGear :size="26" weight="duotone" /></button>
      </aside>
    </transition>

    <main class="flex-1 h-full relative overflow-hidden flex flex-col items-center">

      <div class="w-full flex flex-col items-center justify-center mt-[10vh] mb-8 transition-all duration-500 z-30"
           :class="isFocusMode ? 'scale-110 mt-[30vh]' : ''">

        <transition name="fade">
          <div v-if="store.config.theme.showTime && !isFocusMode" class="text-center select-none mb-8">
            <h1 class="text-6xl font-bold tracking-tight drop-shadow-md" style="font-feature-settings: 'tnum';">{{ timeStr }}</h1>
            <p class="text-sm font-medium opacity-70 mt-1 uppercase tracking-widest">{{ dateStr }}</p>
          </div>
        </transition>

        <div class="relative w-full max-w-[640px] px-4 group">
          <div class="flex items-center apple-glass rounded-full px-2 py-2 transition-all focus-within:ring-2 focus-within:ring-[var(--accent-color)] focus-within:ring-opacity-50 shadow-lg">
            <div class="relative">
              <button @click.stop="showEngineMenu = !showEngineMenu" class="p-3 rounded-full hover:bg-[var(--sidebar-active)] transition-colors text-[var(--accent-color)] flex items-center justify-center">
                <component :is="currentEngineIcon" size="24" weight="bold"/>
              </button>
              <transition name="scale">
                <div v-if="showEngineMenu" class="absolute top-14 left-0 w-48 apple-glass rounded-2xl p-2 shadow-xl flex flex-col gap-1 z-50">
                  <div v-for="eng in store.config.searchEngines" :key="eng.id" class="flex items-center justify-between p-2 rounded-xl hover:bg-[var(--sidebar-active)] cursor-pointer group/item" @click="store.config.currentEngineId = eng.id; showEngineMenu = false">
                    <div class="flex items-center gap-3"><component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"/><span class="text-sm font-bold">{{ eng.name }}</span></div>
                    <button v-if="store.config.searchEngines.length > 1" @click.stop="store.removeEngine(eng.id)" class="opacity-0 group-hover/item:opacity-100 hover:text-red-500 p-1"><PhTrash size="14"/></button>
                  </div>
                  <div class="h-[1px] bg-current opacity-10 my-1"></div>
                  <button @click="showSettings = true; settingsTab = 'search'; showEngineMenu = false" class="text-xs font-bold opacity-60 hover:opacity-100 text-center py-2">添加引擎...</button>
                </div>
              </transition>
            </div>
            <div class="h-6 w-[1px] bg-current opacity-20 mx-2"></div>
            <input v-model="searchText" @keydown.enter="handleSearch" type="text" placeholder="Search..." class="w-full bg-transparent text-xl outline-none placeholder-current/40 font-medium px-2" autofocus />
          </div>
        </div>
      </div>

      <transition name="fade">
        <div v-if="!isFocusMode" class="flex-1 w-full overflow-y-auto px-12 pb-20 scroll-smooth no-scrollbar">
          <MainGrid :activeGroupId="activeGroupId" />
        </div>
      </transition>
    </main>

    <transition name="scale">
      <div v-if="showSettings" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
        <div @click="showSettings = false" class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all"></div>

        <div class="relative w-full max-w-4xl h-[80vh] flex overflow-hidden rounded-3xl shadow-2xl border transition-all animate-scale-in"
             style="background-color: var(--modal-bg); border-color: var(--modal-border); backdrop-filter: blur(40px);">

          <div class="w-64 flex flex-col p-6 border-r" style="background-color: var(--modal-sidebar); border-color: var(--modal-border);">
            <div class="flex items-center gap-3 mb-8 px-2">
              <div class="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-white"><PhGear weight="fill" size="18"/></div>
              <span class="font-bold text-lg">设置中心</span>
            </div>
            <nav class="flex-1 space-y-1">
              <button @click="settingsTab = 'icon'" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left" :class="settingsTab === 'icon' ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"><PhSquaresFour size="18" weight="bold"/> 图标样式</button>
              <button @click="settingsTab = 'layout'" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left" :class="settingsTab === 'layout' ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"><PhFrameCorners size="18" weight="bold"/> 整体布局</button>
              <button @click="settingsTab = 'theme'" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left" :class="settingsTab === 'theme' ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"><PhImage size="18" weight="bold"/> 主题壁纸</button>
              <button @click="settingsTab = 'search'" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left" :class="settingsTab === 'search' ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"><PhGlobe size="18" weight="bold"/> 搜索引擎</button>
            </nav>
          </div>

          <div class="flex-1 flex flex-col h-full">
            <div class="flex justify-between items-center p-6 border-b" style="border-color: var(--modal-border);">
              <h2 class="text-xl font-bold">{{ settingsTab === 'icon' ? '图标个性化' : settingsTab === 'layout' ? '界面布局' : settingsTab === 'theme' ? '主题与壁纸' : '搜索管理' }}</h2>
              <button @click="showSettings = false" class="p-2 hover:bg-[var(--sidebar-active)] rounded-full transition-colors"><PhX size="20"/></button>
            </div>

            <div class="flex-1 overflow-y-auto p-8 space-y-8">
              <div v-if="settingsTab === 'icon'" class="space-y-8 animate-fade-in max-w-xl">
                <div class="space-y-6">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">图标大小</label><span class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span></div>
                  <input type="range" v-model="store.config.theme.iconSize" min="40" max="120" class="w-full">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">圆角程度</label><span class="text-xs opacity-60">{{ store.config.theme.radius }}px</span></div>
                  <input type="range" v-model="store.config.theme.radius" min="0" max="60" class="w-full">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">网格间距</label><span class="text-xs opacity-60">{{ store.config.theme.gap }}px</span></div>
                  <input type="range" v-model="store.config.theme.gap" min="10" max="80" class="w-full">
                </div>
                <hr class="border-[var(--modal-border)]">
                <div class="space-y-6">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-2"><PhTextT size="18"/> 显示名称</label><input type="checkbox" v-model="store.config.theme.showIconName" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                  <div class="opacity-50 transition-opacity" :class="{ 'opacity-100 pointer-events-auto': store.config.theme.showIconName }">
                    <div class="flex justify-between items-center mb-2"><label class="font-bold text-sm">文字大小</label><span class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span></div>
                    <input type="range" v-model="store.config.theme.iconTextSize" min="10" max="20" class="w-full">
                  </div>
                </div>
              </div>

              <div v-if="settingsTab === 'layout'" class="space-y-8 animate-fade-in max-w-xl">
                <div class="space-y-6">
                  <div class="flex justify-between items-center">
                    <label class="font-bold text-sm">侧边栏位置</label>
                    <div class="flex bg-[var(--sidebar-active)] p-1 rounded-lg">
                      <button @click="store.config.theme.sidebarPos = 'left'" class="px-3 py-1 rounded-md text-xs font-bold transition-all" :class="store.config.theme.sidebarPos === 'left' ? 'bg-[var(--page-bg)] shadow' : 'opacity-50'">左侧</button>
                      <button @click="store.config.theme.sidebarPos = 'right'" class="px-3 py-1 rounded-md text-xs font-bold transition-all" :class="store.config.theme.sidebarPos === 'right' ? 'bg-[var(--page-bg)] shadow' : 'opacity-50'">右侧</button>
                    </div>
                  </div>
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-2"><PhClock size="18"/> 顶部时间组件</label><input type="checkbox" v-model="store.config.theme.showTime" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">内容区最大宽度</label><span class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span></div>
                  <input type="range" v-model="store.config.theme.gridMaxWidth" min="800" max="2000" class="w-full">
                </div>
              </div>

              <div v-if="settingsTab === 'theme'" class="space-y-8 animate-fade-in max-w-xl">
                <div class="grid grid-cols-2 gap-4">
                  <button @click="toggleTheme('light')" class="flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02]" :class="store.config.theme.mode === 'light' ? 'border-[var(--accent-color)] bg-white/50 text-[var(--accent-color)]' : 'border-transparent bg-[var(--sidebar-active)]'"><PhSun weight="fill" size="32"/> <span class="font-bold">浅色模式</span></button>
                  <button @click="toggleTheme('dark')" class="flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02]" :class="store.config.theme.mode === 'dark' ? 'border-[var(--accent-color)] bg-white/10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--sidebar-active)]'"><PhMoon weight="fill" size="32"/> <span class="font-bold">深色模式</span></button>
                </div>
                <div class="space-y-4 p-5 rounded-2xl bg-[var(--sidebar-active)] border border-[var(--glass-border)]">
                  <h3 class="font-bold text-sm">壁纸设置</h3>
                  <div class="flex gap-2"><input type="text" v-model="store.config.theme.wallpaper" placeholder="图片 URL..." class="flex-1 bg-transparent border-b border-current/20 py-2 text-sm outline-none"><label class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90"><PhUploadSimple class="mr-2"/> 上传<input type="file" accept="image/*" class="hidden" @change="handleFileUpload"></label></div>
                </div>
                <div class="space-y-4">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">磨砂模糊度</label><span class="text-xs opacity-60">{{ store.config.theme.blur }}px</span></div>
                  <input type="range" v-model="store.config.theme.blur" min="0" max="50" class="w-full">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm">背景遮罩浓度</label><span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span></div>
                  <input type="range" v-model="store.config.theme.opacity" min="0" max="1" step="0.05" class="w-full">
                </div>
              </div>

              <div v-if="settingsTab === 'search'" class="space-y-6 animate-fade-in max-w-xl">
                <div class="bg-[var(--sidebar-active)] p-5 rounded-2xl border border-[var(--glass-border)] space-y-4">
                  <h3 class="font-bold text-sm">添加新引擎</h3>
                  <div class="flex gap-2">
                    <input v-model="newEngineForm.name" type="text" placeholder="名称 (如 Baidu)" class="w-1/3 bg-[var(--page-bg)] px-3 py-2 rounded-lg text-sm outline-none border border-transparent focus:border-[var(--accent-color)]">
                    <input v-model="newEngineForm.url" type="text" placeholder="URL (含查询参数)" class="flex-1 bg-[var(--page-bg)] px-3 py-2 rounded-lg text-sm outline-none border border-transparent focus:border-[var(--accent-color)]">
                  </div>
                  <button @click="handleAddEngine" class="w-full py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold hover:opacity-90">添加</button>
                </div>
                <div class="space-y-2">
                  <h3 class="font-bold text-sm opacity-60 mb-2">已添加列表</h3>
                  <div v-for="eng in store.config.searchEngines" :key="eng.id" class="flex items-center justify-between p-3 rounded-xl bg-[var(--sidebar-active)] border border-[var(--glass-border)]">
                    <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"/></div><div class="flex flex-col"><span class="text-sm font-bold">{{ eng.name }}</span><span class="text-[10px] opacity-50 truncate max-w-[200px]">{{ eng.url }}</span></div></div>
                    <button v-if="store.config.searchEngines.length > 1" @click="store.removeEngine(eng.id)" class="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"><PhTrash size="16"/></button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </transition>

    <SiteDialog :show="siteDialog.show" :isEdit="siteDialog.isEdit" :initialData="siteDialog.initialData" @close="siteDialog.show = false" @submit="onSiteSubmit" />
    <GroupDialog :show="groupDialog.show" :isEdit="groupDialog.isEdit" :initialData="groupDialog.initialData" @close="groupDialog.show = false" @submit="onGroupSubmit" />
    <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" @close="contextMenu.show = false" @edit="handleMenuAction('edit')" @delete="handleMenuAction('delete')" />

  </div>
</template>

<style scoped>
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateX(-20px); opacity: 0; }
.scale-enter-active, .scale-leave-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
</style>