<script setup lang="ts">
import {computed, ref} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {PhBookOpen, PhUploadSimple} from '@phosphor-icons/vue';
import NovelReaderModal from './NovelReaderModal.vue';

type NovelMeta = {
  title: string;
  blobKey: string;
  importedAt: number;
  size: number;
  progress: number;
  currentChapter?: string;
};

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();

const showModal = ref(false);
const storageKey = computed(() => `voidtab:novel-reader:${props.item.id}`);
const revision = ref(0);

const readMeta = (): NovelMeta | null => {
  revision.value;
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NovelMeta;
    return parsed?.blobKey ? parsed : null;
  } catch {
    return null;
  }
};

const meta = computed(readMeta);
const progressPercent = computed(() => Math.round(Math.max(0, Math.min(1, Number(meta.value?.progress || 0))) * 100));

const layout = computed(() => {
  const w = Number(props.item.w || 2);
  const h = Number(props.item.h || 2);
  const isMini = w === 1 && h === 1;
  const isWide = w >= 2 && h === 1;
  const isTall = w === 1 && h >= 2;
  return {
    isMini,
    isWide,
    isTall,
    key: isMini ? 'mini' : isWide ? 'wide' : isTall ? 'tall' : 'standard',
  };
});

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};

const handleUpdated = () => {
  revision.value += 1;
};
</script>

<template>
  <div
      class="novel-widget w-full h-full rounded-[18px] overflow-hidden cursor-pointer select-none"
      :data-layout="layout.key"
      @click="openModal"
  >
    <div v-if="layout.isMini" class="novel-mini">
      <PhBookOpen size="26" weight="duotone"/>
      <div class="novel-progress">{{ progressPercent }}%</div>
    </div>

    <div v-else-if="layout.isWide" class="novel-wide">
      <div class="novel-mark">
        <PhBookOpen size="18" weight="fill"/>
      </div>
      <div class="min-w-0 flex-1">
        <div class="novel-title truncate">{{ meta?.title || '导入小说' }}</div>
        <div class="novel-sub truncate">{{ meta?.currentChapter || '支持 TXT / Markdown 在线预览' }}</div>
        <div class="novel-bar"><span :style="{ width: progressPercent + '%' }"></span></div>
      </div>
      <div class="novel-percent">{{ progressPercent }}%</div>
    </div>

    <div v-else class="novel-standard">
      <div class="flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="novel-mark">
            <PhBookOpen size="18" weight="fill"/>
          </div>
          <div class="novel-title truncate">{{ meta?.title || '小说阅读器' }}</div>
        </div>
        <PhUploadSimple v-if="!meta" size="16" class="opacity-60 shrink-0"/>
      </div>

      <div class="novel-preview">
        {{ meta?.currentChapter || '导入本地小说后，可在弹窗中阅读、预览章节并记录进度。' }}
      </div>

      <div class="novel-footer">
        <span>{{ meta ? '继续阅读' : '选择文件' }}</span>
        <span>{{ progressPercent }}%</span>
      </div>
      <div class="novel-bar"><span :style="{ width: progressPercent + '%' }"></span></div>
    </div>

    <Teleport to="body">
      <NovelReaderModal
          v-if="showModal"
          :show="showModal"
          :item-id="item.id"
          @close="showModal = false"
          @updated="handleUpdated"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.novel-widget {
  min-width: 0;
  min-height: 0;
  color: #f8fafc;
  background:
      linear-gradient(145deg, rgba(20, 83, 45, 0.94), rgba(12, 18, 32, 0.96)),
      radial-gradient(circle at 85% 10%, rgba(250, 204, 21, 0.18), transparent 36%);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.26);
}

.novel-mini,
.novel-standard,
.novel-wide {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.novel-mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.novel-wide {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.novel-standard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px;
}

.novel-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.novel-title {
  font-size: 13px;
  line-height: 1.1;
  font-weight: 900;
}

.novel-sub,
.novel-preview {
  color: rgba(255, 255, 255, 0.64);
  font-size: 11px;
  line-height: 1.35;
}

.novel-preview {
  flex: 1;
  overflow: hidden;
}

.novel-footer,
.novel-percent,
.novel-progress {
  color: rgba(255, 255, 255, 0.76);
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
}

.novel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.novel-bar {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.novel-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #fde68a, #34d399);
}

.novel-widget[data-layout="tall"] .novel-standard {
  justify-content: space-between;
  text-align: center;
  align-items: center;
}

.novel-widget[data-layout="tall"] .novel-preview {
  max-height: 56px;
}
</style>
