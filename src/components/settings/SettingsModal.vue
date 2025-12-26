<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {
  PhGear, PhX, PhSquaresFour, PhFrameCorners, PhImage, PhMagicWand, PhDatabase, PhGlobe,
  PhSun, PhMoon, PhCheckCircle, PhUploadSimple, PhPuzzlePiece
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
const store = useConfigStore();

const menuItems = [
  {id: 'icon', label: '图标', icon: PhSquaresFour},
  {id: 'layout', label: '布局', icon: PhFrameCorners},
  {id: 'theme', label: '主题', icon: PhImage},
  {id: 'widgets', label: '组件', icon: PhPuzzlePiece},
  {id: 'effects', label: '特效', icon: PhMagicWand},
  {id: 'search', label: '搜索', icon: PhGlobe},
  {id: 'data', label: '数据', icon: PhDatabase},
] as const;

type TabType = typeof menuItems[number]['id'];
const settingsTab = ref<TabType>('icon');
const newEngineForm = ref({name: '', url: ''});
const fileInput = ref<HTMLInputElement | null>(null);

const toggleTheme = (mode: 'light' | 'dark') => {
  store.config.theme.mode = mode;
  document.documentElement.classList.toggle('light', mode === 'light');
};
const handleAddEngine = () => {
  if (newEngineForm.value.name && newEngineForm.value.url) {
    store.addEngine(newEngineForm.value.name, newEngineForm.value.url);
    newEngineForm.value = {name: '', url: ''};
  }
};

const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) store.config.theme.wallpaper = e.target.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const handleExport = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.config)], {type: 'application/json'}));
  a.download = `voidtab-backup.json`;
  a.click();
};
const handleImport = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target?.result as string);
      if (d) {
        if (confirm('覆盖配置?')) Object.assign(store.config, d);
        alert('成功');
      }
    } catch {
      alert('错误');
    }
  };
  r.readAsText(file);
};
const triggerImport = () => fileInput.value?.click();

const greetingWidget = computed(() => store.config.widgets?.find((w: any) => w.id === 'greeting'));
</script>

<template>
  <transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
      <div @click="emit('close')" class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-all"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] md:h-[80vh] flex flex-col md:flex-row overflow-hidden rounded-3xl shadow-2xl border transition-all animate-scale-in backdrop-blur-2xl"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);">

        <div
            class="w-full md:w-64 flex flex-row md:flex-col p-2 md:p-6 border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-y-auto gap-2 no-scrollbar shrink-0"
            style="background-color: var(--modal-sidebar); border-color: var(--modal-border);">
          <div class="hidden md:flex items-center gap-3 mb-6 px-2">
            <div
                class="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-white shadow-lg">
              <PhGear weight="fill" size="18"/>
            </div>
            <span class="font-bold text-lg tracking-wide">设置</span>
          </div>
          <button v-for="item in menuItems" :key="item.id" @click="settingsTab = item.id"
                  class="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                  :class="settingsTab === item.id ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'">
            <component :is="item.icon" size="18" weight="bold"/>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="flex-1 flex flex-col h-full overflow-hidden relative bg-transparent">
          <div class="flex justify-between items-center p-4 md:p-6 border-b shrink-0"
               style="border-color: var(--modal-border);">
            <h2 class="text-xl font-bold">控制台</h2>
            <button @click="emit('close')" class="p-2 hover:bg-[var(--sidebar-active)] rounded-full transition-colors">
              <PhX size="20"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scroll">

            <div v-if="settingsTab === 'icon'" class="space-y-6 animate-fade-in">
              <div class="flex justify-between items-center"><label class="font-bold text-sm">图标大小</label><span
                  class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span></div>
              <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120"
                     class="w-full accent-[var(--accent-color)]">

              <div class="flex justify-between items-center"><label class="font-bold text-sm">圆角程度</label><span
                  class="text-xs opacity-60">{{ store.config.theme.radius }}px</span></div>
              <input type="range" v-model.number="store.config.theme.radius" min="0" max="60"
                     class="w-full accent-[var(--accent-color)]">

              <div class="flex justify-between items-center"><label class="font-bold text-sm">网格间距</label><span
                  class="text-xs opacity-60">{{ store.config.theme.gap }}px</span></div>
              <input type="range" v-model.number="store.config.theme.gap" min="10" max="80"
                     class="w-full accent-[var(--accent-color)]">

              <hr class="border-[var(--modal-border)] opacity-50">
              <div class="flex justify-between items-center"><label class="font-bold text-sm">显示名称</label><input
                  type="checkbox" v-model="store.config.theme.showIconName"
                  class="w-5 h-5 accent-[var(--accent-color)]"></div>
              <div v-if="store.config.theme.showIconName">
                <div class="flex justify-between items-center mb-2"><label
                    class="font-bold text-sm">文字大小</label><span
                    class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span></div>
                <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
                       class="w-full accent-[var(--accent-color)]"></div>
            </div>

            <div v-if="settingsTab === 'layout'" class="space-y-6 animate-fade-in">
              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">侧边栏位置</label>
                <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
                  <button @click="store.config.theme.sidebarPos = 'left'"
                          class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                          :class="store.config.theme.sidebarPos === 'left' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'">
                    左侧
                  </button>
                  <button @click="store.config.theme.sidebarPos = 'right'"
                          class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                          :class="store.config.theme.sidebarPos === 'right' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'">
                    右侧
                  </button>
                </div>
              </div>
              <div class="flex justify-between items-center"><label class="font-bold text-sm">时间组件</label><input
                  type="checkbox" v-model="store.config.theme.showTime" class="w-5 h-5 accent-[var(--accent-color)]">
              </div>
              <div v-if="greetingWidget" class="flex justify-between items-center"><label class="font-bold text-sm">问候语组件</label><input
                  type="checkbox" v-model="greetingWidget.visible" class="w-5 h-5 accent-[var(--accent-color)]"></div>
              <div class="flex justify-between items-center"><label class="font-bold text-sm">最大宽度</label><span
                  class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span></div>
              <input type="range" v-model.number="store.config.theme.gridMaxWidth" min="800" max="2000"
                     class="w-full accent-[var(--accent-color)]">
            </div>

            <div v-if="settingsTab === 'theme'" class="space-y-6 animate-fade-in">
              <div class="grid grid-cols-2 gap-4">
                <button @click="toggleTheme('light')"
                        class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
                        :class="store.config.theme.mode === 'light' ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'">
                  <PhSun weight="fill" size="32"/>
                  <span class="font-bold text-sm">浅色模式</span>
                  <div v-if="store.config.theme.mode === 'light'"
                       class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
                    <PhCheckCircle size="20" weight="fill"/>
                  </div>
                </button>
                <button @click="toggleTheme('dark')"
                        class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
                        :class="store.config.theme.mode === 'dark' ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'">
                  <PhMoon weight="fill" size="32"/>
                  <span class="font-bold text-sm">深色模式</span>
                  <div v-if="store.config.theme.mode === 'dark'"
                       class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
                    <PhCheckCircle size="20" weight="fill"/>
                  </div>
                </button>
              </div>
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
                <h3 class="font-bold text-sm mb-3">壁纸设置</h3>
                <div class="flex gap-2"><input type="text" v-model="store.config.theme.wallpaper"
                                               placeholder="输入图片或视频(mp4) URL..."
                                               class="flex-1 bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"><label
                    class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95">
                  <PhUploadSimple class="mr-2" size="16" weight="bold"/>
                  上传<input type="file" accept="image/*,video/mp4" class="hidden" @change="handleFileUpload"></label>
                </div>
              </div>
              <div class="space-y-6">
                <div>
                  <div class="flex justify-between items-center mb-2"><label
                      class="font-bold text-sm">磨砂模糊度</label><span
                      class="text-xs opacity-60">{{ store.config.theme.blur }}px</span></div>
                  <input type="range" v-model.number="store.config.theme.blur" min="0" max="50"
                         class="w-full accent-[var(--accent-color)]"></div>
                <div>
                  <div class="flex justify-between items-center mb-2"><label
                      class="font-bold text-sm">背景遮罩浓度</label><span
                      class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span></div>
                  <input type="range" v-model.number="store.config.theme.opacity" min="0" max="1" step="0.05"
                         class="w-full accent-[var(--accent-color)]"></div>
              </div>
            </div>

            <div v-if="settingsTab === 'widgets'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]"><h3
                  class="font-bold text-sm opacity-60 mb-4">组件管理</h3>
                <div class="grid gap-3">
                  <div v-for="widget in store.config.widgets" :key="widget.id"
                       class="flex items-center justify-between p-4 rounded-xl border border-[var(--glass-border)] bg-white/5">
                    <span class="font-bold text-sm">{{ widget.name }}</span><input type="checkbox"
                                                                                   v-model="widget.visible"
                                                                                   class="w-5 h-5 accent-[var(--accent-color)]">
                  </div>
                </div>
              </div>
            </div>

            <div v-if="settingsTab === 'search'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <h3 class="font-bold text-sm">添加引擎</h3>
                <div class="flex gap-2"><input v-model="newEngineForm.name" placeholder="名称"
                                               class="w-1/3 bg-transparent border-b px-2 py-1 text-sm"><input
                    v-model="newEngineForm.url" placeholder="URL"
                    class="flex-1 bg-transparent border-b px-2 py-1 text-sm"></div>
                <button @click="handleAddEngine"
                        class="w-full py-2 bg-[var(--accent-color)] text-white rounded-lg text-xs font-bold mt-2">添加
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="eng in store.config.searchEngines" :key="eng.id"
                     class="flex items-center justify-between p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
                  <span class="text-sm font-bold ml-2">{{ eng.name }}</span>
                  <button v-if="store.config.searchEngines.length>1" @click.stop="store.removeEngine(eng.id)"
                          class="text-red-500 p-2">
                    <PhTrash size="14"/>
                  </button>
                </div>
              </div>
            </div>
            <div v-if="settingsTab === 'data'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <div class="flex justify-between items-center"><h3 class="font-bold text-sm">导出数据</h3>
                  <button @click="handleExport"
                          class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold">导出 JSON
                  </button>
                </div>
                <hr class="opacity-10">
                <div class="flex justify-between items-center"><h3 class="font-bold text-sm">导入数据</h3>
                  <button @click="triggerImport"
                          class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold">导入 JSON<input
                      type="file" ref="fileInput" class="hidden" @change="handleImport"></button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 4px;
}
</style>