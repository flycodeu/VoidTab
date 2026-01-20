<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {useConfigStore} from '../../../../stores/useConfigStore';
import PhotoWallModal from './PhotoWallModal.vue';
import {idbGetBlob} from '../../../../core/storage/photoIdb';
import {PhImages, PhPlus} from '@phosphor-icons/vue';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const store = useConfigStore();

const widgetId = computed(() => String(props.item.id));
const showModal = ref(false);

//   Runtime config safety
if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.photo) store.config.runtime.photo = {widgets: {}};
if (!store.config.runtime.photo.widgets) store.config.runtime.photo.widgets = {};
if (!store.config.runtime.photo.widgets[widgetId.value]) {
  store.config.runtime.photo.widgets[widgetId.value] = {items: [], defaultId: undefined};
}

const state = computed(() => store.config.runtime.photo.widgets[widgetId.value]);

const activeRef = computed(() => {
  const s = state.value;
  if (!s?.items?.length) return null;
  const def = s.defaultId ? s.items.find(i => i.id === s.defaultId) : null;
  return def ?? s.items[0] ?? null;
});

// === Image Loader ===
const previewSrc = ref<string>('');
let objectUrlToRevoke: string | null = null;

async function loadPreview() {
  if (objectUrlToRevoke) {
    URL.revokeObjectURL(objectUrlToRevoke);
    objectUrlToRevoke = null;
  }
  previewSrc.value = '';

  const r = activeRef.value;
  if (!r) return;

  if (r.source === 'url') {
    previewSrc.value = r.url;
    return;
  }

  // IDB Blob
  const blob = await idbGetBlob(r.blobKey);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  objectUrlToRevoke = url;
  previewSrc.value = url;
}

watch(activeRef, () => {
  loadPreview();
}, {immediate: true});

onBeforeUnmount(() => {
  if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
});

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};

// === Layout ===
 computed(() => {
  const w = props.item.w || 1;
  const h = props.item.h || 1;
  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    isTall: w === 1 && h >= 2,
    isStandard: w === 2 && h === 2,
    isLarge: w >= 2 && h >= 3
  };
});
</script>

<template>
  <div
      class="w-full h-full relative overflow-hidden rounded-[22px] transition-all duration-300 group"
      :class="[
        !isEditMode ? 'cursor-pointer' : 'cursor-move',
        'bg-[var(--widget-surface)] border border-[var(--widget-border)] hover:bg-[var(--widget-surface-2)] shadow-sm'
      ]"
      @click="openModal"
  >
    <div v-if="!previewSrc"
         class="w-full h-full flex flex-col items-center justify-center text-[var(--widget-muted)] gap-2">
      <div
          class="p-3 rounded-full bg-[var(--widget-surface-2)] border border-[var(--widget-border)] group-hover:scale-110 transition-transform">
        <PhImages size="24" weight="duotone" class="opacity-80"/>
      </div>
      <div class="flex flex-col items-center">
        <div class="text-[10px] font-bold tracking-widest uppercase">Photo Wall</div>
        <div class="text-[10px] opacity-60 flex items-center gap-1 mt-1">
          <PhPlus size="10"/>
          <span>Add Photos</span>
        </div>
      </div>
    </div>

    <div v-else class="absolute inset-0 w-full h-full">
      <img
          :src="previewSrc"
          class="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-105"
          draggable="false"
          alt="Widget Preview"
      />

      <div
          class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      <div
          v-if="state.items.length > 1"
          class="absolute top-3 right-3 px-2 py-1 rounded-lg text-[10px] font-bold backdrop-blur-md border shadow-sm transition-colors"
          :class="'bg-[var(--widget-surface)]/80 border-[var(--widget-border)] text-[var(--widget-text)]'"
      >
        <span class="opacity-80">1 / {{ state.items.length }}</span>
      </div>

      <div
          class="absolute left-4 bottom-3 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
        <div class="text-[10px] font-bold tracking-wider uppercase opacity-90">Gallery</div>
      </div>
    </div>

    <Teleport to="body">
      <PhotoWallModal :show="showModal" :widget-id="widgetId" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>
/* 确保图片缩放时父容器剪裁正常 */
.overflow-hidden {
  mask-image: -webkit-radial-gradient(white, black);
}
</style>