<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import {
  PhArrowLeft,
  PhBriefcase,
  PhCheck,
  PhCheckSquare,
  PhCode,
  PhColumns,
  PhCopy,
  PhDotsThree,
  PhEye,
  PhFloppyDisk,
  PhLightbulb,
  PhLink,
  PhListBullets,
  PhMagnifyingGlass,
  PhNotebook,
  PhPencilSimple,
  PhPlus,
  PhPushPin,
  PhStudent,
  PhTag,
  PhTextB,
  PhTextHOne,
  PhTrash,
  PhTray,
  PhX,
} from '@phosphor-icons/vue';
import type {Component} from 'vue';
import type {MemoCategory, MemoNote} from '../../../../core/config/types';
import {getMemoNoteCategoryLabel} from '../../../../core/config/memoNotes';
import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';
import {useToast} from '../../../../shared/composables/useToast';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {
  createMemoNote,
  ensureTerminalBufferState,
  getMemoExcerpt,
  getMemoReadingMinutes,
  getMemoWordCount,
  touchMemoNote,
} from './commandMemo';

const props = withDefaults(defineProps<{ show: boolean; createOnOpen?: boolean }>(), {createOnOpen: false});
const emit = defineEmits<{ close: [] }>();
const store = useConfigStore();
const toast = useToast();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const categoryInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
const searchQuery = ref('');
const activeNoteId = ref('');
const editorMode = ref<'edit' | 'split' | 'preview'>('split');
const mobileView = ref<'list' | 'editor'>('list');
const showDeleteConfirm = ref(false);
const showClearAllConfirm = ref(false);
const showDeleteCategoryConfirm = ref(false);
const deleteTargetNoteId = ref('');
const deleteTargetCategoryId = ref('');
const editingCategoryId = ref('');
const categoryNameDraft = ref('');
const originalSignature = ref('');
const draft = ref({title: '', content: '', category: 'inbox', summary: '', pinned: false});
const contextMenu = ref<null | {type: 'note' | 'category'; id: string; x: number; y: number}>(null);

const md = new MarkdownIt({html: false, linkify: true, breaks: true, typographer: true});
const memoState = computed(() => ensureTerminalBufferState(store.config.runtime));
const categoryOptions = computed(() => memoState.value.categories);
const allCategories = computed<MemoCategory[]>(() => [{id: 'all', label: '全部'}, ...categoryOptions.value]);
const categoryIcons: Record<string, Component> = {
  all: PhListBullets,
  inbox: PhTray,
  todo: PhCheckSquare,
  work: PhBriefcase,
  study: PhStudent,
  idea: PhLightbulb,
  snippet: PhCode,
  note: PhNotebook,
};
const categoryLabel = (id: string) => id === 'all' ? '全部' : getMemoNoteCategoryLabel(id, categoryOptions.value);
const activeCategory = computed<string>({
  get: () => memoState.value.activeCategory || 'all',
  set: (value) => {
    memoState.value.activeCategory = value || 'all';
    void store.saveConfig?.();
  },
});
const sortedNotes = computed(() => [...memoState.value.notes].sort((a, b) => {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}));
const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return sortedNotes.value.filter((note) => {
    const inCategory = activeCategory.value === 'all' || note.category === activeCategory.value;
    const haystack = `${note.title} ${note.summary || ''} ${note.content}`.toLocaleLowerCase();
    return inCategory && (!query || haystack.includes(query));
  });
});
const categoryCounts = computed(() => {
  const counts: Record<string, number> = {all: memoState.value.notes.length};
  for (const note of memoState.value.notes) counts[note.category] = (counts[note.category] || 0) + 1;
  return counts;
});
const activeNote = computed(() => memoState.value.notes.find((note) => note.id === activeNoteId.value));
const contextNote = computed(() => contextMenu.value?.type === 'note'
  ? memoState.value.notes.find((note) => note.id === contextMenu.value?.id)
  : undefined);
const contextCategory = computed(() => contextMenu.value?.type === 'category'
  ? categoryOptions.value.find((category) => category.id === contextMenu.value?.id)
  : undefined);
const deleteTargetNote = computed(() => memoState.value.notes.find((note) => note.id === deleteTargetNoteId.value));
const deleteTargetCategory = computed(() => categoryOptions.value.find((category) => category.id === deleteTargetCategoryId.value));
const deleteCategoryNoteCount = computed(() => memoState.value.notes.filter((note) => note.category === deleteTargetCategoryId.value).length);
const draftSignature = computed(() => JSON.stringify(draft.value));
const isDirty = computed(() => draftSignature.value !== originalSignature.value);
const hasDraftContent = computed(() => !!draft.value.title.trim() || !!draft.value.content.trim() || !!draft.value.summary.trim());
const wordCount = computed(() => getMemoWordCount(draft.value.content));
const lineCount = computed(() => draft.value.content ? draft.value.content.split('\n').length : 0);
const readingMinutes = computed(() => getMemoReadingMinutes(draft.value.content));
const renderedMarkdown = computed(() => DOMPurify.sanitize(md.render(draft.value.content || '')));

const persistMemoState = () => void store.saveConfig?.();
const focusCategoryInput = () => {
  const target = categoryInputRef.value;
  const input = Array.isArray(target) ? target[0] : target;
  input?.focus();
};
const formatDateTime = (value?: number) => value
  ? new Date(value).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})
  : '未保存';
const defaultCategoryId = () => categoryOptions.value.find((category) => category.id === 'inbox')?.id
  || categoryOptions.value[0]?.id
  || 'note';

const setDraft = (note?: MemoNote) => {
  if (note) {
    activeNoteId.value = note.id;
    draft.value = {
      title: note.title,
      content: note.content,
      category: note.category || defaultCategoryId(),
      summary: note.summary || '',
      pinned: note.pinned === true,
    };
  } else {
    activeNoteId.value = '';
    draft.value = {
      title: '',
      content: '',
      category: activeCategory.value === 'all' ? defaultCategoryId() : activeCategory.value,
      summary: '',
      pinned: false,
    };
  }
  originalSignature.value = JSON.stringify(draft.value);
};

const saveMemoNote = (silent = false) => {
  const content = draft.value.content.trim();
  const summary = draft.value.summary.trim();
  const title = draft.value.title.trim() || getMemoExcerpt(content || summary, '未命名备忘').slice(0, 32);
  if (!title && !content && !summary) {
    if (!silent) toast.warning('请先写一点内容');
    return false;
  }
  const category = categoryOptions.value.some((item) => item.id === draft.value.category)
    ? draft.value.category
    : defaultCategoryId();

  if (activeNoteId.value) {
    const index = memoState.value.notes.findIndex((note) => note.id === activeNoteId.value);
    if (index >= 0) {
      memoState.value.notes[index] = touchMemoNote({
        ...memoState.value.notes[index],
        title,
        content,
        summary,
        category,
        pinned: draft.value.pinned,
      });
    }
  } else {
    const note = createMemoNote({title, content, summary, category, pinned: draft.value.pinned});
    memoState.value.notes.unshift(note);
    activeNoteId.value = note.id;
  }

  draft.value.title = title;
  draft.value.category = category;
  originalSignature.value = JSON.stringify(draft.value);
  persistMemoState();
  if (!silent) toast.success('备忘已保存');
  return true;
};

const saveBeforeLeaving = () => {
  if (isDirty.value && hasDraftContent.value) saveMemoNote(true);
};
const closeContextMenu = () => {
  contextMenu.value = null;
};
const selectCategory = (id: string) => {
  closeContextMenu();
  activeCategory.value = id;
};
const selectNote = (id: string) => {
  closeContextMenu();
  if (id === activeNoteId.value) {
    mobileView.value = 'editor';
    return;
  }
  saveBeforeLeaving();
  setDraft(memoState.value.notes.find((item) => item.id === id));
  mobileView.value = 'editor';
  nextTick(() => textareaRef.value?.focus());
};
const createNewNote = () => {
  closeContextMenu();
  saveBeforeLeaving();
  setDraft();
  editorMode.value = 'edit';
  mobileView.value = 'editor';
  nextTick(() => textareaRef.value?.focus());
};
const requestClose = () => {
  closeContextMenu();
  saveBeforeLeaving();
  emit('close');
};

const showContextMenu = (type: 'note' | 'category', id: string, x: number, y: number) => {
  const width = 196;
  const height = type === 'note' ? 252 : 126;
  contextMenu.value = {
    type,
    id,
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
};
const openNoteContextMenu = (event: MouseEvent, noteId: string) => {
  showContextMenu('note', noteId, event.clientX, event.clientY);
};
const openCategoryContextMenu = (event: MouseEvent, categoryId: string) => {
  showContextMenu('category', categoryId, event.clientX, event.clientY);
};
const openAnchoredMenu = (event: MouseEvent, type: 'note' | 'category', id: string) => {
  event.stopPropagation();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  showContextMenu(type, id, rect.right - 188, rect.bottom + 4);
};
const openContextNote = () => {
  const id = contextMenu.value?.type === 'note' ? contextMenu.value.id : '';
  if (id) selectNote(id);
};
const toggleContextNotePin = () => {
  const id = contextMenu.value?.type === 'note' ? contextMenu.value.id : '';
  if (!id) return;
  if (id === activeNoteId.value && isDirty.value) saveMemoNote(true);
  const index = memoState.value.notes.findIndex((note) => note.id === id);
  if (index < 0) return;
  const note = touchMemoNote({...memoState.value.notes[index], pinned: !memoState.value.notes[index].pinned});
  memoState.value.notes[index] = note;
  if (id === activeNoteId.value) setDraft(note);
  closeContextMenu();
  persistMemoState();
};
const duplicateContextNote = () => {
  const source = contextNote.value;
  if (!source) return;
  const note = createMemoNote({
    title: `${source.title} 副本`,
    content: source.content,
    summary: source.summary,
    category: source.category,
    pinned: false,
  });
  memoState.value.notes.unshift(note);
  closeContextMenu();
  persistMemoState();
  toast.success('已创建副本');
};
const copyNoteMarkdown = async (note?: MemoNote) => {
  if (!note) return;
  try {
    await navigator.clipboard.writeText(note.content);
    closeContextMenu();
    toast.success('Markdown 已复制');
  } catch {
    toast.error('复制失败，请检查浏览器权限');
  }
};
const copyMarkdown = async () => {
  try {
    await navigator.clipboard.writeText(draft.value.content);
    toast.success('Markdown 已复制');
  } catch {
    toast.error('复制失败，请检查浏览器权限');
  }
};
const confirmDeleteNote = (noteId = activeNoteId.value) => {
  if (!noteId) return;
  deleteTargetNoteId.value = noteId;
  showDeleteConfirm.value = true;
  closeContextMenu();
};
const deleteConfirmedNote = () => {
  const targetId = deleteTargetNoteId.value;
  const index = memoState.value.notes.findIndex((note) => note.id === targetId);
  if (index >= 0) memoState.value.notes.splice(index, 1);
  showDeleteConfirm.value = false;
  deleteTargetNoteId.value = '';
  if (targetId === activeNoteId.value) {
    const next = sortedNotes.value[0];
    setDraft(next);
    if (!next) mobileView.value = 'list';
  }
  persistMemoState();
  toast.success('备忘已删除');
};
const clearAllNotes = () => {
  memoState.value.notes.splice(0, memoState.value.notes.length);
  showClearAllConfirm.value = false;
  setDraft();
  mobileView.value = 'list';
  persistMemoState();
  toast.success('全部备忘已清空');
};

const startCreateCategory = () => {
  closeContextMenu();
  editingCategoryId.value = '__new__';
  categoryNameDraft.value = '';
  nextTick(focusCategoryInput);
};
const startRenameCategory = (categoryId: string) => {
  const category = categoryOptions.value.find((item) => item.id === categoryId);
  if (!category) return;
  closeContextMenu();
  editingCategoryId.value = category.id;
  categoryNameDraft.value = category.label;
  nextTick(focusCategoryInput);
};
const cancelCategoryEdit = () => {
  editingCategoryId.value = '';
  categoryNameDraft.value = '';
};
const saveCategoryEdit = () => {
  const label = categoryNameDraft.value.trim().slice(0, 20);
  if (!label) {
    toast.warning('标签名称不能为空');
    return;
  }
  const duplicate = categoryOptions.value.some((item) =>
    item.id !== editingCategoryId.value && item.label.toLocaleLowerCase() === label.toLocaleLowerCase()
  );
  if (duplicate) {
    toast.warning('已存在同名标签');
    return;
  }
  if (editingCategoryId.value === '__new__') {
    const category: MemoCategory = {id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label};
    memoState.value.categories.push(category);
    activeCategory.value = category.id;
  } else {
    const category = categoryOptions.value.find((item) => item.id === editingCategoryId.value);
    if (!category) return;
    category.label = label;
    persistMemoState();
  }
  cancelCategoryEdit();
  persistMemoState();
};
const confirmDeleteCategory = (categoryId: string) => {
  if (categoryOptions.value.length <= 1) {
    toast.warning('至少保留一个标签');
    closeContextMenu();
    return;
  }
  deleteTargetCategoryId.value = categoryId;
  showDeleteCategoryConfirm.value = true;
  closeContextMenu();
};
const deleteConfirmedCategory = () => {
  const categoryId = deleteTargetCategoryId.value;
  const fallback = categoryOptions.value.find((item) => item.id === 'inbox' && item.id !== categoryId)
    || categoryOptions.value.find((item) => item.id !== categoryId);
  if (!categoryId || !fallback) return;
  if (activeNote.value?.category === categoryId && isDirty.value) saveMemoNote(true);
  for (let index = 0; index < memoState.value.notes.length; index += 1) {
    const note = memoState.value.notes[index];
    if (note.category === categoryId) memoState.value.notes[index] = touchMemoNote({...note, category: fallback.id});
  }
  const index = memoState.value.categories.findIndex((item) => item.id === categoryId);
  if (index >= 0) memoState.value.categories.splice(index, 1);
  if (activeCategory.value === categoryId) activeCategory.value = 'all';
  if (draft.value.category === categoryId) draft.value.category = fallback.id;
  const refreshedActive = memoState.value.notes.find((note) => note.id === activeNoteId.value);
  if (refreshedActive) setDraft(refreshedActive);
  if (editingCategoryId.value === categoryId) cancelCategoryEdit();
  showDeleteCategoryConfirm.value = false;
  deleteTargetCategoryId.value = '';
  persistMemoState();
  toast.success(`标签已删除，相关备忘已移至“${fallback.label}”`);
};

const insertMarkdown = (before: string, after = '', placeholder = '') => {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = draft.value.content.slice(start, end) || placeholder;
  draft.value.content = `${draft.value.content.slice(0, start)}${before}${selected}${after}${draft.value.content.slice(end)}`;
  nextTick(() => {
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
  });
};
const handleEditorKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveMemoNote();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    insertMarkdown('  ');
  }
};

useEscapeClose(() => props.show, () => {
  if (contextMenu.value) closeContextMenu();
  else if (editingCategoryId.value) cancelCategoryEdit();
  else requestClose();
});
watch(() => props.show, (show) => {
  if (!show) return;
  searchQuery.value = '';
  mobileView.value = 'list';
  closeContextMenu();
  cancelCategoryEdit();
  if (props.createOnOpen) createNewNote();
  else {
    const current = memoState.value.notes.find((note) => note.id === activeNoteId.value);
    setDraft(current || sortedNotes.value[0]);
  }
}, {immediate: true});
</script>

<template>
  <Teleport to="body">
  <Transition name="memo-fade">
    <div v-if="show" class="memo-overlay fixed inset-0 z-[99999] flex items-center justify-center p-3 md:p-5">
      <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="requestClose"></div>

      <section
          class="memo-shell relative w-full max-w-[1480px] h-[88vh] overflow-hidden border shadow-2xl"
          :class="mobileView === 'editor' ? 'show-mobile-editor' : ''"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memo-title"
      >
        <aside class="memo-nav">
          <div class="memo-brand">
            <span class="memo-brand-mark"><PhNotebook size="19" weight="fill"/></span>
            <div><h2 id="memo-title">备忘录</h2><p>{{ sortedNotes.length }} 条笔记</p></div>
          </div>

          <button type="button" class="memo-new" @click="createNewNote">
            <PhPlus size="16" weight="bold"/><span>新建备忘</span>
          </button>

          <div class="memo-category-heading">
            <span>标签</span>
            <button type="button" title="新建标签" aria-label="新建标签" @click="startCreateCategory">
              <PhPlus size="14" weight="bold"/>
            </button>
          </div>

          <form v-if="editingCategoryId === '__new__'" class="memo-category-editor" @submit.prevent="saveCategoryEdit">
            <PhTag size="15"/>
            <input ref="categoryInputRef" v-model="categoryNameDraft" maxlength="20" placeholder="标签名称" @keydown.esc.prevent="cancelCategoryEdit" />
            <button type="submit" title="保存标签"><PhCheck size="14" weight="bold"/></button>
            <button type="button" title="取消" @click="cancelCategoryEdit"><PhX size="14" weight="bold"/></button>
          </form>

          <nav class="memo-categories" aria-label="备忘标签">
            <template v-for="category in allCategories" :key="category.id">
              <form
                  v-if="editingCategoryId === category.id"
                  class="memo-category-editor"
                  @submit.prevent="saveCategoryEdit"
              >
                <PhTag size="15"/>
                <input ref="categoryInputRef" v-model="categoryNameDraft" maxlength="20" @keydown.esc.prevent="cancelCategoryEdit" />
                <button type="submit" title="保存标签"><PhCheck size="14" weight="bold"/></button>
                <button type="button" title="取消" @click="cancelCategoryEdit"><PhX size="14" weight="bold"/></button>
              </form>
              <div
                  v-else
                  class="memo-category-row"
                  :class="activeCategory === category.id ? 'is-active' : ''"
                  @contextmenu.prevent="category.id !== 'all' && openCategoryContextMenu($event, category.id)"
              >
                <button type="button" class="memo-category-main" @click="selectCategory(category.id)">
                  <component :is="categoryIcons[category.id] || PhTag" size="16" :weight="activeCategory === category.id ? 'fill' : 'regular'"/>
                  <span>{{ category.label }}</span>
                  <em>{{ categoryCounts[category.id] || 0 }}</em>
                </button>
                <button
                    v-if="category.id !== 'all'"
                    type="button"
                    class="memo-category-more"
                    :aria-label="`管理标签 ${category.label}`"
                    title="标签操作"
                    @click="openAnchoredMenu($event, 'category', category.id)"
                ><PhDotsThree size="16" weight="bold"/></button>
              </div>
            </template>
          </nav>

          <button
              type="button"
              class="memo-clear"
              :disabled="sortedNotes.length === 0"
              @click="showClearAllConfirm = true"
          >
            <PhTrash size="15"/><span>清空全部</span>
          </button>
        </aside>

        <section class="memo-index">
          <header class="memo-index-head">
            <div><strong>{{ categoryLabel(activeCategory) }}</strong><small>{{ filteredNotes.length }} 条</small></div>
            <div class="memo-index-head-actions">
              <button type="button" class="memo-icon-btn memo-mobile-new" title="新建备忘" @click="createNewNote"><PhPlus size="17" weight="bold"/></button>
              <button type="button" class="memo-icon-btn memo-index-close" title="关闭" @click="requestClose"><PhX size="17" weight="bold"/></button>
            </div>
          </header>

          <div class="memo-index-tools">
            <label class="memo-search">
              <PhMagnifyingGlass size="15" weight="bold"/>
              <input v-model="searchQuery" type="search" placeholder="搜索笔记" />
            </label>
            <select v-model="activeCategory" class="memo-filter-select" aria-label="筛选分类">
              <option v-for="category in allCategories" :key="category.id" :value="category.id">{{ category.label }}</option>
            </select>
          </div>

          <div class="memo-list" data-wheel-allow="true">
            <article
                v-for="note in filteredNotes"
                :key="note.id"
                class="memo-list-entry"
                :class="activeNoteId === note.id ? 'is-selected' : ''"
                @contextmenu.prevent="openNoteContextMenu($event, note.id)"
            >
              <button type="button" class="memo-list-item" @click="selectNote(note.id)">
                <span class="memo-list-title">
                  <PhPushPin v-if="note.pinned" size="12" weight="fill"/>
                  <strong>{{ note.title || '未命名备忘' }}</strong>
                </span>
                <span class="memo-list-excerpt">{{ note.summary || getMemoExcerpt(note.content) }}</span>
                <span class="memo-list-meta">
                  <em>{{ categoryLabel(note.category) }}</em>
                  <time>{{ formatDateTime(note.updatedAt || note.createdAt) }}</time>
                </span>
              </button>
              <button
                  type="button"
                  class="memo-list-more"
                  :aria-label="`管理备忘 ${note.title}`"
                  title="备忘操作"
                  @click="openAnchoredMenu($event, 'note', note.id)"
              ><PhDotsThree size="18" weight="bold"/></button>
            </article>

            <div v-if="filteredNotes.length === 0" class="memo-list-empty">
              <PhNotebook size="30" weight="duotone"/>
              <strong>{{ sortedNotes.length ? '没有匹配的笔记' : '还没有备忘' }}</strong>
              <button v-if="sortedNotes.length === 0" type="button" @click="createNewNote">
                <PhPlus size="14" weight="bold"/>新建备忘
              </button>
            </div>
          </div>
        </section>

        <main class="memo-editor">
          <header class="memo-editor-head">
            <button type="button" class="memo-icon-btn memo-back" title="返回列表" @click="mobileView = 'list'">
              <PhArrowLeft size="18" weight="bold"/>
            </button>
            <input v-model="draft.title" class="memo-title-input" placeholder="未命名备忘" />
            <div class="memo-actions">
              <button
                  type="button"
                  class="memo-icon-btn"
                  :class="draft.pinned ? 'is-active' : ''"
                  title="置顶"
                  aria-label="置顶"
                  @click="draft.pinned = !draft.pinned"
              ><PhPushPin size="17" :weight="draft.pinned ? 'fill' : 'regular'"/></button>
              <button type="button" class="memo-icon-btn" title="复制 Markdown" :disabled="!draft.content" @click="copyMarkdown">
                <PhCopy size="17"/>
              </button>
              <button type="button" class="memo-icon-btn danger" title="删除" :disabled="!activeNoteId" @click="confirmDeleteNote()">
                <PhTrash size="17"/>
              </button>
              <button type="button" class="memo-save" :class="isDirty ? 'is-dirty' : ''" @click="saveMemoNote()">
                <PhFloppyDisk size="16" weight="bold"/><span>保存</span>
              </button>
              <button type="button" class="memo-icon-btn memo-close" title="关闭" @click="requestClose">
                <PhX size="18" weight="bold"/>
              </button>
            </div>
          </header>

          <div class="memo-meta">
            <select v-model="draft.category" aria-label="笔记分类">
              <option v-for="category in categoryOptions" :key="category.id" :value="category.id">{{ category.label }}</option>
            </select>
            <input v-model="draft.summary" placeholder="添加摘要" />
            <span>{{ activeNote ? formatDateTime(activeNote.updatedAt || activeNote.createdAt) : '新备忘' }}</span>
          </div>

          <div class="memo-formatbar">
            <div class="memo-format-actions" aria-label="Markdown 格式">
              <button type="button" title="一级标题" @click="insertMarkdown('# ', '', '标题')"><PhTextHOne size="16" weight="bold"/></button>
              <button type="button" title="加粗" @click="insertMarkdown('**', '**', '文本')"><PhTextB size="16" weight="bold"/></button>
              <button type="button" title="待办" @click="insertMarkdown('- [ ] ', '', '待办事项')"><PhCheckSquare size="16" weight="bold"/></button>
              <button type="button" title="代码" @click="insertMarkdown('`', '`', 'code')"><PhCode size="16" weight="bold"/></button>
              <button type="button" title="链接" @click="insertMarkdown('[', '](https://)', '链接文字')"><PhLink size="16" weight="bold"/></button>
            </div>
            <div class="memo-mode-switch" aria-label="编辑模式">
              <button type="button" :class="editorMode === 'edit' ? 'is-active' : ''" title="编辑" @click="editorMode = 'edit'"><PhPencilSimple size="15" weight="bold"/></button>
              <button type="button" :class="editorMode === 'split' ? 'is-active' : ''" title="分栏" @click="editorMode = 'split'"><PhColumns size="15" weight="bold"/></button>
              <button type="button" :class="editorMode === 'preview' ? 'is-active' : ''" title="预览" @click="editorMode = 'preview'"><PhEye size="15" weight="bold"/></button>
            </div>
          </div>

          <section class="memo-workspace" :data-mode="editorMode">
            <textarea
                v-if="editorMode !== 'preview'"
                ref="textareaRef"
                v-model="draft.content"
                class="memo-textarea"
                spellcheck="false"
                placeholder="开始记录..."
                @keydown="handleEditorKeydown"
            ></textarea>
            <article v-if="editorMode !== 'edit'" class="memo-preview custom-scrollbar" data-wheel-allow="true">
              <div v-if="draft.content.trim()" class="memo-markdown" v-html="renderedMarkdown"></div>
              <div v-else class="memo-preview-empty"><PhNotebook size="34" weight="duotone"/><span>空白笔记</span></div>
            </article>
          </section>

          <footer class="memo-statusbar">
            <span :class="isDirty ? 'is-dirty' : ''">{{ isDirty ? '有未保存更改' : '已保存' }}</span>
            <span>{{ lineCount }} 行 · {{ wordCount }} 字<span v-if="readingMinutes"> · {{ readingMinutes }} 分钟阅读</span></span>
          </footer>
        </main>
      </section>
    </div>
  </Transition>

  <div
      v-if="contextMenu"
      class="memo-context-layer"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
  >
    <nav
        class="memo-context-menu"
        :style="{left: contextMenu.x + 'px', top: contextMenu.y + 'px'}"
        :aria-label="contextMenu.type === 'note' ? '备忘操作' : '标签操作'"
        @click.stop
        @contextmenu.prevent
    >
      <template v-if="contextMenu.type === 'note' && contextNote">
        <strong class="memo-context-title">{{ contextNote.title || '未命名备忘' }}</strong>
        <button type="button" @click="openContextNote"><PhPencilSimple size="16"/><span>打开编辑</span></button>
        <button type="button" @click="toggleContextNotePin"><PhPushPin size="16"/><span>{{ contextNote.pinned ? '取消置顶' : '置顶备忘' }}</span></button>
        <button type="button" @click="copyNoteMarkdown(contextNote)"><PhCopy size="16"/><span>复制 Markdown</span></button>
        <button type="button" @click="duplicateContextNote"><PhNotebook size="16"/><span>创建副本</span></button>
        <i></i>
        <button type="button" class="danger" @click="confirmDeleteNote(contextNote.id)"><PhTrash size="16"/><span>删除备忘</span></button>
      </template>
      <template v-else-if="contextMenu.type === 'category' && contextCategory">
        <strong class="memo-context-title">{{ contextCategory.label }}</strong>
        <button type="button" @click="startRenameCategory(contextCategory.id)"><PhPencilSimple size="16"/><span>重命名标签</span></button>
        <button
            type="button"
            class="danger"
            :disabled="categoryOptions.length <= 1"
            @click="confirmDeleteCategory(contextCategory.id)"
        ><PhTrash size="16"/><span>删除标签</span></button>
      </template>
    </nav>
  </div>

  <ConfirmDialog
      :show="showDeleteConfirm"
      :title="`删除“${deleteTargetNote?.title || '未命名备忘'}”？`"
      :message="['这条备忘将被永久删除。', '此操作不可撤销。']"
      confirmText="删除"
      cancelText="取消"
      :danger="true"
      @confirm="deleteConfirmedNote"
      @cancel="showDeleteConfirm = false"
  />
  <ConfirmDialog
      :show="showClearAllConfirm"
      title="清空全部备忘？"
      :message="['这会删除所有备忘内容。', '清空后不会恢复示例数据。']"
      confirmText="确认清空"
      cancelText="取消"
      :danger="true"
      @confirm="clearAllNotes"
      @cancel="showClearAllConfirm = false"
  />
  <ConfirmDialog
      :show="showDeleteCategoryConfirm"
      :title="`删除标签“${deleteTargetCategory?.label || ''}”？`"
      :message="[deleteCategoryNoteCount ? `该标签下的 ${deleteCategoryNoteCount} 条备忘将移至其他标签。` : '该标签当前没有备忘。', '标签删除后无法恢复。']"
      confirmText="删除标签"
      cancelText="取消"
      :danger="true"
      @confirm="deleteConfirmedCategory"
      @cancel="showDeleteCategoryConfirm = false"
  />
  </Teleport>
</template>

<style scoped>
.memo-shell {
  display: grid;
  grid-template-columns: 208px 310px minmax(0, 1fr);
  border-radius: 8px;
  border-color: var(--settings-border);
  color: var(--settings-text);
  background: var(--settings-surface);
}
.memo-nav, .memo-index, .memo-editor { min-width: 0; min-height: 0; }
.memo-nav {
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  border-right: 1px solid var(--settings-border);
  background: var(--settings-panel);
}
.memo-brand { display: flex; align-items: center; gap: 9px; min-height: 38px; padding: 0 5px; }
.memo-brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 7px; color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.12); }
.memo-brand h2 { margin: 0; font-size: 14px; line-height: 1.1; font-weight: 900; }
.memo-brand p { margin: 4px 0 0; color: var(--settings-text-secondary); font-size: 10px; line-height: 1; }
.memo-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 36px;
  margin: 16px 0 12px;
  border-radius: 7px;
  color: white;
  background: var(--accent-color);
  font-size: 12px;
  font-weight: 800;
}
.memo-new:active, .memo-save:active { transform: scale(0.98); }
.memo-category-heading { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: 0 7px; color: var(--settings-text-secondary); font-size: 9px; font-weight: 800; }
.memo-category-heading button { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 5px; color: var(--settings-text-secondary); }
.memo-category-heading button:hover { color: var(--accent-color); background: var(--settings-input-bg); }
.memo-categories { display: grid; flex: 1; min-height: 0; align-content: start; gap: 2px; overflow-y: auto; }
.memo-category-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; border-radius: 6px; color: var(--settings-text-secondary); transition: color 0.15s ease, background 0.15s ease; }
.memo-category-row:hover { color: var(--settings-text); background: var(--settings-input-bg); }
.memo-category-row.is-active { color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.11); font-weight: 800; }
.memo-category-main { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; height: 34px; padding: 0 4px 0 8px; text-align: left; font-size: 11px; }
.memo-category-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memo-category-main em { min-width: 18px; font-size: 9px; font-style: normal; text-align: right; opacity: 0.7; }
.memo-category-more { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 5px; opacity: 0; color: var(--settings-text-secondary); transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease; }
.memo-category-row:hover .memo-category-more, .memo-category-more:focus-visible { opacity: 1; }
.memo-category-more:hover { color: var(--accent-color); background: var(--settings-surface); }
.memo-category-editor { display: grid; grid-template-columns: 18px minmax(0, 1fr) 24px 24px; align-items: center; gap: 3px; min-height: 36px; padding: 3px 4px 3px 8px; border: 1px solid rgba(var(--accent-color-rgb), 0.38); border-radius: 6px; color: var(--accent-color); background: var(--settings-input-bg); }
.memo-category-editor input { min-width: 0; height: 28px; border: 0; outline: 0; color: var(--settings-text); background: transparent; font-size: 11px; }
.memo-category-editor button { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 5px; color: var(--settings-text-secondary); }
.memo-category-editor button:hover { color: var(--accent-color); background: var(--settings-surface); }
.memo-clear {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin-top: auto;
  padding: 0 9px;
  border-radius: 6px;
  color: rgb(220 38 38);
  font-size: 11px;
}
.memo-clear:hover { background: rgba(239, 68, 68, 0.09); }
.memo-clear:disabled { opacity: 0.35; pointer-events: none; }
.memo-index { display: flex; flex-direction: column; border-right: 1px solid var(--settings-border); background: var(--settings-panel); }
.memo-index-head { display: flex; flex: 0 0 58px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--settings-border); }
.memo-index-head > div:first-child { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.memo-index-head strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.memo-index-head small { flex: 0 0 auto; color: var(--settings-text-secondary); font-size: 10px; }
.memo-index-head-actions { display: flex; gap: 5px; }
.memo-index-close, .memo-mobile-new, .memo-filter-select, .memo-back { display: none; }
.memo-index-tools { display: flex; gap: 7px; padding: 10px 12px; border-bottom: 1px solid var(--settings-border); }
.memo-search {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--settings-border);
  border-radius: 6px;
  color: var(--settings-text-secondary);
  background: var(--settings-input-bg);
}
.memo-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--settings-text); background: transparent; font-size: 11px; }
.memo-filter-select { width: 82px; height: 34px; padding: 0 7px; border: 1px solid var(--settings-border); border-radius: 6px; color: var(--settings-text); background: var(--settings-input-bg); font-size: 11px; }
.memo-list { flex: 1; min-height: 0; overflow-y: auto; }
.memo-list-entry { position: relative; border-bottom: 1px solid var(--settings-border); transition: background 0.15s ease, box-shadow 0.15s ease; }
.memo-list-entry:hover { background: var(--settings-input-bg); }
.memo-list-entry.is-selected { background: rgba(var(--accent-color-rgb), 0.09); box-shadow: inset 3px 0 0 var(--accent-color); }
.memo-list-item { display: grid; gap: 7px; width: 100%; min-height: 92px; padding: 13px 42px 13px 14px; text-align: left; }
.memo-list-more { position: absolute; top: 9px; right: 9px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; color: var(--settings-text-secondary); background: var(--settings-surface); opacity: 0; transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease; }
.memo-list-entry:hover .memo-list-more, .memo-list-more:focus-visible { opacity: 1; }
.memo-list-more:hover { color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.11); }
.memo-list-title { display: flex; min-width: 0; align-items: center; gap: 5px; color: var(--accent-color); }
.memo-list-title strong { overflow: hidden; color: var(--settings-text); font-size: 12px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.memo-list-excerpt { display: -webkit-box; overflow: hidden; color: var(--settings-text-secondary); -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 10px; line-height: 1.45; }
.memo-list-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--settings-text-secondary); font-size: 9px; }
.memo-list-meta em { color: var(--accent-color); font-style: normal; font-weight: 700; }
.memo-list-meta time { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.75; }
.memo-list-empty { display: flex; min-height: 240px; align-items: center; justify-content: center; flex-direction: column; gap: 9px; padding: 20px; color: var(--settings-text-secondary); }
.memo-list-empty strong { font-size: 11px; }
.memo-list-empty button { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 10px; border: 1px solid rgba(var(--accent-color-rgb), 0.28); border-radius: 6px; color: var(--accent-color); font-size: 10px; }
.memo-editor { display: flex; flex-direction: column; background: var(--settings-surface); }
.memo-editor-head { display: flex; flex: 0 0 58px; align-items: center; gap: 10px; padding: 0 14px 0 18px; border-bottom: 1px solid var(--settings-border); }
.memo-title-input { flex: 1; min-width: 80px; border: 0; outline: 0; color: var(--settings-text); background: transparent; font-size: 18px; line-height: 1.2; font-weight: 800; }
.memo-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 5px; }
.memo-icon-btn, .memo-format-actions button, .memo-mode-switch button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--settings-text-secondary);
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.memo-icon-btn { border: 1px solid var(--settings-border); background: var(--settings-input-bg); }
.memo-icon-btn:hover, .memo-icon-btn.is-active { color: var(--accent-color); border-color: rgba(var(--accent-color-rgb), 0.35); }
.memo-icon-btn.danger:hover { color: rgb(220 38 38); border-color: rgba(239, 68, 68, 0.3); }
.memo-icon-btn:disabled { opacity: 0.35; pointer-events: none; }
.memo-save { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 11px; border-radius: 6px; color: white; background: var(--accent-color); font-size: 11px; font-weight: 800; transition: transform 0.15s ease, opacity 0.15s ease; }
.memo-save:not(.is-dirty) { opacity: 0.72; }
.memo-meta { display: grid; grid-template-columns: 104px minmax(140px, 1fr) auto; align-items: center; gap: 8px; min-height: 44px; padding: 5px 18px; border-bottom: 1px solid var(--settings-border); background: var(--settings-panel); }
.memo-meta select, .memo-meta input { min-width: 0; height: 30px; padding: 0 9px; border: 1px solid var(--settings-border); border-radius: 6px; outline: 0; color: var(--settings-text); background: var(--settings-input-bg); font-size: 10px; }
.memo-meta span { color: var(--settings-text-secondary); font-size: 9px; white-space: nowrap; }
.memo-formatbar { display: flex; flex: 0 0 42px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 14px 0 18px; border-bottom: 1px solid var(--settings-border); }
.memo-format-actions, .memo-mode-switch { display: flex; align-items: center; gap: 2px; }
.memo-format-actions button, .memo-mode-switch button { width: 29px; height: 28px; }
.memo-format-actions button:hover, .memo-mode-switch button:hover { color: var(--settings-text); background: var(--settings-input-bg); }
.memo-mode-switch { padding: 2px; border: 1px solid var(--settings-border); border-radius: 7px; background: var(--settings-input-bg); }
.memo-mode-switch button { width: 27px; height: 24px; }
.memo-mode-switch button.is-active { color: white; background: var(--accent-color); }
.memo-workspace { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.memo-workspace[data-mode="edit"], .memo-workspace[data-mode="preview"] { grid-template-columns: minmax(0, 1fr); }
.memo-textarea { width: 100%; min-width: 0; min-height: 0; height: 100%; resize: none; padding: 22px 24px; border: 0; border-right: 1px solid var(--settings-border); outline: 0; color: var(--settings-text); background: transparent; font-family: var(--tech-font-family), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.75; }
.memo-workspace[data-mode="edit"] .memo-textarea { border-right: 0; }
.memo-preview { min-width: 0; min-height: 0; overflow-y: auto; padding: 22px 26px; background: var(--settings-surface); }
.memo-preview-empty { display: flex; height: 100%; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--settings-text-secondary); font-size: 11px; }
.memo-statusbar { display: flex; flex: 0 0 30px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 18px; border-top: 1px solid var(--settings-border); color: var(--settings-text-secondary); background: var(--settings-panel); font-size: 9px; }
.memo-statusbar .is-dirty { color: rgb(217 119 6); }
.memo-markdown { max-width: 780px; color: var(--settings-text); font-size: 13px; line-height: 1.75; }
.memo-markdown :deep(h1), .memo-markdown :deep(h2), .memo-markdown :deep(h3), .memo-markdown :deep(h4) { margin: 0 0 0.65em; color: var(--settings-text); line-height: 1.3; font-weight: 850; }
.memo-markdown :deep(h1) { font-size: 1.65em; }
.memo-markdown :deep(h2) { padding-bottom: 0.3em; border-bottom: 1px solid var(--settings-border); font-size: 1.35em; }
.memo-markdown :deep(h3) { font-size: 1.15em; }
.memo-markdown :deep(p), .memo-markdown :deep(ul), .memo-markdown :deep(ol), .memo-markdown :deep(blockquote), .memo-markdown :deep(pre), .memo-markdown :deep(table) { margin: 0 0 1em; }
.memo-markdown :deep(ul), .memo-markdown :deep(ol) { padding-left: 1.5em; }
.memo-markdown :deep(blockquote) { padding: 8px 12px; border-left: 3px solid var(--accent-color); color: var(--settings-text-secondary); background: rgba(var(--accent-color-rgb), 0.07); }
.memo-markdown :deep(code) { padding: 0.12em 0.35em; border-radius: 4px; color: rgb(190 24 93); background: var(--settings-input-bg); font-family: var(--tech-font-family), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
.memo-markdown :deep(pre) { overflow: auto; padding: 14px; border-radius: 7px; color: #e5e7eb; background: #17191e; }
.memo-markdown :deep(pre code) { padding: 0; color: inherit; background: transparent; }
.memo-markdown :deep(a) { color: var(--accent-color); text-decoration: underline; text-underline-offset: 3px; }
.memo-markdown :deep(hr) { margin: 1.5em 0; border: 0; border-top: 1px solid var(--settings-border); }
.memo-markdown :deep(table) { width: 100%; border-collapse: collapse; }
.memo-markdown :deep(th), .memo-markdown :deep(td) { padding: 7px 9px; border: 1px solid var(--settings-border); text-align: left; }
.memo-markdown :deep(img) { max-width: 100%; border-radius: 6px; }
.custom-scrollbar::-webkit-scrollbar, .memo-list::-webkit-scrollbar { width: 7px; }
.custom-scrollbar::-webkit-scrollbar-thumb, .memo-list::-webkit-scrollbar-thumb { border-radius: 7px; background: var(--settings-border); }
.memo-context-layer { position: fixed; inset: 0; z-index: 100000; }
.memo-context-menu { position: fixed; z-index: 1; display: grid; width: 196px; padding: 6px; border: 1px solid var(--settings-border); border-radius: 7px; color: var(--settings-text); background: var(--settings-surface); box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28); animation: memo-context-in 0.12s ease-out; }
.memo-context-title { overflow: hidden; padding: 6px 9px 8px; color: var(--settings-text-secondary); font-size: 9px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.memo-context-menu button { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 34px; padding: 0 9px; border-radius: 5px; color: var(--settings-text); text-align: left; font-size: 11px; }
.memo-context-menu button:hover { color: var(--accent-color); background: var(--settings-input-bg); }
.memo-context-menu button.danger { color: rgb(220 38 38); }
.memo-context-menu button.danger:hover { background: rgba(239, 68, 68, 0.09); }
.memo-context-menu button:disabled { opacity: 0.38; pointer-events: none; }
.memo-context-menu i { height: 1px; margin: 5px 4px; background: var(--settings-border); }
@keyframes memo-context-in { from { opacity: 0; transform: translateY(-3px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.memo-fade-enter-active, .memo-fade-leave-active { transition: opacity 0.16s ease; }
.memo-fade-enter-from, .memo-fade-leave-to { opacity: 0; }

@media (max-width: 1150px) {
  .memo-shell { grid-template-columns: 176px 280px minmax(0, 1fr); }
  .memo-meta { grid-template-columns: 96px minmax(120px, 1fr); }
  .memo-meta > span { display: none; }
  .memo-action span { display: none; }
}
@media (max-width: 900px) {
  .memo-shell { grid-template-columns: 300px minmax(0, 1fr); }
  .memo-nav { display: none; }
  .memo-mobile-new { display: grid; }
  .memo-list-more { opacity: 1; }
  .memo-filter-select { display: block; }
  .memo-workspace[data-mode="split"] { grid-template-columns: minmax(0, 1fr); }
  .memo-workspace[data-mode="split"] .memo-preview { display: none; }
  .memo-meta { grid-template-columns: 94px minmax(0, 1fr); }
}
@media (max-width: 680px) {
  .memo-overlay { padding: 0; }
  .memo-shell { grid-template-columns: minmax(0, 1fr); width: 100%; height: 100dvh; border: 0; border-radius: 0; }
  .memo-index { display: flex; border-right: 0; }
  .memo-editor { display: none; }
  .memo-shell.show-mobile-editor .memo-index { display: none; }
  .memo-shell.show-mobile-editor .memo-editor { display: flex; }
  .memo-index-close, .memo-back { display: grid; }
  .memo-editor-head { flex-wrap: wrap; min-height: 104px; padding: 10px 12px; }
  .memo-title-input { order: 2; flex: 1 0 calc(100% - 44px); height: 36px; font-size: 16px; }
  .memo-back { order: 1; }
  .memo-actions { order: 3; width: 100%; justify-content: flex-end; }
  .memo-close { margin-left: auto; }
  .memo-meta { grid-template-columns: 94px minmax(0, 1fr); padding: 5px 12px; }
  .memo-formatbar { padding: 0 10px 0 12px; }
  .memo-textarea, .memo-preview { padding: 18px 16px; }
  .memo-statusbar { padding: 0 12px; }
}
@media (max-width: 430px) {
  .memo-save span { display: none; }
  .memo-save { width: 32px; padding: 0; }
  .memo-actions { gap: 4px; }
  .memo-icon-btn { width: 31px; }
  .memo-statusbar > span:first-child { display: none; }
  .memo-statusbar { justify-content: flex-end; }
}
</style>
