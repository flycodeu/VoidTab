<script setup lang="ts">
import {computed, ref, reactive, watch} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {idbSetBlob, idbGetBlob} from '../../../../core/storage/photoIdb';
import type {SiteListEntry} from '../../../../core/config/types';
import {
  PhX, PhPlus, PhStar, PhPencilSimple,
  PhUploadSimple, PhMagicWand, PhFolder,
  PhPaintBrush, PhCheck, PhEye
} from '@phosphor-icons/vue';

const props = defineProps<{ show: boolean; widgetId: string }>();
const emit = defineEmits(['close']);

const store = useConfigStore();
const runtime = store.config.runtime;

// 1. 数据初始化 & 兜底
if (!runtime.siteList) runtime.siteList = {groups: {}, widgets: {}};
if (!runtime.siteList.widgets[props.widgetId]) {
  const firstGroupId = Object.keys(runtime.siteList.groups)[0] || 'default_group';
  if (!runtime.siteList.groups[firstGroupId]) {
    runtime.siteList.groups[firstGroupId] = {
      id: firstGroupId,
      name: '默认清单',
      style: 'glass',
      viewConfig: {showIcon: true, showTitle: true, showDesc: true},
      items: []
    };
  }
  runtime.siteList.widgets[props.widgetId] = {groupId: firstGroupId, defaultSiteId: undefined};
}

const groups = computed(() => runtime.siteList.groups);
const widgetRef = computed(() => runtime.siteList.widgets[props.widgetId]);
const currentViewingGroupId = ref<string>(widgetRef.value.groupId);

watch(() => widgetRef.value.groupId, (val) => {
  if (val) currentViewingGroupId.value = val;
}, {immediate: true});

const activeGroup = computed(() => groups.value[currentViewingGroupId.value]);

// 确保 viewConfig 存在 (旧数据兼容)
watch(activeGroup, (grp) => {
  if (grp && !grp.viewConfig) {
    grp.viewConfig = {showIcon: true, showTitle: true, showDesc: true};
  }
  if (grp && !grp.style) grp.style = 'glass';
}, {immediate: true});

// 2. 状态管理
const isEditing = ref(false);
const editingId = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
//const isRenamingGroup = ref(false);
const isFetchingIcon = ref(false);
const fetchError = ref('');

// 图片预览专用 (解决 IDB 图片不显示问题)
const previewSrc = ref('');

const form = reactive<SiteListEntry>({
  id: '', title: '', desc: '', url: '',
  iconType: 'text', iconValue: '', enableFx: false, fxType: 'ripple'
});

// 3. 风格定义 (不再是纯色，而是特效名)
const widgetStyles = [
  {label: '磨砂', value: 'glass', class: 'bg-white/10 border-white/20'},
  {label: '暗夜', value: 'dark', class: 'bg-[#000] border-gray-800'},
  {label: '霓虹', value: 'neon', class: 'bg-black border-purple-500 shadow-purple-500/50'},
  {label: '赛博', value: 'cyber', class: 'bg-zinc-900 border-cyan-400 text-cyan-400'},
  {label: '极简', value: 'minimal', class: 'bg-transparent border-dashed border-gray-600'},
  {label: '流光', value: 'gradient', class: 'bg-gradient-to-br from-blue-600 to-purple-600 border-transparent'},
];

// --- 核心逻辑 ---

// 自动更新预览图
watch(() => [form.iconType, form.iconValue], async () => {
  if (form.iconType === 'text') {
    previewSrc.value = '';
  } else if (form.iconType === 'image') {
    previewSrc.value = form.iconValue;
  } else if (form.iconType === 'upload') {
    if (!form.iconValue) {
      previewSrc.value = '';
      return;
    }
    //   关键修复：从 IDB 读取 Blob 并生成 URL
    const blob = await idbGetBlob(form.iconValue);
    if (blob) previewSrc.value = URL.createObjectURL(blob);
    else previewSrc.value = '';
  }
}, {immediate: true});

// 自动抓取图标
async function autoFetchIcon() {
  if (!form.url) return;
  isFetchingIcon.value = true;
  fetchError.value = '';

  try {
    let domain = '';
    try {
      domain = new URL(form.url).hostname;
    } catch {
      domain = form.url;
    }

    // 尝试获取
    const iconApi = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    // 尝试 Fetch 转 Blob (为了存本地)
    try {
      const resp = await fetch(iconApi);
      if (resp.ok) {
        const blob = await resp.blob();
        const blobKey = `sl_auto_${Date.now()}`;
        await idbSetBlob(blobKey, blob);
        form.iconType = 'upload';
        form.iconValue = blobKey;
        return; // 成功
      }
    } catch (e) {
      console.warn('CORS限制，降级为链接模式');
    }

    // 降级：直接存链接
    form.iconType = 'image';
    form.iconValue = iconApi;

  } catch (e) {
    fetchError.value = '无法获取图标';
  } finally {
    isFetchingIcon.value = false;
  }
}

// 显示控制 (强制至少选一个)
function toggleView(key: keyof typeof activeGroup.value.viewConfig) {
  const cfg = activeGroup.value.viewConfig;
  // 如果当前是 true，且尝试关闭，检查是否是最后一个
  if (cfg[key]) {
    const activeCount = Object.values(cfg).filter(v => v).length;
    if (activeCount <= 1) return; // 禁止关闭最后一个
  }
  cfg[key] = !cfg[key];
  store.saveConfig();
}

function updateGroupStyle(style: string) {
  if (activeGroup.value) {
    activeGroup.value.style = style;
    store.saveConfig();
  }
}

// ... 基础 CRUD (保持不变) ...
function bindGroup(groupId: string) {
  currentViewingGroupId.value = groupId;
  widgetRef.value.groupId = groupId;
  store.saveConfig();
}

function createGroup() {
  const id = `group_${Date.now()}`;
  runtime.siteList.groups[id] = {
    id, name: '新建清单', style: 'glass',
    viewConfig: {showIcon: true, showTitle: true, showDesc: true}, items: []
  };
  bindGroup(id);
}

// function deleteGroup(groupId: string) {
//   const ids = Object.keys(groups.value);
//   if (ids.length <= 1) return alert('至少保留一个清单');
//   delete runtime.siteList.groups[groupId];
//   if (currentViewingGroupId.value === groupId) bindGroup(Object.keys(runtime.siteList.groups)[0]);
//   store.saveConfig();
// }

function resetForm() {
  editingId.value = null;
  isEditing.value = false;
  Object.assign(form, {
    id: '',
    title: '',
    desc: '',
    url: '',
    iconType: 'text',
    iconValue: '',
    enableFx: false,
    fxType: 'ripple'
  });
}

function editItem(item: SiteListEntry) {
  editingId.value = item.id;
  isEditing.value = true;
  Object.assign(form, JSON.parse(JSON.stringify(item)));
}

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const blobKey = `sl_${Date.now()}`;
  await idbSetBlob(blobKey, file);
  form.iconType = 'upload';
  form.iconValue = blobKey;
}

function saveItem() {
  if (!form.title || !form.url) return;
  const newItem: SiteListEntry = {...form, id: editingId.value || `site_${Date.now()}`};
  if (newItem.iconType === 'text' && !newItem.iconValue) newItem.iconValue = newItem.title.substring(0, 2).toUpperCase();
  const list = [...activeGroup.value.items];
  const idx = editingId.value ? list.findIndex(i => i.id === editingId.value) : -1;
  if (idx > -1) list[idx] = newItem; else list.push(newItem);
  activeGroup.value.items = list;
  store.saveConfig();
  resetForm();
}

function deleteItem(id: string) {
  activeGroup.value.items = activeGroup.value.items.filter(i => i.id !== id);
  if (widgetRef.value.defaultSiteId === id) widgetRef.value.defaultSiteId = undefined;
  store.saveConfig();
  resetForm();
}

function toggleDefault(siteId: string) {
  if (currentViewingGroupId.value !== widgetRef.value.groupId) bindGroup(currentViewingGroupId.value);
  widgetRef.value.defaultSiteId = (widgetRef.value.defaultSiteId === siteId) ? undefined : siteId;
  store.saveConfig();
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-md" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] bg-[#121212] border border-white/10 rounded-2xl flex overflow-hidden shadow-2xl text-gray-200">
        <button @click="emit('close')"
                class="absolute top-4 right-4 z-20 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition">
          <PhX size="20"/>
        </button>

        <div class="w-64 bg-[#18181b] border-r border-white/5 flex flex-col">
          <div class="p-5 border-b border-white/5 flex items-center justify-between">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">我的清单</span>
            <button @click="createGroup" class="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition">
              <PhPlus size="16" weight="bold"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-3 space-y-1">
            <div v-for="grp in groups" :key="grp.id"
                 class="group px-3 py-3 rounded-xl text-sm cursor-pointer flex items-center justify-between transition border"
                 :class="currentViewingGroupId === grp.id ? 'bg-[#27272a] border-white/10 text-white' : 'border-transparent text-gray-400 hover:bg-white/5'"
                 @click="bindGroup(grp.id)">
              <div class="flex items-center gap-3 overflow-hidden">
                <PhFolder size="18" :weight="currentViewingGroupId === grp.id ? 'duotone' : 'regular'"
                          :class="{'text-blue-400': currentViewingGroupId === grp.id}"/>
                <span class="truncate font-medium">{{ grp.name }}</span>
              </div>
            </div>
          </div>

          <div class="p-5 border-t border-white/5 bg-[#141414] space-y-5">

            <div class="space-y-3">
              <div class="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-2">
                <PhEye/>
                显示元素
              </div>
              <div class="flex justify-between gap-2">
                <button @click="toggleView('showIcon')" class="flex-1 py-1.5 rounded border text-xs transition"
                        :class="activeGroup?.viewConfig.showIcon ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-gray-500'">
                  图标
                </button>
                <button @click="toggleView('showTitle')" class="flex-1 py-1.5 rounded border text-xs transition"
                        :class="activeGroup?.viewConfig.showTitle ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-gray-500'">
                  名称
                </button>
                <button @click="toggleView('showDesc')" class="flex-1 py-1.5 rounded border text-xs transition"
                        :class="activeGroup?.viewConfig.showDesc ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-gray-500'">
                  简介
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-2">
                <PhPaintBrush/>
                组件风格
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="s in widgetStyles" :key="s.value"
                        @click="updateGroupStyle(s.value)"
                        class="h-8 rounded border text-[10px] transition relative overflow-hidden"
                        :class="[s.class, activeGroup?.style === s.value ? 'ring-2 ring-white scale-105 z-10' : 'opacity-60 hover:opacity-100']">
                  <span class="relative z-10 font-bold mix-blend-difference text-white">{{ s.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="w-72 bg-[#121212] border-r border-white/5 flex flex-col">
          <div class="h-16 flex items-center justify-between px-5 border-b border-white/5">
            <span class="text-sm font-bold text-gray-100">站点列表</span>
            <button @click="resetForm(); isEditing=true"
                    class="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold hover:bg-blue-500 hover:text-white transition">
              添加
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            <div v-for="item in activeGroup?.items" :key="item.id"
                 class="p-3 rounded-xl border transition cursor-pointer flex items-center gap-3"
                 :class="editingId === item.id ? 'bg-[#222] border-blue-500/50' : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'"
                 @click="editItem(item)">
              <div
                  class="w-9 h-9 rounded-lg bg-black/30 flex items-center justify-center text-xs text-gray-400 overflow-hidden border border-white/5 shrink-0">
                <span v-if="item.iconType === 'text'">{{ item.iconValue }}</span>
                <PhCheck v-else-if="item.iconType === 'upload'" class="text-green-500"/>
                <img v-else :src="item.iconValue" class="w-full h-full object-cover"/>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-200 truncate">{{ item.title }}</div>
                <div class="text-[10px] text-gray-500 truncate">{{ item.url }}</div>
              </div>
              <button @click.stop="toggleDefault(item.id)" class="p-2 rounded-lg transition"
                      :class="widgetRef.defaultSiteId === item.id ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'">
                <PhStar size="16" :weight="widgetRef.defaultSiteId === item.id ? 'fill' : 'regular'"/>
              </button>
            </div>
          </div>
        </div>

        <div class="flex-1 bg-[#121212] flex flex-col relative">
          <div v-if="isEditing" class="flex flex-col h-full animate-fade-in">
            <div class="h-16 flex items-center px-8 border-b border-white/5 text-base font-bold text-gray-100">
              {{ editingId ? '编辑项目' : '新增项目' }}
            </div>

            <div class="flex-1 overflow-y-auto p-8 space-y-8">
              <div class="space-y-3">
                <div class="flex justify-between text-[10px] text-gray-500 font-bold uppercase">
                  <span>跳转链接</span>
                  <span v-if="fetchError" class="text-red-400">{{ fetchError }}</span>
                  <span v-if="isFetchingIcon" class="text-blue-400 animate-pulse">正在获取...</span>
                </div>
                <div class="flex gap-2">
                  <input v-model="form.url"
                         class="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:border-blue-500 outline-none"
                         placeholder="https://..."/>
                  <button @click="autoFetchIcon" :disabled="isFetchingIcon"
                          class="px-4 bg-[#1a1a1a] border border-white/10 rounded-xl text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition text-xs font-bold flex items-center gap-2">
                    <PhMagicWand size="16"/>
                    自动获取
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label class="text-[10px] text-gray-500 font-bold uppercase">名称</label>
                  <input v-model="form.title"
                         class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:border-blue-500 outline-none"/>
                </div>
                <div class="space-y-2">
                  <label class="text-[10px] text-gray-500 font-bold uppercase">简介</label>
                  <input v-model="form.desc"
                         class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:border-blue-500 outline-none"/>
                </div>
              </div>

              <div class="w-full h-[1px] bg-white/5"></div>

              <div class="space-y-4">
                <label class="text-[10px] text-gray-500 font-bold uppercase">图标样式</label>
                <div class="flex gap-3">
                  <button v-for="t in ['text', 'image', 'upload']" :key="t" @click="form.iconType = t as any"
                          class="flex-1 py-2 rounded-lg text-xs border transition capitalize font-medium"
                          :class="form.iconType === t ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400 hover:bg-white/5'">
                    {{ t }}
                  </button>
                </div>

                <div class="bg-[#18181b] p-6 rounded-2xl border border-white/5 flex items-center gap-6">
                  <div
                      class="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-white overflow-hidden shrink-0">
                    <span v-if="form.iconType === 'text'" class="text-2xl font-bold">{{ form.iconValue }}</span>
                    <img v-else-if="previewSrc" :src="previewSrc" class="w-full h-full object-cover"/>
                    <div v-else class="text-[10px] text-gray-600 text-center px-1">预览为空</div>
                  </div>

                  <div class="flex-1">
                    <div v-if="form.iconType === 'text'">
                      <input v-model="form.iconValue" maxlength="6"
                             class="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none uppercase text-center tracking-widest"
                             placeholder="ABC..."/>
                    </div>
                    <div v-else-if="form.iconType === 'image'">
                      <input v-model="form.iconValue"
                             class="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-xs text-gray-300 focus:border-blue-500 outline-none"
                             placeholder="https://..."/>
                    </div>
                    <div v-else>
                      <button @click="fileInput?.click()"
                              class="w-full py-2 bg-[#121212] border border-white/10 rounded-xl text-xs text-gray-300 hover:text-white transition flex items-center justify-center gap-2">
                        <PhUploadSimple size="14"/>
                        上传文件
                      </button>
                      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileUpload"/>
                      <p v-if="form.iconValue" class="text-[10px] text-green-500 mt-2 flex items-center gap-1">
                        <PhCheck/>
                        已存入本地数据库
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-6 border-t border-white/5 flex gap-4 bg-[#18181b]">
              <button v-if="editingId" @click="deleteItem(editingId)"
                      class="px-5 py-2.5 bg-[#202023] border border-white/5 text-red-400 rounded-xl text-sm">删除
              </button>
              <div class="flex-1"></div>
              <button @click="resetForm" class="px-6 py-2.5 text-gray-500 hover:text-white text-sm">取消</button>
              <button @click="saveItem"
                      class="px-8 py-2.5 bg-white text-black font-bold rounded-xl hover:scale-105 transition">保存
              </button>
            </div>
          </div>

          <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-600 select-none">
            <PhPencilSimple size="40" class="opacity-20 mb-2"/>
            <p class="text-sm">选择项目编辑</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>