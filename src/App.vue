<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed } from 'vue'; // ✅ 1. 修复报错
import { useTheme } from './composables/useTheme';
import MainGrid from './components/layout/MainGrid.vue';
import SiteDialog from './components/ui/SiteDialog.vue';
import GroupDialog from './components/ui/GroupDialog.vue';
import ContextMenu from './components/ui/ContextMenu.vue';
import WidgetPanel from './components/layout/WidgetPanel.vue';
import {
  PhMagnifyingGlass, PhGear, PhPlus, PhMoon, PhSun, PhX,
  PhLayout, PhImage, PhMonitor, PhTrash, PhGlobe,
  PhSquaresFour, PhTextT, PhFrameCorners, PhClock, PhEye, PhEyeSlash, PhUploadSimple,
  PhMagicWand, PhCursorClick, PhLightning, PhDatabase, PhDownloadSimple, PhFileArrowUp,
  PhList, PhHouse
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import { useConfigStore } from './stores/useConfigStore';
import { useNow, useDateFormat, useMouse } from '@vueuse/core';

useTheme();
const store = useConfigStore();

// Time & State
const now = useNow();
const timeStr = useDateFormat(now, 'HH:mm');
const dateStr = useDateFormat(now, 'MM月DD日 dddd');
const { x, y } = useMouse();
const isHovering = ref(false);
const showSettings = ref(false);
const isFocusMode = ref(false);
const activeGroupId = ref('');
const searchText = ref('');
const showEngineMenu = ref(false);
const settingsTab = ref<'icon' | 'layout' | 'theme' | 'search' | 'effects' | 'data'>('icon');

// Cursor Logic
const cursorOuter = ref<HTMLElement | null>(null);
const cursorInner = ref<HTMLElement | null>(null);

const updateCursor = (e: MouseEvent) => {
  if (!store.config.theme.customCursor) return;
  // 仅在桌面端启用高性能光标
  if (window.matchMedia('(pointer: fine)').matches) {
    const x = e.clientX;
    const y = e.clientY;
    if (cursorOuter.value) cursorOuter.value.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    if (cursorInner.value) cursorInner.value.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }
};

const checkHover = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('button, a, .cursor-pointer, input, select, [role="button"]')) {
    isHovering.value = true;
  } else {
    isHovering.value = false;
  }
};

// Search Logic
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
  if (newEngineForm.value.name && newEngineForm.value.url) {
    store.addEngine(newEngineForm.value.name, newEngineForm.value.url);
    newEngineForm.value = { name: '', url: '' };
  }
};

// Data Export/Import
const fileInput = ref<HTMLInputElement | null>(null);
const handleExport = () => {
  const dataStr = JSON.stringify(store.config.layout, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voidtab-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
const triggerImport = () => { fileInput.value?.click(); };
const handleImport = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const parsedData = JSON.parse(content);
      if (Array.isArray(parsedData) && parsedData.length > 0 && parsedData[0].items) {
        if (confirm(`检测到 ${parsedData.length} 个分类分组。\n确定要覆盖当前的所有书签吗？`)) {
          store.config.layout = parsedData;
          activeGroupId.value = parsedData[0].id;
          alert('导入成功！');
        }
      } else { alert('导入失败：文件格式不正确'); }
    } catch (err) { console.error(err); alert('导入失败：文件解析错误'); }
    if (fileInput.value) fileInput.value.value = '';
  };
  reader.readAsText(file);
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
  if (siteDialog.value.isEdit && siteDialog.value.initialData) { store.updateSite(siteDialog.value.groupId, siteDialog.value.initialData.id, data); }
  else { store.addSite(siteDialog.value.groupId, data); }
};
const onGroupSubmit = (data: any) => {
  if (groupDialog.value.isEdit) { store.updateGroup(groupDialog.value.groupId, data); }
  else { store.addGroup(data); }
};
const handleMenuAction = (action: 'edit' | 'delete') => {
  contextMenu.value.show = false;
  if (action === 'edit') { groupDialog.value = { show: true, isEdit: true, groupId: contextMenu.value.targetId, initialData: contextMenu.value.data }; }
  else if (action === 'delete') { store.removeGroup(contextMenu.value.targetId); }
};
const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && file.size < 5 * 1024 * 1024) { const reader = new FileReader(); reader.onload = (e) => { if (e.target?.result) store.config.theme.wallpaper = e.target.result as string; }; reader.readAsDataURL(file); } else { alert("图片需小于 5MB"); }
};

onMounted(() => {
  if (store.config.layout.length > 0) activeGroupId.value = store.config.layout[0].id;
  document.documentElement.classList.toggle('light', store.config.theme.mode === 'light');
  window.addEventListener('mousemove', updateCursor, { passive: true });
  document.body.addEventListener('mouseover', checkHover);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', updateCursor);
  document.body.removeEventListener('mouseover', checkHover);
});

const toggleTheme = (mode: 'light' | 'dark') => { store.config.theme.mode = mode; document.documentElement.classList.toggle('light', mode === 'light'); };
const containerClass = computed(() => store.config.theme.sidebarPos === 'right' ? 'flex-row-reverse' : 'flex-row');
</script>

<template>
  <div class="h-screen w-full relative overflow-hidden font-sans flex transition-all duration-500"
       :class="[containerClass, { 'cursor-hidden': store.config.theme.customCursor }]"
       @click="contextMenu.show = false; showEngineMenu = false"
       style="color: var(--text-primary);">

    <div v-if="store.config.theme.customCursor" ref="cursorOuter" class="hidden md:block fixed pointer-events-none z-[9999] rounded-full mix-blend-difference bg-white transition-opacity duration-200 ease-out will-change-transform top-0 left-0" :class="isHovering ? 'w-8 h-8 opacity-50' : 'w-4 h-4 opacity-80'"></div>
    <div v-if="store.config.theme.customCursor" ref="cursorInner" class="hidden md:block fixed pointer-events-none z-[9999] w-1 h-1 rounded-full bg-[var(--accent-color)] transition-none will-change-transform top-0 left-0"></div>

    <div class="fixed inset-0 z-[-1]">
      <div class="absolute inset-0 bg-cover bg-center transition-all duration-700" :style="{ backgroundImage: `var(--bg-image)` }"></div>
      <div class="absolute inset-0 transition-all duration-500" style="background: var(--bg-overlay); opacity: var(--bg-overlay-opacity, 1);"></div>
      <div class="absolute inset-0 backdrop-blur-[var(--glass-backdrop-blur)] transition-all duration-300"></div>
    </div>

    <button @click="isFocusMode = !isFocusMode" class="fixed top-4 right-4 md:top-6 md:right-6 z-50 p-2 md:p-3 rounded-full apple-glass hover:bg-white/10 transition-all text-[var(--accent-color)] shadow-lg">
      <component :is="isFocusMode ? PhEyeSlash : PhEye" size="20" weight="bold" />
    </button>

    <transition name="slide-fade">
      <aside v-if="!isFocusMode" class="hidden md:flex w-[90px] h-[96%] my-auto mx-4 rounded-[24px] apple-glass flex-col items-center py-6 z-20 transition-all duration-300 shadow-2xl flex-shrink-0">
        <div class="mb-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"><PhMonitor weight="fill" size="24" /></div>
        <div class="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto no-scrollbar">
          <button v-for="group in store.config.layout" :key="group.id" @click="activeGroupId = group.id" @contextmenu.stop="(e) => { e.preventDefault(); contextMenu = { show: true, x: e.clientX, y: e.clientY, type: 'group', targetId: group.id, data: group }; }" class="relative w-full aspect-square rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group/btn border-2 border-transparent" :class="[activeGroupId === group.id ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)]' : 'hover:bg-[var(--sidebar-active)] opacity-60 hover:opacity-100', { 'effect-breathe': store.config.theme.breathingLight && activeGroupId === group.id }]">
            <component :is="(PhIcons as any)['Ph' + group.icon]" size="26" weight="duotone" class="transition-transform group-hover/btn:scale-110"/><span class="text-[10px] font-bold tracking-wide truncate max-w-full px-1">{{ group.title }}</span><div v-if="activeGroupId === group.id" class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"></div>
          </button>
          <button @click="groupDialog = { show: true, isEdit: false, groupId: '', initialData: null }" class="w-full aspect-square rounded-2xl border-2 border-dashed border-current opacity-20 hover:opacity-60 flex items-center justify-center mt-2"><PhPlus size="24" /></button>
        </div>
        <button @click="showSettings = true" class="mt-4 p-3 rounded-xl hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100 transition-all"><PhGear :size="26" weight="duotone" /></button>
      </aside>
    </transition>

    <transition name="slide-up">
      <nav v-if="!isFocusMode" class="md:hidden fixed bottom-0 left-0 w-full h-20 apple-glass z-40 flex items-center justify-between px-2 pb-safe border-t border-[var(--glass-border)] shadow-[0_-10px_20px_rgba(0,0,0,0.1)]">
        <div class="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar px-2 h-full">
          <button v-for="group in store.config.layout" :key="group.id" @click="activeGroupId = group.id"
                  class="flex flex-col items-center justify-center gap-1 min-w-[60px] h-[50px] rounded-xl transition-all"
                  :class="activeGroupId === group.id ? 'text-[var(--accent-color)]' : 'opacity-60 grayscale'">
            <component :is="(PhIcons as any)['Ph' + group.icon]" size="24" weight="duotone" :class="activeGroupId === group.id ? 'scale-110' : ''" class="transition-transform"/>
            <span class="text-[10px] font-bold truncate max-w-full">{{ group.title }}</span>
          </button>
          <button @click="groupDialog = { show: true, isEdit: false, groupId: '', initialData: null }" class="flex flex-col items-center justify-center min-w-[50px] h-[50px] rounded-xl opacity-40"><PhPlus size="24" /></button>
        </div>
        <div class="w-[1px] h-8 bg-current opacity-10 mx-1"></div>
        <button @click="showSettings = true" class="p-3 text-[var(--text-primary)] hover:text-[var(--accent-color)]"><PhGear size="26" weight="duotone"/></button>
      </nav>
    </transition>

    <main class="flex-1 h-full relative overflow-hidden flex flex-col items-center">
      <div class="w-full flex flex-col items-center justify-center mt-[12vh] md:mt-[10vh] mb-4 transition-all duration-500 z-30" :class="isFocusMode ? 'scale-110 mt-[30vh]' : ''">
        <transition name="fade">
          <div v-if="store.config.theme.showTime && !isFocusMode" class="text-center select-none mb-6 md:mb-8">
            <h1 class="text-6xl md:text-7xl font-bold tracking-tight drop-shadow-md" :class="{ 'font-tech': store.config.theme.techFont }" style="font-feature-settings: 'tnum';">{{ timeStr }}</h1>
            <p class="text-xs md:text-sm font-medium opacity-70 mt-1 uppercase tracking-widest">{{ dateStr }}</p>
          </div>
        </transition>

        <div class="relative w-[90%] md:w-full md:max-w-[640px] px-0 md:px-4 group">
          <div class="flex items-center apple-glass rounded-full px-2 py-2 transition-all border border-transparent" :class="{ 'effect-neon': store.config.theme.neonGlow }">
            <div class="relative">
              <button @click.stop="showEngineMenu = !showEngineMenu" class="p-2 md:p-3 rounded-full hover:bg-[var(--sidebar-active)] transition-colors text-[var(--accent-color)] flex items-center justify-center">
                <component :is="currentEngineIcon" size="20" md:size="24" weight="bold"/>
              </button>
              <transition name="scale">
                <div v-if="showEngineMenu" class="absolute top-14 left-0 w-48 apple-glass rounded-2xl p-2 shadow-xl flex flex-col gap-1 z-50">
                  <div v-for="eng in store.config.searchEngines" :key="eng.id" class="flex items-center justify-between p-2 rounded-xl hover:bg-[var(--sidebar-active)] cursor-pointer group/item" @click="store.config.currentEngineId = eng.id; showEngineMenu = false">
                    <div class="flex items-center gap-3"><component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"/><span class="text-sm font-bold">{{ eng.name }}</span></div><button v-if="store.config.searchEngines.length > 1" @click.stop="store.removeEngine(eng.id)" class="opacity-0 group-hover/item:opacity-100 hover:text-red-500 p-1"><PhTrash size="14"/></button>
                  </div><div class="h-[1px] bg-current opacity-10 my-1"></div><button @click="showSettings = true; settingsTab = 'search'; showEngineMenu = false" class="text-xs font-bold opacity-60 hover:opacity-100 text-center py-2">添加引擎...</button>
                </div>
              </transition>
            </div>
            <div class="h-6 w-[1px] bg-current opacity-20 mx-2"></div>
            <input v-model="searchText" @keydown.enter="handleSearch" type="text" placeholder="Search..." class="w-full bg-transparent text-lg md:text-xl outline-none placeholder-current/40 font-medium px-2" autofocus />
          </div>
        </div>
      </div>

      <transition name="fade">
        <div v-if="!isFocusMode" class="flex-1 w-full overflow-y-auto px-4 md:px-12 pb-32 md:pb-20 pt-4 md:pt-8 scroll-smooth no-scrollbar">
          <MainGrid :activeGroupId="activeGroupId" />
        </div>
      </transition>
    </main>

    <transition name="scale">
      <div v-if="showSettings" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
        <div @click="showSettings = false" class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all"></div>
        <div class="relative w-full max-w-4xl h-[85vh] md:h-[80vh] flex flex-col md:flex-row overflow-hidden rounded-3xl shadow-2xl border transition-all animate-scale-in"
             style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border); backdrop-filter: blur(40px);">

          <div class="w-full md:w-64 flex flex-row md:flex-col p-4 md:p-6 border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-visible gap-2 no-scrollbar" style="background-color: var(--modal-sidebar); border-color: var(--modal-border);">
            <div class="hidden md:flex items-center gap-3 mb-8 px-2">
              <div class="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-white"><PhGear weight="fill" size="18"/></div>
              <span class="font-bold text-lg">设置</span>
            </div>
            <button v-for="tab in ['icon', 'layout', 'theme', 'effects', 'data', 'search']" :key="tab"
                    @click="settingsTab = tab as any"
                    class="flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap"
                    :class="settingsTab === tab ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'">
              <component :is="tab === 'icon' ? PhSquaresFour : tab === 'layout' ? PhFrameCorners : tab === 'theme' ? PhImage : tab === 'effects' ? PhMagicWand : tab === 'data' ? PhDatabase : PhGlobe" size="18" weight="bold"/>
              <span class="capitalize">{{ tab === 'icon' ? '图标' : tab === 'layout' ? '布局' : tab === 'theme' ? '主题' : tab === 'effects' ? '特效' : tab === 'data' ? '数据' : '搜索' }}</span>
            </button>
          </div>

          <div class="flex-1 flex flex-col h-full overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b" style="border-color: var(--modal-border);">
              <h2 class="text-lg md:text-xl font-bold">控制台</h2>
              <button @click="showSettings = false" class="p-2 hover:bg-[var(--sidebar-active)] rounded-full transition-colors"><PhX size="20"/></button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              <div v-if="settingsTab === 'icon'" class="space-y-6 animate-fade-in">
                <div class="flex justify-between items-center"><label class="font-bold text-sm">图标大小</label><span class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span></div><input type="range" v-model="store.config.theme.iconSize" min="40" max="120" class="w-full">
                <div class="flex justify-between items-center"><label class="font-bold text-sm">圆角程度</label><span class="text-xs opacity-60">{{ store.config.theme.radius }}px</span></div><input type="range" v-model="store.config.theme.radius" min="0" max="60" class="w-full">
                <div class="flex justify-between items-center"><label class="font-bold text-sm">网格间距</label><span class="text-xs opacity-60">{{ store.config.theme.gap }}px</span></div><input type="range" v-model="store.config.theme.gap" min="10" max="80" class="w-full">
                <hr class="border-[var(--modal-border)] opacity-50">
                <div class="flex justify-between items-center"><label class="font-bold text-sm">显示名称</label><input type="checkbox" v-model="store.config.theme.showIconName" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                <div v-if="store.config.theme.showIconName"><div class="flex justify-between items-center mb-2"><label class="font-bold text-sm">文字大小</label><span class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span></div><input type="range" v-model="store.config.theme.iconTextSize" min="10" max="20" class="w-full"></div>
              </div>

              <div v-if="settingsTab === 'layout'" class="space-y-6 animate-fade-in">
                <div class="flex justify-between items-center"><label class="font-bold text-sm">侧边栏位置 (桌面)</label><div class="flex rounded-lg p-1" style="background-color: var(--modal-input-bg)"><button @click="store.config.theme.sidebarPos = 'left'" class="px-3 py-1 rounded-md text-xs font-bold" :class="store.config.theme.sidebarPos === 'left' ? 'bg-[var(--accent-color)] text-white' : 'opacity-50'">左侧</button><button @click="store.config.theme.sidebarPos = 'right'" class="px-3 py-1 rounded-md text-xs font-bold" :class="store.config.theme.sidebarPos === 'right' ? 'bg-[var(--accent-color)] text-white' : 'opacity-50'">右侧</button></div></div>
                <div class="flex justify-between items-center"><label class="font-bold text-sm">时间组件</label><input type="checkbox" v-model="store.config.theme.showTime" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                <div class="flex justify-between items-center"><label class="font-bold text-sm">最大宽度</label><span class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span></div><input type="range" v-model="store.config.theme.gridMaxWidth" min="800" max="2000" class="w-full">
              </div>

              <div v-if="settingsTab === 'theme'" class="space-y-6 animate-fade-in">
                <div class="grid grid-cols-2 gap-4"><button @click="toggleTheme('light')" class="py-4 rounded-xl border-2 transition-all" :class="store.config.theme.mode === 'light' ? 'border-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)]'"><PhSun weight="fill" size="24"/><span class="block text-xs font-bold mt-2">浅色</span></button><button @click="toggleTheme('dark')" class="py-4 rounded-xl border-2 transition-all" :class="store.config.theme.mode === 'dark' ? 'border-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)]'"><PhMoon weight="fill" size="24"/><span class="block text-xs font-bold mt-2">深色</span></button></div>
                <div class="p-4 rounded-xl border border-[var(--glass-border)]" style="background-color: var(--modal-input-bg)"><h3 class="font-bold text-sm mb-2">壁纸 URL</h3><input type="text" v-model="store.config.theme.wallpaper" class="w-full bg-transparent border-b border-current/20 py-2 text-sm outline-none"></div>
                <div class="space-y-4"><div class="flex justify-between items-center"><label class="font-bold text-sm">磨砂模糊度</label><span class="text-xs opacity-60">{{ store.config.theme.blur }}px</span></div><input type="range" v-model="store.config.theme.blur" min="0" max="50" class="w-full"><div class="flex justify-between items-center"><label class="font-bold text-sm">背景遮罩浓度</label><span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span></div><input type="range" v-model="store.config.theme.opacity" min="0" max="1" step="0.05" class="w-full"></div>
              </div>

              <div v-if="settingsTab === 'effects'" class="space-y-6 animate-fade-in">
                <div class="p-5 rounded-2xl border border-[var(--glass-border)] space-y-6" style="background-color: var(--modal-input-bg)">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-3"><PhTextT size="20"/> 科技感数字字体</label><input type="checkbox" v-model="store.config.theme.techFont" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                  <hr class="border-[var(--glass-border)] opacity-50">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-3"><PhLightning size="20"/> 侧边栏呼吸灯</label><input type="checkbox" v-model="store.config.theme.breathingLight" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                  <hr class="border-[var(--glass-border)] opacity-50">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-3"><PhFrameCorners size="20"/> 霓虹边框发光</label><input type="checkbox" v-model="store.config.theme.neonGlow" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                  <hr class="border-[var(--glass-border)] opacity-50">
                  <div class="flex justify-between items-center"><label class="font-bold text-sm flex items-center gap-3"><PhCursorClick size="20"/> 科技感光标 (仅桌面)</label><input type="checkbox" v-model="store.config.theme.customCursor" class="w-5 h-5 accent-[var(--accent-color)]"></div>
                </div>
              </div>

              <div v-if="settingsTab === 'data'" class="space-y-6 animate-fade-in">
                <div class="p-5 rounded-2xl border border-[var(--glass-border)] space-y-4" style="background-color: var(--modal-input-bg)">
                  <div class="flex justify-between items-center"><div><h3 class="font-bold text-sm">导出备份</h3><p class="text-xs opacity-60">保存配置</p></div><button @click="handleExport" class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold">导出</button></div>
                </div>
                <div class="p-5 rounded-2xl border border-[var(--glass-border)] space-y-4" style="background-color: var(--modal-input-bg)">
                  <div class="flex justify-between items-center"><div><h3 class="font-bold text-sm">导入备份</h3><p class="text-xs opacity-60">恢复配置</p></div><button @click="triggerImport" class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold"><input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport">导入</button></div>
                </div>
              </div>

              <div v-if="settingsTab === 'search'" class="space-y-6 animate-fade-in">
                <div class="p-5 rounded-2xl border border-[var(--glass-border)] space-y-4" style="background-color: var(--modal-input-bg)">
                  <h3 class="font-bold text-sm">添加新引擎</h3>
                  <div class="flex gap-2"><input v-model="newEngineForm.name" type="text" placeholder="名称" class="w-1/3 bg-transparent border-b border-current/20 px-3 py-2 text-sm outline-none"><input v-model="newEngineForm.url" type="text" placeholder="URL" class="flex-1 bg-transparent border-b border-current/20 px-3 py-2 text-sm outline-none"></div>
                  <button @click="handleAddEngine" class="w-full py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold hover:opacity-90">添加</button>
                </div>
                <div class="space-y-2"><h3 class="font-bold text-sm opacity-60 mb-2">已添加</h3><div v-for="eng in store.config.searchEngines" :key="eng.id" class="flex items-center justify-between p-3 rounded-xl border border-[var(--glass-border)]" style="background-color: var(--modal-input-bg)"><div class="flex items-center gap-3"><span class="text-sm font-bold">{{ eng.name }}</span></div><button v-if="store.config.searchEngines.length > 1" @click="store.removeEngine(eng.id)" class="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"><PhTrash size="16"/></button></div></div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </transition>

    <SiteDialog :show="siteDialog.show" :isEdit="siteDialog.isEdit" :initialData="siteDialog.initialData" @close="siteDialog.show = false" @submit="onSiteSubmit" />
    <GroupDialog :show="groupDialog.show" :isEdit="groupDialog.isEdit" :initialData="groupDialog.initialData" @close="groupDialog.show = false" @submit="onGroupSubmit" />
    <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" @close="contextMenu.show = false" @edit="handleMenuAction('edit')" @delete="handleMenuAction('delete')" />

    <div class="hidden md:block">
      <WidgetPanel />
    </div>

  </div>
</template>

<style scoped>
/* 安全区域适配 */
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 20px); }

.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateX(-20px); opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.scale-enter-active, .scale-leave-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
</style>