<script setup lang="ts">
import {ref, onMounted, nextTick, computed} from 'vue';
import { useDateFormat, useNow} from '@vueuse/core';
import {
  PhX, PhBroom, PhBracketsCurly, PhClipboardText,
  PhArrowsLeftRight, PhPaintBucket, PhPlus, PhFloppyDisk, PhPencilSimple,
  PhTrash, PhCopy, PhArrowLineRight
} from '@phosphor-icons/vue';
import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';
import {useToast} from '../../../../shared/composables/useToast';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';
import {getTerminalCommandCategoryLabel, terminalCommandCategories} from '../../../../core/config/terminalCommands';
import {createCommandMemo, ensureTerminalBufferState, touchCommandMemo} from './commandMemo';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
useEscapeClose(() => props.show, () => emit('close'));

// === 核心状态 ===
import { useConfigStore } from '../../../../stores/useConfigStore';

const store = useConfigStore();
const toast = useToast();
const terminalState = computed(() => ensureTerminalBufferState(store.config.runtime));
const content = computed<string>({
  get: () => terminalState.value.buffer,
  set: (v) => (terminalState.value.buffer = v),
});

const currentTheme = computed<string>({
  get: () => terminalState.value.theme,
  set: (v) => (terminalState.value.theme = v),
});
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const statusMsg = ref('READY');
const showClearConfirm = ref(false);
const editingCommandId = ref('');
const commandForm = ref({
  title: '',
  command: '',
  category: 'dev',
  description: '',
});

const commandCategoryOptions = terminalCommandCategories.filter((item) => item.id !== 'all');
const activeCommandCategory = computed<string>({
  get: () => terminalState.value.activeCategory || 'all',
  set: (v) => (terminalState.value.activeCategory = v || 'all'),
});

const sortedCommands = computed(() => {
  return [...terminalState.value.commands].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
});

const filteredCommands = computed(() => {
  if (activeCommandCategory.value === 'all') return sortedCommands.value;
  return sortedCommands.value.filter((item) => item.category === activeCommandCategory.value);
});

// === 主题定义 ===
const themes = [
  {id: 'standard', name: 'Standard (IDE)', class: 'theme-standard'},
  {id: 'retro', name: 'Retro (CRT)', class: 'theme-retro'},
  {id: 'cyber', name: 'Cyber (Holo)', class: 'theme-cyber'},
  {id: 'paper', name: 'Paper (Light)', class: 'theme-paper'},
];

const activeThemeClass = computed(() => {
  return themes.find(t => t.id === currentTheme.value)?.class || 'theme-standard';
});

// === 工具函数 ===
const showStatus = (msg: string) => {
  statusMsg.value = msg;
  setTimeout(() => statusMsg.value = 'READY', 2000);
};

const resetCommandForm = () => {
  editingCommandId.value = '';
  commandForm.value = {
    title: '',
    command: '',
    category: activeCommandCategory.value === 'all' ? 'dev' : activeCommandCategory.value,
    description: '',
  };
};

const persistCommandState = () => {
  store.saveConfig?.();
};

const saveCommandMemo = () => {
  const command = commandForm.value.command.trim();
  if (!command) {
    toast.warning('请先填写命令内容');
    return;
  }

  const title = commandForm.value.title.trim() || command.slice(0, 28);
  if (editingCommandId.value) {
    const idx = terminalState.value.commands.findIndex((item) => item.id === editingCommandId.value);
    if (idx >= 0) {
      terminalState.value.commands[idx] = touchCommandMemo({
        ...terminalState.value.commands[idx],
        title,
        command,
        category: commandForm.value.category || 'note',
        description: commandForm.value.description.trim(),
      });
      toast.success('命令已更新');
    }
  } else {
    terminalState.value.commands.unshift(createCommandMemo({
      title,
      command,
      category: commandForm.value.category || 'note',
      description: commandForm.value.description,
    }));
    toast.success('命令已保存');
  }

  persistCommandState();
  resetCommandForm();
};

const editCommandMemo = (id: string) => {
  const command = terminalState.value.commands.find((item) => item.id === id);
  if (!command) return;
  editingCommandId.value = command.id;
  commandForm.value = {
    title: command.title,
    command: command.command,
    category: command.category || 'note',
    description: command.description || '',
  };
};

const deleteCommandMemo = (id: string) => {
  terminalState.value.commands = terminalState.value.commands.filter((item) => item.id !== id);
  if (editingCommandId.value === id) resetCommandForm();
  persistCommandState();
  toast.success('命令已删除');
};

const copyCommandMemo = async (command: string) => {
  try {
    await navigator.clipboard.writeText(command);
    showStatus('COMMAND COPIED');
    toast.success('命令已复制');
  } catch {
    showStatus('ERR: COPY FAIL');
    toast.error('复制失败，请检查浏览器权限');
  }
};

const insertCommandMemo = (command: string) => {
  content.value = content.value ? `${content.value}\n${command}` : command;
  showStatus('COMMAND INSERTED');
  nextTick(() => textareaRef.value?.focus());
};

// 1. JSON 格式化/压缩
const toggleJSON = () => {
  try {
    const obj = JSON.parse(content.value);
    if (content.value.includes('\n')) {
      content.value = JSON.stringify(obj);
      showStatus('JSON MINIFIED');
    } else {
      content.value = JSON.stringify(obj, null, 2);
      showStatus('JSON FORMATTED');
    }
  } catch (e) {
    showStatus('ERR: INVALID JSON');
  }
};

// 2. Base64 编解码
const toggleBase64 = () => {
  try {
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(content.value.trim());
    if (isBase64 && content.value.length > 0) {
      try {
        content.value = atob(content.value);
        showStatus('DECODED BASE64');
        return;
      } catch (e) { /* ignore */
      }
    }
    content.value = btoa(content.value);
    showStatus('ENCODED BASE64');
  } catch (e) {
    showStatus('ERR: BASE64 FAIL');
  }
};

// 3. 复制全部
const copyAll = async () => {
  try {
    await navigator.clipboard.writeText(content.value);
    showStatus('COPIED ALL');
    toast.success('缓冲区内容已复制');
  } catch {
    showStatus('ERR: COPY FAIL');
    toast.error('复制失败，请检查浏览器权限');
  }
};

// 4. 清空
const clearAll = () => {
  showClearConfirm.value = true;
};

const confirmClearAll = () => {
  showClearConfirm.value = false;
  content.value = '';
  showStatus('BUFFER CLEARED');
  toast.success('缓冲区已清空');
};

// === 键盘交互逻辑 ===
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const textarea = textareaRef.value!;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    content.value = content.value.substring(0, start) + '  ' + content.value.substring(end);
    nextTick(() => textarea.selectionStart = textarea.selectionEnd = start + 2);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    showStatus('SAVED');
  }
};

const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  const val = target.value;

  if (val.endsWith('/time')) {
    const now = useDateFormat(useNow(), 'YYYY-MM-DD HH:mm:ss').value;
    content.value = val.slice(0, -5) + now;
    showStatus('TIME INSERTED');
  } else if (val.endsWith('/uuid')) {
    content.value = val.slice(0, -5) + crypto.randomUUID();
    showStatus('UUID GENERATED');
  }
};

onMounted(() => {
  nextTick(() => textareaRef.value?.focus());
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">

      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-7xl h-[85vh] flex flex-col overflow-hidden rounded-xl shadow-2xl transition-all duration-300"
          :class="activeThemeClass"
      >
        <div class="absolute inset-0 z-0 pointer-events-none theme-bg-layer"></div>
        <div class="absolute inset-0 z-0 pointer-events-none theme-overlay-layer"></div>

        <div
            class="relative z-10 flex items-center justify-between px-6 py-3 border-b theme-border bg-opacity-10 select-none theme-header-bg">
          <div class="flex items-center gap-4">
            <button @click="emit('close')"
                    class="group flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-red-500/80 transition-colors">
              <PhX class="w-3 h-3 text-transparent group-hover:text-white" weight="bold"/>
            </button>
            <span class="text-sm font-bold tracking-widest opacity-80 theme-text-accent">TERMINAL // BUFFER</span>
          </div>

          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 text-xs mr-4">
              <PhPaintBucket size="14" class="opacity-50 theme-text"/>
              <select
                  v-model="currentTheme"
                  class="theme-select bg-transparent outline-none cursor-pointer font-bold text-right appearance-none pr-4"
              >
                <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <span class="text-xs font-mono theme-text opacity-60">STATUS: {{ statusMsg }}</span>
          </div>
        </div>

        <div class="relative z-10 flex flex-wrap items-center gap-2 px-6 py-3 border-b theme-border theme-toolbar-bg">
          <button @click="toggleJSON" class="tool-btn" title="Format/Minify JSON">
            <PhBracketsCurly size="16"/>
            <span>JSON</span>
          </button>

          <button @click="toggleBase64" class="tool-btn" title="Base64 Encode/Decode">
            <PhArrowsLeftRight size="16"/>
            <span>Base64</span>
          </button>

          <div class="w-[1px] h-6 bg-current opacity-10 mx-2 theme-text"></div>

          <button @click="copyAll" class="tool-btn" title="Copy Content">
            <PhClipboardText size="16"/>
            <span>Copy</span>
          </button>

          <button @click="clearAll" class="tool-btn hover:!text-red-400 hover:!border-red-400/30" title="Clear Buffer">
            <PhBroom size="16"/>
            <span>Clear</span>
          </button>

          <div class="ml-auto text-[10px] theme-text opacity-40 hidden sm:block font-mono">
            CMD: /time, /uuid, Ctrl+S
          </div>
        </div>

        <div class="terminal-workbench relative z-10 flex-1 min-h-0">
          <aside class="command-panel custom-scrollbar" data-wheel-allow="true">
            <div class="command-panel-head">
              <div>
                <div class="command-panel-title">命令备忘</div>
                <div class="command-panel-sub">{{ terminalState.commands.length }} saved commands</div>
              </div>
              <button class="command-mini-btn" type="button" title="新建命令" aria-label="新建命令" @click="resetCommandForm">
                <PhPlus size="15" weight="bold"/>
              </button>
            </div>

            <div class="command-tabs" role="tablist" aria-label="命令分类">
              <button
                  v-for="category in terminalCommandCategories"
                  :key="category.id"
                  type="button"
                  class="command-tab"
                  :class="activeCommandCategory === category.id ? 'is-active' : ''"
                  @click="activeCommandCategory = category.id"
              >
                {{ category.label }}
              </button>
            </div>

            <div class="command-form">
              <input
                  v-model="commandForm.title"
                  class="command-input"
                  placeholder="标题"
                  spellcheck="false"
              />
              <textarea
                  v-model="commandForm.command"
                  class="command-input command-input--code"
                  placeholder="命令，例如 npm run build"
                  spellcheck="false"
              ></textarea>
              <div class="command-form-row">
                <select v-model="commandForm.category" class="command-input command-select">
                  <option v-for="category in commandCategoryOptions" :key="category.id" :value="category.id">
                    {{ category.label }}
                  </option>
                </select>
                <button class="command-save" type="button" @click="saveCommandMemo">
                  <component :is="editingCommandId ? PhFloppyDisk : PhPlus" size="14" weight="bold"/>
                  <span>{{ editingCommandId ? '更新' : '保存' }}</span>
                </button>
              </div>
              <input
                  v-model="commandForm.description"
                  class="command-input"
                  placeholder="备注"
                  spellcheck="false"
              />
            </div>

            <div class="command-list">
              <div v-if="filteredCommands.length === 0" class="command-empty">
                当前分类暂无命令
              </div>
              <template v-else>
                <div v-for="cmd in filteredCommands" :key="cmd.id" class="command-item">
                  <div class="command-item-main">
                    <div class="command-item-title truncate">{{ cmd.title }}</div>
                    <div class="command-item-code">{{ cmd.command }}</div>
                    <div class="command-item-meta">
                      <span>{{ getTerminalCommandCategoryLabel(cmd.category) }}</span>
                      <span v-if="cmd.description" class="truncate">{{ cmd.description }}</span>
                    </div>
                  </div>
                  <div class="command-actions">
                    <button type="button" title="插入到缓冲区" aria-label="插入到缓冲区" @click="insertCommandMemo(cmd.command)">
                      <PhArrowLineRight size="14" weight="bold"/>
                    </button>
                    <button type="button" title="复制命令" aria-label="复制命令" @click="copyCommandMemo(cmd.command)">
                      <PhCopy size="14" weight="bold"/>
                    </button>
                    <button type="button" title="编辑命令" aria-label="编辑命令" @click="editCommandMemo(cmd.id)">
                      <PhPencilSimple size="14" weight="bold"/>
                    </button>
                    <button type="button" title="删除命令" aria-label="删除命令" @click="deleteCommandMemo(cmd.id)">
                      <PhTrash size="14" weight="bold"/>
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </aside>

          <textarea
              ref="textareaRef"
              v-model="content"
              spellcheck="false"
              class="terminal-buffer flex-1 w-full bg-transparent resize-none outline-none p-6 text-sm md:text-base font-mono leading-relaxed custom-scrollbar theme-text placeholder-opacity-30"
              placeholder="// System Ready.
// Paste your logs, tokens, commands, or JSON here..."
              @keydown="handleKeydown"
              @input="handleInput"
          ></textarea>
        </div>

        <div
            class="relative z-10 px-6 py-2 border-t theme-border bg-opacity-5 text-[10px] flex justify-between theme-text opacity-60 font-mono select-none">
          <div class="flex gap-4">
            <span>Ln {{ content.split('\n').length }}</span>
            <span>Col {{ content.length }}</span>
            <span>Sel {{ textareaRef?.selectionEnd ? textareaRef.selectionEnd - textareaRef.selectionStart : 0 }}</span>
          </div>
          <div class="flex gap-4">
            <span>UTF-8</span>
            <span>{{ activeThemeClass.replace('theme-', '').toUpperCase() }} MODE</span>
          </div>
        </div>

      </div>
    </div>
  </Transition>

  <ConfirmDialog
      :show="showClearConfirm"
      title="清空缓冲区？"
      :message="['这会删除当前缓冲区内容。', '此操作不可撤销。']"
      confirmText="确认清空"
      cancelText="取消"
      :danger="true"
      @confirm="confirmClearAll"
      @cancel="showClearConfirm = false"
  />
</template>

<style scoped>
/* === 下拉菜单修复 === */
.theme-select {
  color: var(--text-color);
  opacity: 0.8;
}

.theme-select:hover {
  opacity: 1;
}

/* 核心修复：强制 option 背景跟随主题色 */
.theme-select option {
  background-color: var(--header-bg); /* 使用头部背景色作为下拉菜单背景 */
  color: var(--text-color);
}

/* === 通用按钮样式 === */
.tool-btn {
  @apply flex items-center gap-2 px-3 py-1.5 rounded-md border border-transparent transition-all duration-200 text-xs font-medium opacity-80 hover:opacity-100 active:scale-95;
  background-color: var(--btn-bg);
  border-color: var(--btn-border);
  color: var(--text-color);
}

.tool-btn:hover {
  background-color: var(--btn-hover-bg);
  box-shadow: 0 0 10px var(--glow-color);
}

.terminal-workbench {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  border-bottom: 1px solid var(--border-color);
}

.command-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  border-right: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--header-bg) 72%, transparent);
}

.command-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.command-panel-title {
  color: var(--text-accent);
  font-size: 13px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.command-panel-sub {
  margin-top: 5px;
  color: var(--text-color);
  opacity: 0.45;
  font-size: 10px;
  line-height: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.command-mini-btn,
.command-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.command-mini-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
}

.command-mini-btn:hover,
.command-actions button:hover {
  color: var(--text-accent);
  background: var(--btn-hover-bg);
}

.command-mini-btn:active,
.command-actions button:active {
  transform: scale(0.94);
}

.command-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.command-tab {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--text-color);
  opacity: 0.65;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  font-size: 11px;
  font-weight: 850;
  transition: opacity 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.command-tab.is-active {
  opacity: 1;
  color: var(--text-accent);
  border-color: var(--text-accent);
}

.command-form {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px;
  border-radius: 12px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
}

.command-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.command-input {
  width: 100%;
  min-width: 0;
  border-radius: 9px;
  padding: 8px 9px;
  color: var(--text-color);
  background: color-mix(in srgb, var(--bg-color) 82%, transparent);
  border: 1px solid var(--btn-border);
  outline: none;
  font-size: 12px;
  line-height: 1.25;
}

.command-input:focus {
  border-color: var(--text-accent);
}

.command-input::placeholder {
  color: var(--text-color);
  opacity: 0.38;
}

.command-input--code {
  min-height: 56px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.command-select {
  appearance: none;
}

.command-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 11px;
  border-radius: 9px;
  color: var(--bg-color);
  background: var(--text-accent);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.command-list {
  display: grid;
  gap: 9px;
}

.command-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  border-radius: 12px;
  color: var(--text-color);
  opacity: 0.45;
  background: var(--btn-bg);
  border: 1px dashed var(--btn-border);
  font-size: 12px;
  font-weight: 850;
}

.command-item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
}

.command-item-main {
  min-width: 0;
}

.command-item-title {
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.15;
  font-weight: 900;
}

.command-item-code {
  margin-top: 6px;
  color: var(--text-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.command-item-meta {
  min-width: 0;
  display: flex;
  gap: 8px;
  margin-top: 7px;
  color: var(--text-color);
  opacity: 0.48;
  font-size: 10px;
  line-height: 1;
}

.command-actions {
  display: grid;
  grid-template-columns: repeat(2, 28px);
  gap: 5px;
  align-content: start;
}

.command-actions button {
  width: 28px;
  height: 28px;
  border-radius: 9px;
}

.terminal-buffer {
  min-width: 0;
  min-height: 0;
}

@media (max-width: 900px) {
  .terminal-workbench {
    grid-template-columns: 1fr;
  }

  .command-panel {
    max-height: 46vh;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }
}

/* === 主题变量定义 === */

/* 1. Standard (IDE/VSCode 风格) - 默认 */
.theme-standard {
  --bg-color: #1e1e1e;
  --header-bg: #252526;
  --text-color: #d4d4d4;
  --text-accent: #4ec9b0;
  --border-color: #3e3e42;
  --btn-bg: #2d2d2d;
  --btn-border: #3e3e42;
  --btn-hover-bg: #37373d;
  --glow-color: transparent;
  --caret-color: #aeafad;
}

/* 2. Retro (CRT 风格) - 怀旧科技 */
.theme-retro {
  --bg-color: #0d0d0d;
  --header-bg: #1a1a1a; /* 修改这里，避免半透明导致option透视问题 */
  --text-color: #33ff00;
  --text-accent: #33ff00;
  --border-color: rgba(51, 255, 0, 0.3);
  --btn-bg: rgba(51, 255, 0, 0.05);
  --btn-border: rgba(51, 255, 0, 0.2);
  --btn-hover-bg: rgba(51, 255, 0, 0.15);
  --glow-color: rgba(51, 255, 0, 0.2);
  --caret-color: #33ff00;
}

/* Retro 特有的辉光 */
.theme-retro .theme-text,
.theme-retro textarea {
  text-shadow: 0 0 4px rgba(51, 255, 0, 0.5);
}

.theme-retro .theme-overlay-layer {
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
  background-size: 100% 2px, 3px 100%;
  opacity: 0.3;
}

.theme-retro .theme-bg-layer {
  background: radial-gradient(circle at center, transparent 0%, #000 130%);
}

/* 3. Cyber (赛博朋克/全息) - 未来感 */
.theme-cyber {
  --bg-color: #050a14;
  --header-bg: #071224; /* 稍微深一点的实色背景，保证文字清晰 */
  --text-color: #00f3ff;
  --text-accent: #ff0055;
  --border-color: rgba(0, 243, 255, 0.3);
  --btn-bg: rgba(0, 243, 255, 0.05);
  --btn-border: rgba(0, 243, 255, 0.2);
  --btn-hover-bg: rgba(0, 243, 255, 0.15);
  --glow-color: rgba(0, 243, 255, 0.3);
  --caret-color: #ff0055;
}

.theme-cyber .theme-bg-layer {
  background-image: linear-gradient(rgba(0, 243, 255, 0.03) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 243, 255, 0.03) 1px, transparent 1px);
  background-size: 20px 20px;
}

.theme-cyber {
  box-shadow: 0 0 30px rgba(0, 243, 255, 0.15);
  border: 1px solid rgba(0, 243, 255, 0.4);
}

/* 4. Paper (亮色护眼) - 极简 */
.theme-paper {
  --bg-color: #f7f6f3;
  --header-bg: #eae9e5;
  --text-color: #37352f;
  --text-accent: #d44c47;
  --border-color: #e0e0e0;
  --btn-bg: #ffffff;
  --btn-border: #d0d0d0;
  --btn-hover-bg: #eaeaea;
  --glow-color: transparent;
  --caret-color: #37352f;
}

/* === CSS 绑定 === */
.theme-standard, .theme-retro, .theme-cyber, .theme-paper {
  background-color: var(--bg-color);
  color: var(--text-color);
  border-color: var(--border-color);
}

.theme-header-bg {
  background-color: var(--header-bg);
}

.theme-border {
  border-color: var(--border-color);
}

.theme-text {
  color: var(--text-color);
}

.theme-text-accent {
  color: var(--text-accent);
}

textarea {
  caret-color: var(--caret-color);
}

/* 滚动条美化 */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--btn-border);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-accent);
}

/* 动画 */
.modal-fade-enter-active, .modal-fade-leave-active {
  transition: all 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
