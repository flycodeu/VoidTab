<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import type {WebDavProfile} from '../../core/sync/types';
import {
  PhGear, PhX, PhSquaresFour, PhFrameCorners, PhImage, PhMagicWand, PhDatabase, PhGlobe,
  PhSun, PhMoon, PhCheckCircle, PhUploadSimple, PhTextT, PhLightning, PhCursorClick,
  PhTrash, PhPuzzlePiece, PhBookmarkSimple, PhFileArrowUp, PhDownloadSimple,
  PhCloudArrowUp, PhCloudArrowDown, PhWarning, PhSpinner, PhCheck
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

import {migrateConfig} from '../../core/config/migrate';
import {normalizeConfig} from '../../core/config/normalize';

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
  {id: 'sync', label: '云端同步', icon: PhCloudArrowUp}
] as const;

type TabType = typeof menuItems[number]['id'];
const settingsTab = ref<TabType>('icon');

const newEngineForm = ref({name: '', url: ''});
const fileInput = ref<HTMLInputElement | null>(null);
const bookmarkInput = ref<HTMLInputElement | null>(null);

// ==========================
// ✅ Sync：联合类型收窄 + v-model 代理（关键修复）
// ==========================
const isWebdav = computed(() => store.config.sync?.provider === 'webdav');
const webdavProfile = computed(() => (isWebdav.value ? (store.config.sync as WebDavProfile) : null));

const webdavFolder = computed({
  get: () => webdavProfile.value?.folder ?? '',
  set: (v: string) => {
    if (!webdavProfile.value) return;
    webdavProfile.value.folder = v;
  }
});
const webdavFilename = computed({
  get: () => webdavProfile.value?.filename ?? '',
  set: (v: string) => {
    if (!webdavProfile.value) return;
    webdavProfile.value.filename = v;
  }
});
const webdavUrl = computed({
  get: () => webdavProfile.value?.url ?? '',
  set: (v: string) => {
    if (!webdavProfile.value) return;
    webdavProfile.value.url = v;
  }
});
const webdavUsername = computed({
  get: () => webdavProfile.value?.username ?? '',
  set: (v: string) => {
    if (!webdavProfile.value) return;
    webdavProfile.value.username = v;
  }
});
const webdavPassword = computed({
  get: () => webdavProfile.value?.password ?? '',
  set: (v: string) => {
    if (!webdavProfile.value) return;
    webdavProfile.value.password = v;
  }
});

// ===== Sync 状态 =====
const isTesting = ref(false);
const isUploading = ref(false);
const isDownloading = ref(false);
const testResult = ref<{ success: boolean; msg: string } | null>(null);

const lastSyncTimeStr = computed(() => {
  if (!store.config.sync?.lastSyncTime) return '从未同步';
  return new Date(store.config.sync.lastSyncTime).toLocaleString();
});

// intervalMinutes 默认 10（只做 UI 兜底，不强制写回；写回由 v-model 完成）
const intervalMinutesProxy = computed({
  get() {
    const v = (store.config.sync as any)?.intervalMinutes;
    return Number(v ?? 10);
  },
  set(v: number) {
    (store.config.sync as any).intervalMinutes = Number(v);
  }
});

const handleTestConnection = async () => {
  if (!isWebdav.value || !webdavProfile.value) {
    testResult.value = {success: false, msg: '当前未启用 WebDAV（provider=none）'};
    return;
  }

  const p = webdavProfile.value;

  // ✅ 按你要求：folder / filename / url / username / password 都必须填
  if (!p.folder || !p.filename || !p.url || !p.username || !p.password) {
    testResult.value = {success: false, msg: '请先填写完整配置（含文件夹/文件名）'};
    return;
  }

  isTesting.value = true;
  testResult.value = null;

  const res = await store.testSyncConnection(p as any);
  const success = !!res?.ok;

  isTesting.value = false;
  testResult.value = {
    success,
    msg: res?.message || (success ? '连接成功！' : '连接失败，请检查 URL 或密码')
  };
};

const handleUpload = async () => {
  isUploading.value = true;
  const res = await store.uploadBackup();
  isUploading.value = false;
  alert(res.msg);
};

const handleDownload = async () => {
  if (!confirm('这将覆盖当前的本地配置，确定要恢复吗？')) return;
  isDownloading.value = true;
  const res = await store.downloadBackup();
  isDownloading.value = false;
  alert(res.msg);
};

// ===== Theme =====
const toggleTheme = (mode: 'light' | 'dark') => {
  store.config.theme.mode = mode;
  document.documentElement.classList.toggle('light', mode === 'light');
};

// ===== Search Engine =====
const handleAddEngine = () => {
  if (newEngineForm.value.name && newEngineForm.value.url) {
    store.addEngine(newEngineForm.value.name, newEngineForm.value.url);
    newEngineForm.value = {name: '', url: ''};
  }
};

// ===== Wallpaper Upload =====
const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) store.config.theme.wallpaper = e.target.result as string;
  };
  reader.readAsDataURL(file);

  // 清空 input，允许重复选择同一文件触发 change
  (event.target as HTMLInputElement).value = '';
};

// ===== Export / Import =====
const handleExport = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.config, null, 2)], {type: 'application/json'}));
  a.download = `voidtab-backup.json`;
  a.click();
};

const triggerImport = () => fileInput.value?.click();

const handleImport = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const raw = JSON.parse(String(ev.target?.result ?? ''));

      if (!raw || typeof raw !== 'object') {
        alert('不是有效配置 JSON');
        return;
      }

      if (!confirm('覆盖配置?（将使用 migrate + normalize 处理缺字段）')) return;

      // ✅ 走统一 migrate + normalize（避免缺字段/版本不一致）
      const next = normalizeConfig(migrateConfig(raw));

      // ✅ 可选：保留当前同步账号密码（防止导入文件把密码覆盖成空）
      // 只有 webdav -> webdav 才做字段保留
      const cur = {...(store.config.sync as any)};
      const ns = {...(next.sync as any)};

      const keepIfEmpty = (k: string) => {
        if (ns[k] === undefined || ns[k] === null || ns[k] === '') ns[k] = cur[k];
      };

      if (cur?.provider === 'webdav' && ns?.provider === 'webdav') {
        keepIfEmpty('url');
        keepIfEmpty('username');
        keepIfEmpty('password');
        keepIfEmpty('folder');
        keepIfEmpty('filename');
      }

      next.sync = ns;

      // ✅ 一次性替换（比 Object.assign 更干净）
      store.config = next as any;

      alert('导入成功');
    } catch (err) {
      console.error(err);
      alert('导入失败：不是合法 JSON 或格式不正确');
    }
  };

  r.readAsText(file);
  (e.target as HTMLInputElement).value = '';
};

// ===== Bookmark Import =====
const triggerBookmarkImport = () => bookmarkInput.value?.click();
const handleBookmarkUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    if (!content) return;

    const result = store.importBookmarks(content);
    if (result.success) {
      alert(`导入成功！共导入 ${result.groupCount} 个分组，${result.count} 个书签。`);
    } else {
      alert(result.message || '导入失败');
    }
  };

  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
};

const greetingWidget = computed(() => (store.config.widgets as any[])?.find((w: any) => w.id === 'greeting'));
</script>

<template>
  <transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
      <div @click="emit('close')" class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-all"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] md:h-[80vh] flex flex-col md:flex-row overflow-hidden rounded-3xl shadow-2xl border transition-all animate-scale-in backdrop-blur-2xl"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
      >
        <!-- 左侧菜单 -->
        <div
            class="w-full md:w-64 flex flex-row md:flex-col p-2 md:p-6 border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-y-auto gap-2 no-scrollbar shrink-0"
            style="background-color: var(--modal-sidebar); border-color: var(--modal-border);"
        >
          <div class="hidden md:flex items-center gap-3 mb-6 px-2">
            <div
                class="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-white shadow-lg">
              <PhGear weight="fill" size="18"/>
            </div>
            <span class="font-bold text-lg tracking-wide">设置</span>
          </div>

          <button
              v-for="item in menuItems"
              :key="item.id"
              @click="settingsTab = item.id"
              class="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
              :class="settingsTab === item.id ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"
          >
            <component :is="item.icon" size="18" weight="bold"/>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <!-- 右侧内容 -->
        <div class="flex-1 flex flex-col h-full overflow-hidden relative bg-transparent">
          <div class="flex justify-between items-center p-4 md:p-6 border-b shrink-0"
               style="border-color: var(--modal-border);">
            <h2 class="text-xl font-bold">控制台</h2>
            <button @click="emit('close')" class="p-2 hover:bg-[var(--sidebar-active)] rounded-full transition-colors">
              <PhX size="20"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scroll">
            <!-- icon -->
            <div v-if="settingsTab === 'icon'" class="space-y-6 animate-fade-in">
              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">图标大小</label>
                <span class="text-xs opacity-60">{{ store.config.theme.iconSize }}px</span>
              </div>
              <input type="range" v-model.number="store.config.theme.iconSize" min="40" max="120"
                     class="w-full accent-[var(--accent-color)]"/>

              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">圆角程度</label>
                <span class="text-xs opacity-60">{{ store.config.theme.radius }}px</span>
              </div>
              <input type="range" v-model.number="store.config.theme.radius" min="0" max="60"
                     class="w-full accent-[var(--accent-color)]"/>

              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">网格间距</label>
                <span class="text-xs opacity-60">{{ store.config.theme.gap }}px</span>
              </div>
              <input type="range" v-model.number="store.config.theme.gap" min="10" max="80"
                     class="w-full accent-[var(--accent-color)]"/>

              <hr class="border-[var(--modal-border)] opacity-50"/>

              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">显示名称</label>
                <input type="checkbox" v-model="store.config.theme.showIconName"
                       class="w-5 h-5 accent-[var(--accent-color)]"/>
              </div>

              <div v-if="store.config.theme.showIconName">
                <div class="flex justify-between items-center mb-2">
                  <label class="font-bold text-sm">文字大小</label>
                  <span class="text-xs opacity-60">{{ store.config.theme.iconTextSize }}px</span>
                </div>
                <input type="range" v-model.number="store.config.theme.iconTextSize" min="10" max="20"
                       class="w-full accent-[var(--accent-color)]"/>
              </div>
            </div>

            <!-- layout -->
            <div v-if="settingsTab === 'layout'" class="space-y-6 animate-fade-in">
              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">侧边栏位置</label>
                <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
                  <button
                      @click="store.config.theme.sidebarPos = 'left'"
                      class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                      :class="store.config.theme.sidebarPos === 'left' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'"
                  >
                    左侧
                  </button>
                  <button
                      @click="store.config.theme.sidebarPos = 'right'"
                      class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                      :class="store.config.theme.sidebarPos === 'right' ? 'bg-[var(--accent-color)] text-white shadow' : 'opacity-50 hover:opacity-100'"
                  >
                    右侧
                  </button>
                </div>
              </div>

              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">时间组件</label>
                <input type="checkbox" v-model="store.config.theme.showTime"
                       class="w-5 h-5 accent-[var(--accent-color)]"/>
              </div>

              <div v-if="greetingWidget" class="flex justify-between items-center">
                <label class="font-bold text-sm">问候语组件</label>
                <input type="checkbox" v-model="greetingWidget.visible" class="w-5 h-5 accent-[var(--accent-color)]"/>
              </div>

              <div class="flex justify-between items-center">
                <label class="font-bold text-sm">最大宽度</label>
                <span class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span>
              </div>
              <input type="range" v-model.number="store.config.theme.gridMaxWidth" min="800" max="2000"
                     class="w-full accent-[var(--accent-color)]"/>
            </div>

            <!-- theme -->
            <div v-if="settingsTab === 'theme'" class="space-y-6 animate-fade-in">
              <div class="grid grid-cols-2 gap-4">
                <button
                    @click="toggleTheme('light')"
                    class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
                    :class="store.config.theme.mode === 'light' ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'"
                >
                  <PhSun weight="fill" size="32"/>
                  <span class="font-bold text-sm">浅色模式</span>
                  <div v-if="store.config.theme.mode === 'light'"
                       class="absolute top-3 right-3 text-[var(--accent-color)] pointer-events-none">
                    <PhCheckCircle size="20" weight="fill"/>
                  </div>
                </button>

                <button
                    @click="toggleTheme('dark')"
                    class="relative flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-95"
                    :class="store.config.theme.mode === 'dark' ? 'border-[var(--accent-color)] bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)]' : 'border-transparent bg-[var(--modal-input-bg)] opacity-70 hover:opacity-100'"
                >
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
                <div class="flex gap-2">
                  <input
                      type="text"
                      v-model="store.config.theme.wallpaper"
                      placeholder="输入图片或视频(mp4) URL..."
                      class="flex-1 bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                  />
                  <label
                      class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center cursor-pointer hover:opacity-90 shadow-md transition-transform active:scale-95"
                  >
                    <PhUploadSimple class="mr-2" size="16" weight="bold"/>
                    上传
                    <input type="file" accept="image/*,video/mp4" class="hidden" @change="handleFileUpload"/>
                  </label>
                </div>
              </div>

              <div class="space-y-6">
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label class="font-bold text-sm">磨砂模糊度</label>
                    <span class="text-xs opacity-60">{{ store.config.theme.blur }}px</span>
                  </div>
                  <input type="range" v-model.number="store.config.theme.blur" min="0" max="50"
                         class="w-full accent-[var(--accent-color)]"/>
                </div>

                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label class="font-bold text-sm">背景遮罩浓度</label>
                    <span class="text-xs opacity-60">{{ (store.config.theme.opacity * 100).toFixed(0) }}%</span>
                  </div>
                  <input type="range" v-model.number="store.config.theme.opacity" min="0" max="1" step="0.05"
                         class="w-full accent-[var(--accent-color)]"/>
                </div>
              </div>
            </div>

            <!-- widgets -->
            <div v-if="settingsTab === 'widgets'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="font-bold text-sm opacity-60">组件管理</h3>
                </div>
                <div class="grid gap-3">
                  <div
                      v-for="widget in store.config.widgets"
                      :key="widget.id"
                      class="flex items-center justify-between p-4 rounded-xl border border-[var(--glass-border)] bg-white/5"
                  >
                    <div class="flex items-center gap-3">
                      <PhPuzzlePiece size="20" class="opacity-50"/>
                      <div class="flex flex-col">
                        <span class="font-bold text-sm">{{ widget.name }}</span>
                        <span class="text-[10px] opacity-40">ID: {{ widget.id }}</span>
                      </div>
                    </div>
                    <input type="checkbox" v-model="widget.visible" class="w-5 h-5 accent-[var(--accent-color)]"/>
                  </div>
                </div>
              </div>
            </div>

            <!-- effects -->
            <div v-if="settingsTab === 'effects'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-6">
                <div class="flex justify-between items-center">
                  <label class="font-bold text-sm flex items-center gap-3">
                    <PhTextT size="20" weight="duotone"/>
                    科技感数字字体
                  </label>
                  <input type="checkbox" v-model="store.config.theme.techFont"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>

                <hr class="border-[var(--glass-border)] opacity-50"/>

                <div class="flex justify-between items-center">
                  <label class="font-bold text-sm flex items-center gap-3">
                    <PhLightning size="20" weight="duotone"/>
                    侧边栏呼吸灯
                  </label>
                  <input type="checkbox" v-model="store.config.theme.breathingLight"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>

                <hr class="border-[var(--glass-border)] opacity-50"/>

                <div class="flex justify-between items-center">
                  <label class="font-bold text-sm flex items-center gap-3">
                    <PhFrameCorners size="20" weight="duotone"/>
                    霓虹边框发光
                  </label>
                  <input type="checkbox" v-model="store.config.theme.neonGlow"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>

                <hr class="border-[var(--glass-border)] opacity-50"/>

                <div class="flex justify-between items-center">
                  <label class="font-bold text-sm flex items-center gap-3">
                    <PhCursorClick size="20" weight="duotone"/>
                    科技感光标
                  </label>
                  <input type="checkbox" v-model="store.config.theme.customCursor"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>
              </div>
            </div>

            <!-- search -->
            <div v-if="settingsTab === 'search'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <h3 class="font-bold text-sm">添加引擎</h3>

                <div class="flex gap-2">
                  <input v-model="newEngineForm.name" placeholder="名称"
                         class="w-1/3 bg-transparent border-b px-2 py-1 text-sm outline-none border-current/10 focus:border-[var(--accent-color)]"/>
                  <input v-model="newEngineForm.url" placeholder="URL"
                         class="flex-1 bg-transparent border-b px-2 py-1 text-sm outline-none border-current/10 focus:border-[var(--accent-color)]"/>
                </div>

                <button @click="handleAddEngine"
                        class="w-full py-2 bg-[var(--accent-color)] text-white rounded-lg text-xs font-bold mt-2">
                  添加
                </button>
              </div>

              <div class="space-y-2">
                <div
                    v-for="eng in store.config.searchEngines"
                    :key="eng.id"
                    class="flex items-center justify-between p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]"
                >
                  <div class="flex items-center gap-2">
                    <component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"
                               class="text-[var(--accent-color)]"/>
                    <span class="text-sm font-bold ml-2">{{ eng.name }}</span>
                  </div>

                  <button
                      v-if="store.config.searchEngines.length > 1"
                      @click.stop="store.removeEngine(eng.id)"
                      class="text-red-500 p-2 hover:bg-red-500/10 rounded-lg"
                  >
                    <PhTrash size="16" weight="bold"/>
                  </button>
                </div>
              </div>
            </div>

            <!-- data -->
            <div v-if="settingsTab === 'data'" class="space-y-6 animate-fade-in">
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <div class="flex justify-between items-center">
                  <h3 class="font-bold text-sm">导出数据</h3>
                  <button
                      @click="handleExport"
                      class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center gap-2"
                  >
                    <PhDownloadSimple size="16" weight="bold"/>
                    导出 JSON
                  </button>
                </div>

                <hr class="opacity-10"/>

                <div class="flex justify-between items-center">
                  <h3 class="font-bold text-sm">导入数据</h3>
                  <button
                      @click="triggerImport"
                      class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition"
                  >
                    <PhFileArrowUp size="16" weight="bold"/>
                    导入 JSON
                    <input type="file" ref="fileInput" class="hidden" @change="handleImport"/>
                  </button>
                </div>
              </div>

              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <div class="flex items-center gap-3 mb-2">
                  <div class="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <PhBookmarkSimple size="20" weight="duotone"/>
                  </div>
                  <div>
                    <h3 class="font-bold text-sm">导入浏览器书签</h3>
                    <p class="text-[10px] opacity-60">支持 Chrome/Edge/Firefox HTML</p>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs opacity-50">将文件夹解析为分组</span>
                  <button
                      @click="triggerBookmarkImport"
                      class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold hover:bg-orange-500 hover:text-white hover:border-transparent transition-all flex items-center gap-2"
                  >
                    <PhFileArrowUp size="14" weight="bold"/>
                    选择 HTML 文件
                    <input type="file" ref="bookmarkInput" class="hidden" accept=".html"
                           @change="handleBookmarkUpload"/>
                  </button>
                </div>
              </div>
            </div>

            <!-- sync -->
            <div v-if="settingsTab === 'sync'" class="space-y-6 animate-fade-in">
              <!-- ✅ 开关区：enabled / autoSync / interval -->
              <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
                <div class="flex justify-between items-center">
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">启用同步</span>
                    <span class="text-[10px] opacity-50">关闭后将不会自动同步（手动备份仍可用）</span>
                  </div>
                  <input type="checkbox" v-model="store.config.sync.enabled"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>

                <div class="flex justify-between items-center">
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">自动同步</span>
                    <span class="text-[10px] opacity-50">开启后后台定时检查并自动上传/下载</span>
                  </div>
                  <input type="checkbox" v-model="store.config.sync.autoSync"
                         class="w-5 h-5 accent-[var(--accent-color)]"/>
                </div>

                <div class="flex justify-between items-center">
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">同步间隔</span>
                    <span class="text-[10px] opacity-50">单位：分钟（默认 10）</span>
                  </div>

                  <select
                      v-model.number="intervalMinutesProxy"
                      class="bg-transparent border border-current/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent-color)]"
                  >
                    <option :value="5">5</option>
                    <option :value="10">10</option>
                    <option :value="15">15</option>
                    <option :value="30">30</option>
                    <option :value="60">60</option>
                  </select>
                </div>
              </div>

              <!-- ✅ provider=webdav 才显示字段表单（否则 TS/运行时都安全） -->
              <template v-if="isWebdav">
                <!-- folder/filename -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div class="space-y-1">
                    <label class="text-xs font-bold opacity-60 uppercase ml-1">文件夹</label>
                    <input
                        v-model="webdavFolder"
                        type="text"
                        placeholder="voidtab"
                        class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-bold opacity-60 uppercase ml-1">文件名</label>
                    <input
                        v-model="webdavFilename"
                        type="text"
                        placeholder="voidtab-backup.json"
                        class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                    />
                  </div>
                </div>

                <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm leading-relaxed">
                  <p class="font-bold text-blue-400 mb-1 flex items-center gap-2">
                    <PhCloudArrowUp size="16" weight="fill"/>
                    WebDAV 同步
                  </p>
                  <p class="opacity-80">
                    推荐使用 <a href="https://www.jianguoyun.com/" target="_blank"
                                class="underline hover:text-[var(--accent-color)]">坚果云</a> 等支持 WebDAV 的网盘。
                  </p>
                  <p class="opacity-60 text-xs mt-1">注意：部分网盘（如坚果云）需要生成“应用专用密码”。</p>
                </div>

                <div class="space-y-4 p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
                  <div class="space-y-1">
                    <label class="text-xs font-bold opacity-60 uppercase ml-1">服务器地址 (URL)</label>
                    <input
                        v-model="webdavUrl"
                        type="text"
                        placeholder="https://dav.jianguoyun.com/dav/"
                        class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                    />
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div class="space-y-1">
                      <label class="text-xs font-bold opacity-60 uppercase ml-1">账号 (Email)</label>
                      <input
                          v-model="webdavUsername"
                          type="text"
                          placeholder="你的账号"
                          class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-xs font-bold opacity-60 uppercase ml-1">密码 / 应用密码</label>
                      <input
                          v-model="webdavPassword"
                          type="password"
                          placeholder="建议使用应用专用密码"
                          class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                      />
                    </div>
                  </div>

                  <div v-if="testResult" class="flex items-center gap-2 text-sm font-bold pt-2 animate-fade-in"
                       :class="testResult.success ? 'text-green-500' : 'text-red-500'">
                    <component :is="testResult.success ? PhCheck : PhWarning" size="18" weight="fill"/>
                    {{ testResult.msg }}
                  </div>
                </div>

                <div class="flex flex-col sm:flex-row items-center gap-3">
                  <button
                      @click="handleTestConnection"
                      :disabled="isTesting"
                      class="w-full sm:w-auto px-5 py-3 rounded-xl border border-[var(--glass-border)] font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-[var(--sidebar-active)]"
                  >
                    <PhSpinner v-if="isTesting" class="animate-spin" size="18"/>
                    <PhLightning v-else size="18" weight="bold"/>
                    测试连接
                  </button>

                  <div class="hidden sm:block flex-1"></div>

                  <button
                      @click="handleDownload"
                      :disabled="isDownloading"
                      class="w-full sm:w-auto px-5 py-3 rounded-xl border border-[var(--glass-border)] font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-[var(--sidebar-active)]"
                  >
                    <PhSpinner v-if="isDownloading" class="animate-spin" size="18"/>
                    <PhCloudArrowDown v-else size="18" weight="bold"/>
                    恢复数据
                  </button>

                  <button
                      @click="handleUpload"
                      :disabled="isUploading"
                      class="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--accent-color)] text-white font-bold text-sm transition-all hover:brightness-110 active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  >
                    <PhSpinner v-if="isUploading" class="animate-spin" size="18"/>
                    <PhCloudArrowUp v-else size="18" weight="bold"/>
                    立即备份
                  </button>
                </div>

                <div class="text-center pt-2">
                  <span class="text-xs opacity-40 font-mono">上次同步: {{ lastSyncTimeStr }}</span>
                </div>
              </template>

              <!-- provider!=webdav -->
              <div v-else class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
                <div class="flex items-start gap-3">
                  <div class="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                    <PhWarning size="20" weight="duotone"/>
                  </div>
                  <div class="flex-1">
                    <p class="font-bold text-sm">当前未启用 WebDAV</p>
                    <p class="text-xs opacity-60 mt-1">
                      provider=none 时不包含 url/username/password/folder/filename 字段，所以不会显示配置表单。
                      如需 WebDAV，请在配置里将 provider 设置为 <code class="opacity-90">webdav</code>。
                    </p>
                  </div>
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
.scale-enter-active,
.scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from,
.scale-leave-to {
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
