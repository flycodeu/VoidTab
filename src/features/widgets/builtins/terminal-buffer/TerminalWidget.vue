<script setup lang="ts">
import {computed, ref} from 'vue';
import {PhCheckSquare, PhFileMd, PhNotePencil, PhPlus, PhPushPinSimple, PhTextAa} from '@phosphor-icons/vue';
import type {SiteItem} from '../../../../core/config/types';
import {getMemoNoteCategoryLabel} from '../../../../core/config/memoNotes';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {ensureTerminalBufferState, getMemoExcerpt, getMemoWordCount} from './commandMemo';
import TerminalModal from './TerminalModal.vue';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';

const props = withDefaults(defineProps<{ item: SiteItem; isEditMode?: boolean }>(), {isEditMode: false});
const store = useConfigStore();
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 1), h: Number(props.item.h || 1)}));
const showModal = ref(false);
const createOnOpen = ref(false);
const memoState = computed(() => ensureTerminalBufferState(store.config.runtime));
const categoryLabel = (id: string) => getMemoNoteCategoryLabel(id, memoState.value.categories);
const sortedNotes = computed(() => [...memoState.value.notes].sort((a, b) => {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}));
const noteCount = computed(() => sortedNotes.value.length);
const totalWords = computed(() => sortedNotes.value.reduce((sum, note) => sum + getMemoWordCount(note.content), 0));
const todoCount = computed(() => sortedNotes.value.reduce((sum, note) => (
  sum + (note.content.match(/^\s*[-*]\s+\[\s]\s+/gim) || []).length
), 0));
const isMini = computed(() => tileSize.value.placement.w === 1 && tileSize.value.placement.h === 1);
const isWide = computed(() => tileSize.value.placement.w >= 2);
const isTall = computed(() => tileSize.value.placement.h >= 2);
const visibleCount = computed(() => {
  if (isMini.value) return 0;
  if (isWide.value && isTall.value) return 5;
  if (isWide.value) return 3;
  return isTall.value ? 4 : 2;
});
const visibleNotes = computed(() => sortedNotes.value.slice(0, visibleCount.value));
const openMemo = (create = false) => {
  if (props.isEditMode) return;
  createOnOpen.value = create;
  showModal.value = true;
};
const closeMemo = () => {
  showModal.value = false;
  createOnOpen.value = false;
};
</script>

<template>
  <button v-if="isMini" type="button" class="memo-mini" aria-label="打开备忘录" @click="openMemo()">
    <span class="memo-mini-icon"><PhNotePencil size="24" weight="duotone"/></span>
    <strong>{{ noteCount }}</strong><small>备忘</small>
  </button>

  <section v-else class="memo-widget" @dblclick="openMemo()">
    <header class="memo-widget-head">
      <div class="memo-widget-title">
        <span class="memo-widget-mark"><PhFileMd size="17" weight="fill"/></span>
        <div><strong>备忘录</strong><small>{{ noteCount }} 条记录</small></div>
      </div>
      <button type="button" class="memo-add" title="新建备忘" aria-label="新建备忘" @click.stop="openMemo(true)">
        <PhPlus size="16" weight="bold"/>
      </button>
    </header>

    <div v-if="visibleNotes.length" class="memo-widget-list">
      <button v-for="note in visibleNotes" :key="note.id" type="button" class="memo-widget-row" @click="openMemo()">
        <span class="memo-row-leading">
          <PhPushPinSimple v-if="note.pinned" size="13" weight="fill"/>
          <PhTextAa v-else size="13" weight="bold"/>
        </span>
        <span class="memo-row-copy">
          <strong>{{ note.title || '未命名备忘' }}</strong>
          <small>{{ getMemoExcerpt(note.content, note.summary || '空白备忘') }}</small>
        </span>
        <em>{{ categoryLabel(note.category) }}</em>
      </button>
    </div>

    <button v-else type="button" class="memo-widget-empty" @click="openMemo(true)">
      <PhNotePencil size="24" weight="duotone"/><span>写下第一条备忘</span>
    </button>

    <footer v-if="isTall || isWide" class="memo-widget-stats">
      <span><PhTextAa size="13" weight="bold"/>{{ totalWords }} 字</span>
      <span><PhCheckSquare size="13" weight="bold"/>{{ todoCount }} 项待办</span>
    </footer>
  </section>

  <TerminalModal :show="showModal" :create-on-open="createOnOpen" @close="closeMemo"/>
</template>

<style scoped>
.memo-mini, .memo-widget { width: 100%; height: 100%; color: var(--widget-text); background: var(--widget-bg); }
.memo-mini { display: grid; grid-template-columns: 34px minmax(0, 1fr); grid-template-rows: 1fr 1fr; align-items: center; gap: 0 8px; padding: 10px; text-align: left; }
.memo-mini-icon { grid-row: 1 / 3; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.12); }
.memo-mini strong { align-self: end; font-size: 17px; line-height: 1; }
.memo-mini small { align-self: start; margin-top: 3px; color: var(--widget-text-secondary); font-size: 10px; }
.memo-widget { display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; }
.memo-widget-head { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 10px; min-height: 46px; padding: 8px 10px; border-bottom: 1px solid var(--widget-border); }
.memo-widget-title { display: flex; min-width: 0; align-items: center; gap: 8px; }
.memo-widget-title > div { display: grid; min-width: 0; gap: 2px; }
.memo-widget-title strong { overflow: hidden; font-size: 12px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
.memo-widget-title small { color: var(--widget-text-secondary); font-size: 9px; line-height: 1; }
.memo-widget-mark, .memo-add { display: grid; flex: 0 0 auto; place-items: center; width: 30px; height: 30px; border-radius: 7px; }
.memo-widget-mark { color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.11); }
.memo-add { color: var(--widget-text-secondary); border: 1px solid var(--widget-border); background: var(--widget-hover-bg); transition: color 0.15s ease, border-color 0.15s ease; }
.memo-add:hover { color: var(--accent-color); border-color: rgba(var(--accent-color-rgb), 0.38); }
.memo-widget-list { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.memo-widget-row { display: grid; width: 100%; min-width: 0; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 45px; padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--widget-border); transition: background 0.15s ease; }
.memo-widget-row:hover { background: var(--widget-hover-bg); }
.memo-row-leading { display: grid; place-items: center; width: 20px; height: 20px; color: var(--accent-color); }
.memo-row-copy { display: grid; min-width: 0; gap: 3px; }
.memo-row-copy strong, .memo-row-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memo-row-copy strong { font-size: 11px; line-height: 1.1; }
.memo-row-copy small { color: var(--widget-text-secondary); font-size: 9px; line-height: 1.2; }
.memo-widget-row em { max-width: 54px; overflow: hidden; color: var(--widget-text-secondary); font-size: 8px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.memo-widget-empty { display: flex; flex: 1 1 auto; min-height: 0; align-items: center; justify-content: center; flex-direction: column; gap: 7px; color: var(--widget-text-secondary); font-size: 10px; }
.memo-widget-empty:hover { color: var(--accent-color); }
.memo-widget-stats { display: flex; flex: 0 0 28px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px; color: var(--widget-text-secondary); background: var(--widget-hover-bg); font-size: 8px; }
.memo-widget-stats span { display: inline-flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
