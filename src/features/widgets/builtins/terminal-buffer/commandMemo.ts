import type {MemoNote, RuntimeConfig} from '../../../../core/config/types';
import {
  createLegacyBufferNote,
  cloneDefaultMemoCategories,
  getMemoExcerpt,
  getMemoPlainText,
  getMemoWordCount,
  normalizeMemoNotes,
} from '../../../../core/config/memoNotes';

export function ensureTerminalBufferState(runtime: RuntimeConfig) {
  if (!runtime.terminal_buffer) {
    runtime.terminal_buffer = {
      buffer: '',
      theme: 'standard',
      activeCategory: 'all',
      categories: cloneDefaultMemoCategories(),
      notes: [],
    };
  }

  const state = runtime.terminal_buffer as RuntimeConfig['terminal_buffer'];
  state.buffer ||= '';
  state.theme ||= 'standard';
  state.activeCategory ||= 'all';
  if (!Array.isArray(state.categories)) state.categories = cloneDefaultMemoCategories();
  if (state.activeCategory !== 'all' && !state.categories.some((item) => item.id === state.activeCategory)) {
    state.activeCategory = 'all';
  }

  if (!Array.isArray(state.notes)) {
    if (Array.isArray(state.commands)) {
      state.notes = normalizeMemoNotes(state.commands, [], state.categories);
    } else {
      const legacyNote = createLegacyBufferNote(state.buffer);
      state.notes = legacyNote ? [legacyNote] : [];
    }
  }

  return state;
}

export function createMemoNote(input: {
  title: string;
  content: string;
  category: string;
  summary?: string;
  pinned?: boolean;
}): MemoNote {
  const now = Date.now();
  return {
    id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category || 'inbox',
    summary: input.summary?.trim() || '',
    pinned: input.pinned === true,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchMemoNote(note: MemoNote): MemoNote {
  return {
    ...note,
    updatedAt: Date.now(),
  };
}

export function getMemoReadingMinutes(content: string) {
  const words = getMemoWordCount(content);
  if (!words) return 0;
  return Math.max(1, Math.ceil(words / 380));
}

// Backward-compatible names used by earlier terminal-buffer code.
export const createCommandMemo = (input: {
  title: string;
  command?: string;
  content?: string;
  category: string;
  description?: string;
  summary?: string;
}) => createMemoNote({
  title: input.title,
  content: input.content ?? input.command ?? '',
  category: input.category,
  summary: input.summary ?? input.description ?? '',
});

export const touchCommandMemo = touchMemoNote;
export {getMemoExcerpt, getMemoPlainText, getMemoWordCount};
