<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue';
import {useDebounceFn} from '@vueuse/core';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {idbSetBlob, idbGetBlob, idbDeleteBlob} from '../../../../core/storage/photoIdb';
import type {PhotoRef} from '../../../../core/config/types';
import {
  PhX, PhPlus, PhTrash, PhStar, PhLinkSimple, PhUploadSimple, PhImages, PhCheckCircle,PhWarningCircle
} from '@phosphor-icons/vue';

const props = defineProps<{ show: boolean; widgetId: string }>();
const emit = defineEmits(['close']);

const store = useConfigStore();
const saveDebounced = useDebounceFn(() => store.saveConfig?.(), 300);

//   Runtime config safety
if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.photo) store.config.runtime.photo = {widgets: {}};
if (!store.config.runtime.photo.widgets) store.config.runtime.photo.widgets = {};
if (!store.config.runtime.photo.widgets[props.widgetId]) {
  store.config.runtime.photo.widgets[props.widgetId] = {items: [], defaultId: undefined};
}

const state = computed(() => store.config.runtime.photo.widgets[props.widgetId]);

// === URL Management ===
const objectUrlMap = new Map<string, string>();

async function getPreviewSrc(r: PhotoRef): Promise<string> {
  if (r.source === 'url') return r.url;

  const existed = objectUrlMap.get(r.id);
  if (existed) return existed;

  const blob = await idbGetBlob(r.blobKey);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  objectUrlMap.set(r.id, url);
  return url;
}

function revokeAllObjectUrls() {
  for (const url of objectUrlMap.values()) URL.revokeObjectURL(url);
  objectUrlMap.clear();
}

watch(() => props.show, (v) => {
  if (!v) revokeAllObjectUrls();
});

onBeforeUnmount(() => revokeAllObjectUrls());

// === Add URL ===
const urlInput = ref('');
const urlError = ref('');

function addUrl() {
  const url = urlInput.value.trim();
  if (!url) return;

  try {
    const u = new URL(url);
    if (!/^https?:/.test(u.protocol)) {
      urlError.value = 'Only http/https allowed';
      return;
    }
  } catch {
    urlError.value = 'Invalid URL format';
    return;
  }

  const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const item: PhotoRef = {
    id,
    source: 'url',
    url,
    createdAt: Date.now(),
  };

  state.value.items.unshift(item);
  state.value.defaultId ||= item.id;

  urlInput.value = '';
  urlError.value = '';
  saveDebounced();
}

// === Upload Local Files ===
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

async function compressImage(file: File, maxSide = 1920, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 200 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, tw, th);
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || file), outType, outType === 'image/jpeg' ? quality : undefined);
  });
}

async function onPickFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  uploading.value = true;
  try {
    for (const f of files) {
      const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const blobKey = `${props.widgetId}:${id}`;
      const blob = await compressImage(f);
      await idbSetBlob(blobKey, blob);

      const item: PhotoRef = {
        id,
        source: 'idb',
        blobKey,
        createdAt: Date.now(),
      };

      state.value.items.unshift(item);
      state.value.defaultId ||= item.id;
    }
    saveDebounced();
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function pickFiles() {
  fileInputRef.value?.click();
}

// === Manage Photos ===
async function removePhoto(r: PhotoRef) {
  if (r.source === 'idb') {
    await idbDeleteBlob(r.blobKey);
  }

  const obj = objectUrlMap.get(r.id);
  if (obj) {
    URL.revokeObjectURL(obj);
    objectUrlMap.delete(r.id);
  }

  state.value.items = state.value.items.filter((i) => i.id !== r.id);
  if (state.value.defaultId === r.id) {
    state.value.defaultId = state.value.items[0]?.id;
  }
  saveDebounced();
}

function setDefault(id: string) {
  state.value.defaultId = id;
  saveDebounced();
}

// === Thumbnails ===
type Thumb = { id: string; src: string; ref: PhotoRef };
const thumbs = ref<Thumb[]>([]);
let buildToken = 0;

async function rebuildThumbs() {
  const token = ++buildToken;
  const list = state.value.items || [];
  const next: Thumb[] = [];

  for (const r of list) {
    const src = await getPreviewSrc(r);
    if (token !== buildToken) return;
    next.push({id: r.id, src, ref: r});
  }
  thumbs.value = next;
}

watch(
    () => [props.show, state.value.items, state.value.defaultId] as const,
    () => {
      if (props.show) rebuildThumbs();
    },
    {immediate: true, deep: true}
);
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] flex flex-col md:flex-row bg-[var(--settings-surface)] border border-[var(--settings-border)] rounded-xl shadow-2xl overflow-hidden text-[var(--settings-text)] transition-colors duration-300"
      >
        <div
            class="w-full md:w-[320px] flex flex-col border-b md:border-b-0 md:border-r border-[var(--settings-border)] bg-[var(--settings-panel)]">
          <div class="h-14 px-4 flex items-center justify-between border-b border-[var(--settings-border)] shrink-0">
            <div class="text-sm font-bold tracking-wide flex items-center gap-2 text-[var(--settings-text)]">
              <PhImages size="18" weight="fill" class="text-[var(--accent-color)]"/>
              图片墙
            </div>
            <button
                class="p-1.5 rounded-md hover:bg-[var(--settings-border)] transition-colors text-[var(--settings-text-secondary)] hover:text-[var(--settings-text)]"
                @click="emit('close')"
            >
              <PhX size="16"/>
            </button>
          </div>

          <div class="p-4 flex flex-col gap-4 overflow-y-auto">
            <div class="flex flex-col gap-2">
              <label
                  class="text-[10px] font-bold text-[var(--settings-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <PhLinkSimple weight="bold"/>
                添加图片链接
              </label>

              <div class="flex gap-2">
                <input
                    v-model="urlInput"
                    type="text"
                    placeholder="https://example.com/image.jpg"
                    class="flex-1 px-3 py-2 rounded-lg bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] text-xs text-[var(--settings-text)] placeholder-[var(--settings-text-secondary)] outline-none focus:border-[var(--accent-color)] transition-all"
                />
                <button
                    class="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] hover:bg-[var(--settings-border)] hover:text-[var(--accent-color)] transition-colors"
                    @click="addUrl"
                >
                  <PhPlus size="14" weight="bold"/>
                </button>
              </div>
              <div v-if="urlError" class="text-[10px] text-red-500 font-medium px-1">{{ urlError }}</div>
            </div>

            <div class="flex flex-col gap-2">
              <label
                  class="text-[10px] font-bold text-[var(--settings-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <PhUploadSimple weight="bold"/>
                上传本地文件
              </label>

              <button
                  class="w-full px-4 py-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="uploading"
                  @click="pickFiles"
              >
                <PhPlus v-if="!uploading" size="14" weight="bold"/>
                <span>{{ uploading ? 'Compressing & Uploading...' : '选择图片' }}</span>
              </button>

              <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  @change="onPickFiles"
              />

              <p class="text-[10px] text-[var(--settings-text-secondary)] leading-relaxed px-1">
                Images are compressed locally and stored in browser IndexedDB. They are not synced to the cloud.
              </p>
            </div>
          </div>

          <div class="mt-auto p-4 border-t border-[var(--settings-border)] bg-[var(--settings-panel)]">
            <div class="flex justify-between items-center text-[10px] font-bold text-[var(--settings-text-secondary)]">
              <span>图片总计</span>
              <span class="text-[var(--settings-text)]">{{ state.items.length }}</span>
            </div>
            <div
                class="flex justify-between items-center text-[10px] font-bold text-[var(--settings-text-secondary)] mt-1">
              <span>默认ID</span>
              <span class="text-[var(--settings-text)] truncate max-w-[100px]">{{
                  state.defaultId ? '...' + state.defaultId.slice(-6) : 'None'
                }}</span>
            </div>
          </div>
        </div>

        <div class="flex-1 bg-[var(--settings-surface)] flex flex-col min-w-0">
          <div
              class="h-14 px-4 border-b border-[var(--settings-border)] flex items-center justify-between shrink-0 bg-[var(--settings-surface)]">
            <span class="text-xs font-bold text-[var(--settings-text-secondary)]">预览</span>
          </div>

          <div class="flex-1 overflow-y-auto p-4 custom-scroll">
            <div v-if="!thumbs.length" class="h-full flex flex-col items-center justify-center gap-3 opacity-60">
              <div class="p-4 rounded-full bg-[var(--settings-input-bg)]">
                <PhImages size="32" weight="duotone" class="text-[var(--settings-text-secondary)]"/>
              </div>
              <span class="text-xs font-medium text-[var(--settings-text-secondary)]">暂无图片.</span>
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div
                  v-for="t in thumbs"
                  :key="t.id"
                  class="group relative aspect-square rounded-xl overflow-hidden border border-[var(--settings-border)] bg-[var(--settings-input-bg)] shadow-sm transition-all hover:shadow-md hover:border-[var(--accent-color)]"
              >
                <img
                    v-if="t.src"
                    :src="t.src"
                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    draggable="false"
                    loading="lazy"
                />
                <div v-else
                     class="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--settings-text-secondary)]">
                  <PhWarningCircle size="24"/>
                  <span class="text-[10px] font-bold">Error</span>
                </div>

                <div
                    v-if="state.defaultId === t.id"
                    class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[var(--accent-color)] text-white text-[9px] font-bold shadow-sm z-10 flex items-center gap-1"
                >
                  <PhCheckCircle weight="fill" size="10"/>
                  Default
                </div>

                <div
                    class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 gap-2 backdrop-blur-[2px]"
                >
                  <div class="flex gap-2 justify-center w-full">
                    <button
                        class="flex-1 py-1.5 rounded-md text-[10px] font-bold bg-white/10 hover:bg-[var(--accent-color)] hover:text-white text-white backdrop-blur-sm transition-colors border border-white/10 flex items-center justify-center gap-1"
                        @click.stop="setDefault(t.id)"
                        title="Set as Default"
                    >
                      <PhStar size="12" weight="fill"/>
                      Set Default
                    </button>
                    <button
                        class="p-1.5 rounded-md bg-white/10 hover:bg-red-500 text-white backdrop-blur-sm transition-colors border border-white/10"
                        @click.stop="removePhoto(t.ref)"
                        title="Delete"
                    >
                      <PhTrash size="14" weight="bold"/>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 6px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: var(--settings-border);
  border-radius: 3px;
}

.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--settings-text-secondary);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>