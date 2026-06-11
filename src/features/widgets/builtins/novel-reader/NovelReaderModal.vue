<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from 'vue';
import {PhBookOpen, PhUploadSimple, PhX} from '@phosphor-icons/vue';
import {idbGetBlob, idbSetBlob} from '../../../../core/storage/photoIdb';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

type NovelMeta = {
  title: string;
  blobKey: string;
  importedAt: number;
  size: number;
  progress: number;
  currentChapter?: string;
};

type Chapter = {
  title: string;
  start: number;
};

const props = defineProps<{ show: boolean; itemId: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();
useEscapeClose(() => props.show, () => emit('close'));

const storageKey = computed(() => `voidtab:novel-reader:${props.itemId}`);
const blobKey = computed(() => `novel:${props.itemId}`);

const meta = ref<NovelMeta | null>(null);
const content = ref('');
const encoding = ref('utf-8');
const isLoading = ref(false);
const errorMessage = ref('');
const readerRef = ref<HTMLElement | null>(null);

const chapters = computed<Chapter[]>(() => {
  const text = content.value;
  if (!text) return [];
  const matches: Chapter[] = [];
  const chapterRegex = /^(第[\d零一二三四五六七八九十百千万]+[章节回卷部].{0,36}|Chapter\s+\d+.{0,48}|CHAPTER\s+\d+.{0,48})$/gim;
  let match: RegExpExecArray | null;
  while ((match = chapterRegex.exec(text))) {
    matches.push({
      title: String(match[1] || '').trim(),
      start: match.index,
    });
    if (matches.length >= 1200) break;
  }
  return matches;
});

const currentProgress = computed(() => Math.round(Math.max(0, Math.min(1, Number(meta.value?.progress || 0))) * 100));
const currentChapter = computed(() => meta.value?.currentChapter || chapters.value[0]?.title || '未识别章节');

const persistMeta = (patch: Partial<NovelMeta>) => {
  const base: NovelMeta = meta.value || {
    title: '未命名小说',
    blobKey: blobKey.value,
    importedAt: Date.now(),
    size: content.value.length,
    progress: 0,
  };
  meta.value = {...base, ...patch};
  localStorage.setItem(storageKey.value, JSON.stringify(meta.value));
  emit('updated');
};

const loadMeta = () => {
  try {
    const raw = localStorage.getItem(storageKey.value);
    meta.value = raw ? JSON.parse(raw) : null;
  } catch {
    meta.value = null;
  }
};

const decodeFile = async (file: File) => {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder(encoding.value, {fatal: false}).decode(buffer);
  } catch {
    return new TextDecoder('utf-8', {fatal: false}).decode(buffer);
  }
};

const updateCurrentChapterByScroll = () => {
  const el = readerRef.value;
  if (!el || !content.value || !meta.value) return;

  const progress = el.scrollHeight <= el.clientHeight
      ? 0
      : el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
  const charIndex = Math.floor(progress * content.value.length);
  const active = [...chapters.value].reverse().find((chapter) => chapter.start <= charIndex);

  persistMeta({
    progress,
    currentChapter: active?.title || meta.value.currentChapter || chapters.value[0]?.title,
  });
};

const restoreScroll = async () => {
  await nextTick();
  const el = readerRef.value;
  if (!el || !meta.value) return;
  const progress = Math.max(0, Math.min(1, Number(meta.value.progress || 0)));
  el.scrollTop = progress * Math.max(0, el.scrollHeight - el.clientHeight);
};

const loadContent = async () => {
  loadMeta();
  if (!meta.value?.blobKey) return;

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const blob = await idbGetBlob(meta.value.blobKey);
    content.value = blob ? await blob.text() : '';
    if (!content.value) errorMessage.value = '没有读取到小说正文，请重新导入。';
    await restoreScroll();
  } catch {
    errorMessage.value = '读取小说失败，请重新导入文件。';
  } finally {
    isLoading.value = false;
  }
};

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const text = await decodeFile(file);
    const normalized = text.replace(/\r\n/g, '\n');
    const blob = new Blob([normalized], {type: 'text/plain;charset=utf-8'});
    await idbSetBlob(blobKey.value, blob);
    content.value = normalized;
    persistMeta({
      title: file.name.replace(/\.[^.]+$/, '') || '未命名小说',
      blobKey: blobKey.value,
      importedAt: Date.now(),
      size: normalized.length,
      progress: 0,
      currentChapter: chapters.value[0]?.title,
    });
    await restoreScroll();
  } catch {
    errorMessage.value = '导入失败，请确认文件是可读取的文本小说。';
  } finally {
    isLoading.value = false;
    input.value = '';
  }
};

const jumpToChapter = async (chapter: Chapter) => {
  const el = readerRef.value;
  if (!el || !content.value) return;
  const progress = chapter.start / Math.max(1, content.value.length);
  el.scrollTop = progress * Math.max(0, el.scrollHeight - el.clientHeight);
  persistMeta({progress, currentChapter: chapter.title});
};

onMounted(loadContent);
</script>

<template>
  <Transition name="novel-modal">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-3 md:p-8">
      <div class="settings-mask absolute inset-0" @click="emit('close')"></div>

      <div class="novel-shell settings-shell relative w-full max-w-6xl h-[86vh] rounded-[24px] overflow-hidden flex flex-col">
        <div class="settings-header shrink-0 px-5 py-4 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="settings-logo p-2.5 rounded-xl shrink-0">
              <PhBookOpen size="22" weight="fill"/>
            </div>
            <div class="min-w-0">
              <h3 class="settings-text text-base md:text-lg font-black truncate">{{ meta?.title || '小说阅读器' }}</h3>
              <p class="settings-muted text-[11px] font-bold truncate">{{ currentChapter }} · {{ currentProgress }}%</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <select v-model="encoding" class="settings-select py-2 text-xs">
              <option value="utf-8">UTF-8</option>
              <option value="gb18030">GB18030</option>
              <option value="big5">Big5</option>
            </select>
            <label class="import-btn">
              <PhUploadSimple size="16" weight="bold"/>
              <span>导入</span>
              <input type="file" accept=".txt,.md,.markdown,.html,.htm,.log,text/*" class="hidden" @change="handleFileChange">
            </label>
            <button class="settings-close p-2.5 rounded-full" @click="emit('close')">
              <PhX size="20"/>
            </button>
          </div>
        </div>

        <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside class="novel-chapters hidden lg:flex flex-col min-h-0 border-r border-[var(--settings-border-soft)]">
            <div class="px-4 py-3 text-[10px] font-black uppercase tracking-widest settings-muted shrink-0">
              Chapters
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto custom-scroll px-3 pb-4" data-wheel-allow="true">
              <button
                  v-for="chapter in chapters.slice(0, 240)"
                  :key="chapter.start"
                  type="button"
                  class="chapter-btn"
                  @click="jumpToChapter(chapter)"
              >
                {{ chapter.title }}
              </button>
              <div v-if="chapters.length === 0" class="settings-muted text-xs leading-relaxed p-3">
                暂未识别章节，仍可直接阅读正文。
              </div>
            </div>
          </aside>

          <section class="min-h-0 flex flex-col">
            <div v-if="errorMessage" class="mx-4 mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              {{ errorMessage }}
            </div>

            <div
                ref="readerRef"
                class="reader flex-1 min-h-0 overflow-y-auto custom-scroll"
                data-wheel-allow="true"
                @scroll.passive="updateCurrentChapterByScroll"
            >
              <div v-if="isLoading" class="reader-empty">读取中...</div>
              <pre v-else-if="content" class="reader-text">{{ content }}</pre>
              <div v-else class="reader-empty">
                <PhBookOpen size="42" weight="duotone"/>
                <span>导入 TXT 或 Markdown 小说后开始预览</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.novel-modal-enter-active,
.novel-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.novel-modal-enter-from,
.novel-modal-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.import-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--accent-color);
  color: white;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.novel-chapters {
  background: color-mix(in srgb, var(--settings-panel) 92%, var(--settings-surface));
}

.chapter-btn {
  width: 100%;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 10px;
  padding: 9px 10px;
  color: var(--settings-text-secondary);
  text-align: left;
  font-size: 12px;
  transition: background 0.16s ease, color 0.16s ease;
}

.chapter-btn:hover {
  background: var(--settings-input-bg);
  color: var(--settings-text);
}

.reader {
  padding: 24px;
  background: color-mix(in srgb, var(--settings-surface) 96%, var(--settings-panel));
}

.reader-text {
  max-width: 760px;
  margin: 0 auto;
  color: var(--settings-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: 'Noto Sans SC', 'Fira Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  line-height: 1.86;
}

.reader-empty {
  height: 100%;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--settings-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 640px) {
  .reader {
    padding: 18px;
  }

  .reader-text {
    font-size: 15px;
    line-height: 1.78;
  }

  .import-btn span {
    display: none;
  }
}
</style>
