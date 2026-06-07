<script setup lang="ts">
import {ref, nextTick, onMounted, computed} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore';
import {fetchWithRetry} from '../../../shared/utils/network';

const emit = defineEmits(['close']);
const store = useConfigStore();

// === DOM Refs ===
const inputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

// === State ===
const inputValue = ref('');
const commandHistory = ref<string[]>([]);
const historyIndex = ref(-1);
const isBooting = ref(true);
const isProcessing = ref(false);

// AI 上下文 (多轮对话) - 仅在当前终端会话有效
const aiContext = ref<{ role: string; content: string }[]>([]);

// 日志结构
interface LogLine {
  type: 'cmd' | 'info' | 'success' | 'error' | 'warn' | 'system' | 'ai-stream';
  content: string;
  time?: string;
}

const logs = ref<LogLine[]>([]);

/** -----------------------------------------
 * 终端主题：仅依赖你已有的全局主题变量
 * - 主色：--accent-color / --accent-color-rgb
 * - 文字：--text-primary / --text-secondary
 * - 面板：--widget-surface / --settings-panel 等
 * ----------------------------------------- */
const terminalTheme = computed<'dark' | 'light' | 'hacker'>(() => {
  const t = store.config.runtime?.terminal?.theme;
  if (t === 'light' || t === 'hacker' || t === 'dark') return t;
  return 'dark';
});

/**
 *终端把 “配色” 用 CSS 变量喂进去，不需要额外全局 css。
 * 这里用的是你现有变量：
 * - var(--accent-color-rgb)
 * - var(--widget-surface)
 * - var(--settings-panel)
 * - var(--text-primary/secondary/tertiary)
 */
const terminalStyleVars = computed(() => {
  const theme = terminalTheme.value;

  // 三种模式，只改变“终端背景/面板”风格，主色永远跟随 accent
  if (theme === 'light') {
    return {
      '--term-bg': 'var(--page-fallback)',
      '--term-panel': 'var(--widget-surface-2)',
      '--term-border': 'var(--widget-border)',
      '--term-fg': 'var(--text-primary)',
      '--term-muted': 'var(--text-secondary)',
      '--term-dim': 'var(--text-tertiary)',
      '--term-shadow': 'var(--settings-shadow-soft)',
      '--term-scanline-alpha': '0.20',
      '--term-glow-alpha': '0.10',
    } as Record<string, string>;
  }

  if (theme === 'hacker') {
    // hacker：更深一点、对比更强，但仍跟随 accent（不强制绿）
    return {
      '--term-bg': '#07090a',
      '--term-panel': 'rgba(255,255,255,0.04)',
      '--term-border': 'rgba(255,255,255,0.10)',
      '--term-fg': 'rgba(255,255,255,0.92)',
      '--term-muted': 'rgba(255,255,255,0.70)',
      '--term-dim': 'rgba(255,255,255,0.46)',
      '--term-shadow': '0 22px 60px rgba(0,0,0,0.65)',
      '--term-scanline-alpha': '0.28',
      '--term-glow-alpha': '0.18',
    } as Record<string, string>;
  }

  // dark 默认
  return {
    '--term-bg': '#0c0c0c',
    '--term-panel': 'rgba(255,255,255,0.05)',
    '--term-border': 'rgba(255,255,255,0.10)',
    '--term-fg': 'rgba(255,255,255,0.90)',
    '--term-muted': 'rgba(255,255,255,0.72)',
    '--term-dim': 'rgba(255,255,255,0.46)',
    '--term-shadow': '0 22px 60px rgba(0,0,0,0.65)',
    '--term-scanline-alpha': '0.25',
    '--term-glow-alpha': '0.18',
  } as Record<string, string>;
});

// === 初始化 ===
onMounted(async () => {
  nextTick(() => inputRef.value?.focus());

  const bootSequence = [
    'Initializing VoidTab Kernel...',
    'Loading user configuration...',
    'Mounting file system (read-write)...',
    'Welcome to VoidTab OS. Logged in as root.'
  ];

  for (const line of bootSequence) {
    logs.value.push({type: 'system', content: line});
    await new Promise(r => setTimeout(r, 80));
    scrollToBottom();
  }

  isBooting.value = false;
  nextTick(() => inputRef.value?.focus());
});

const keepFocus = () => {
  if (window.getSelection()?.toString()) return;
  if (!isProcessing.value) inputRef.value?.focus();
};

const scrollToBottom = async () => {
  await nextTick();
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
};

// === 核心逻辑：命令执行 ===
const executeCommand = async () => {
  if (isProcessing.value) return;

  const raw = inputValue.value.trim();
  if (!raw) return;

  logs.value.push({
    type: 'cmd',
    content: raw,
    time: new Date().toLocaleTimeString('en-US', {hour12: false})
  });

  commandHistory.value.push(raw);
  historyIndex.value = commandHistory.value.length;
  inputValue.value = '';

  const args = raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(s => s.replace(/"/g, '')) || [];
  const cmd = args[0]?.toLowerCase();

  try {
    await processCommand(cmd, args);
  } catch (e: any) {
    logs.value.push({type: 'error', content: e.message || 'Unknown error occurred.'});
  }

  await scrollToBottom();
};

const processCommand = async (cmd: string, args: string[]) => {
  switch (cmd) {
    case 'help':
      logs.value.push({
        type: 'info', content: `
VoidTab Shell (v2.4) - Available Commands:
------------------------------------------
  ls [-g ID]             List groups or sites
  open <target>          Smart open site by Name/URL/Group
  search <query>         Web Search (default engine)
  find <keyword>         Local Search (sites & widgets)

  config engine <name>   Set default search engine
  config engine add <name> <url>  Add new engine
  config engine list     List all engines

  ai <prompt>            Ask AI (Context maintained)
  ai --reset             Clear AI context memory
  ai --config            Show AI settings

  theme [light|dark]     Switch UI theme
  term theme [dark|light|hacker]  Switch terminal theme

  clear                  Clear screen
  exit                   Return to GUI mode
`
      });
      break;

    case 'clear':
      logs.value = [];
      break;

    case 'exit':
      logs.value.push({type: 'system', content: 'Terminating session...'});
      setTimeout(() => emit('close'), 500);
      break;

    case 'ls':
      handleLs(args);
      break;

    case 'open':
      handleOpen(args);
      break;

    case 'theme':
      handleTheme(args);
      break;

    case 'term':
      handleTerm(args);
      break;

    case 'config':
      handleConfig(args);
      break;

    case 'search':
      handleWebSearch(args);
      break;

    case 'find':
      handleLocalFind(args);
      break;

    case 'ai':
      await handleAi(args);
      break;

    case 'mv':
      handleMv(args);
      break;

    default:
      throw new Error(`Command not found: ${cmd}`);
  }
};

const handleLs = (args: string[]) => {
  if (args[1] === '-g' && args[2]) {
    const group = store.config.layout.find((g: any) => g.id == args[2]);
    if (!group) throw new Error(`Group ${args[2]} not found.`);
    logs.value.push({type: 'success', content: `Directory: ${group.title} (${group.id})`});
    group.items.forEach((item: any) => {
      logs.value.push({
        type: 'info',
        content: `  - ${item.title || 'Untitled'} [${item.kind || 'site'}] (${item.url || ''})`
      });
    });
  } else {
    logs.value.push({type: 'success', content: 'Layout Groups:'});
    store.config.layout.forEach((g: any) => {
      logs.value.push({type: 'info', content: `drwxr-xr-x  root  root  ${g.id}  ${g.title} (${g.items.length} items)`});
    });
  }
};

const handleOpen = (args: string[]) => {
  const target = args.slice(1).join(' ').trim();
  if (!target) throw new Error('Usage: open <name_or_url>');

  if (target.match(/^(http|https|www\.)/i) || target.includes('.com') || target.includes('.cn')) {
    let url = target;
    if (!url.startsWith('http')) url = 'https://' + url;
    window.open(url, '_blank');
    logs.value.push({type: 'success', content: `Opened URL: ${url}`});
    return;
  }

  const groupMatch = store.config.layout.find((g: any) => g.title.toLowerCase() === target.toLowerCase());
  if (groupMatch) {
    logs.value.push({type: 'info', content: `Group "${groupMatch.title}" contains:`});
    groupMatch.items.forEach((item: any) => {
      logs.value.push({type: 'info', content: `  - ${item.title} (${item.url})`});
    });
    return;
  }

  let found: any = null;
  for (const group of store.config.layout) {
    const exact = group.items.find((item: any) => item.title && item.title.toLowerCase() === target.toLowerCase());
    if (exact) {
      found = exact;
      break;
    }
  }
  if (!found) {
    for (const group of store.config.layout) {
      const fuzzy = group.items.find((item: any) => item.title && item.title.toLowerCase().includes(target.toLowerCase()));
      if (fuzzy) {
        found = fuzzy;
        break;
      }
    }
  }

  if (found && found.url) {
    window.open(found.url, '_blank');
    logs.value.push({type: 'success', content: `Opening: ${found.title}`});
  } else {
    throw new Error(`Target "${target}" not found.`);
  }
};

const handleLocalFind = (args: string[]) => {
  const keyword = args.slice(1).join(' ').toLowerCase();
  if (!keyword) throw new Error('Usage: find <keyword>');

  let count = 0;
  logs.value.push({type: 'info', content: `Searching "${keyword}"...`});

  store.config.layout.forEach((group: any) => {
    if (group.title.toLowerCase().includes(keyword)) {
      logs.value.push({type: 'success', content: `[GROUP] ${group.title} (${group.id})`});
      count++;
    }
    group.items.forEach((item: any) => {
      if ((item.title && item.title.toLowerCase().includes(keyword)) || (item.url && item.url.toLowerCase().includes(keyword))) {
        logs.value.push({
          type: 'info',
          content: `  └─ [${item.kind}] ${item.title} - ${item.url || 'Widget'} (in ${group.title})`
        });
        count++;
      }
    });
  });

  if (count === 0) logs.value.push({type: 'warn', content: 'No matches.'});
};

const handleWebSearch = (args: string[]) => {
  const query = args.slice(1).join(' ');
  if (!query) throw new Error('Usage: search <keywords>');
  const engine = store.config.searchEngines.find((e: any) => e.id === store.config.currentEngineId);
  if (engine) {
    window.open(engine.url + encodeURIComponent(query), '_blank');
    logs.value.push({type: 'success', content: `Searching via ${engine.name}...`});
  } else {
    throw new Error('No default search engine.');
  }
};

const handleConfig = (args: string[]) => {
  const subCmd = args[1];

  if (subCmd === 'engine') {
    if (args[2] === 'list') {
      logs.value.push({type: 'info', content: 'Available Search Engines:'});
      store.config.searchEngines.forEach((e: any) => {
        const isCurrent = e.id === store.config.currentEngineId ? '*' : ' ';
        logs.value.push({type: 'info', content: ` [${isCurrent}] ${e.name} (${e.id}) - ${e.url}`});
      });
      return;
    }

    if (args[2] === 'add') {
      const name = args[3];
      const url = args[4];
      if (!name || !url) throw new Error('Usage: config engine add <name> <url>');
      store.addEngine(name, url);
      logs.value.push({type: 'success', content: `Engine "${name}" added.`});
      return;
    }

    const target = args[2]?.toLowerCase();
    if (!target) throw new Error('Usage: config engine <name|list|add>');

    const engine = store.config.searchEngines.find((e: any) =>
        e.id === target || e.name.toLowerCase().includes(target)
    );

    if (!engine) throw new Error(`Engine "${target}" not found.`);

    store.config.currentEngineId = engine.id;
    store.saveConfig();
    logs.value.push({type: 'success', content: `Default engine set to: ${engine.name}`});
  } else {
    throw new Error('Unknown config. Try: config engine <name>');
  }
};

const handleTheme = (args: string[]) => {
  const mode = args[1];
  if (mode !== 'light' && mode !== 'dark') throw new Error('Usage: theme [light|dark]');
  store.config.theme.mode = mode as any;
  store.saveConfig();

  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(mode);

  logs.value.push({type: 'success', content: `Theme: ${mode}`});
};

const handleTerm = (args: string[]) => {
  if (args[1] !== 'theme') throw new Error('Usage: term theme [dark|light|hacker]');
  const t = args[2] as any;
  if (t !== 'dark' && t !== 'light' && t !== 'hacker') throw new Error('Usage: term theme [dark|light|hacker]');

  if (!store.config.runtime.terminal) {
    store.config.runtime.terminal = {history: [], theme: 'dark', isOpen: true};
  }
  store.config.runtime.terminal.theme = t;
  store.saveConfig();
  logs.value.push({type: 'success', content: `Terminal theme: ${t}`});
};

const handleMv = (args: string[]) => {
  if (args[1] === 'group') {
    const id = args[2];
    const name = args.slice(3).join(' ');
    if (!id || !name) throw new Error('Usage: mv group <id> <new_name>');
    store.updateGroup(id, {title: name});
    logs.value.push({type: 'success', content: `Group renamed to "${name}"`});
  } else {
    throw new Error('Usage: mv group <id> <name>');
  }
};

const handleAi = async (args: string[]) => {
  const arg1 = args[1];

  if (arg1 === '--reset') {
    aiContext.value = [];
    logs.value.push({type: 'success', content: 'AI Context cleared.'});
    return;
  }

  if (arg1 === '--config') {
    logs.value.push({type: 'info', content: 'Current Configuration:'});
    logs.value.push({type: 'info', content: `  URL: ${store.config.ai.baseUrl || '(unset)'}`});
    logs.value.push({type: 'info', content: `  Model: ${store.config.ai.model || '(unset)'}`});
    logs.value.push({type: 'warn', content: 'To change, edit store.config.ai manually or use GUI settings.'});
    return;
  }

  const prompt = args.slice(1).join(' ');
  if (!prompt) throw new Error('Usage: ai <prompt> (or --reset)');

  const {apiKey, baseUrl, model} = store.config.ai;
  if (!baseUrl) throw new Error('AI Base URL missing.');
  if (!apiKey && !baseUrl.includes('localhost')) throw new Error('AI API Key missing.');

  isProcessing.value = true;
  logs.value.push({type: 'info', content: 'Thinking...'});

  aiContext.value.push({role: 'user', content: prompt});

  const logIndex = logs.value.length;
  logs.value.push({type: 'ai-stream', content: ''});

  try {
    let endpoint = baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint += '/chat/completions';

    const contextToSend = aiContext.value.slice(-6);

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`},
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          {role: "system", content: "You are a helpful assistant running in a Linux terminal. Keep answers concise."},
          ...contextToSend
        ],
        stream: true
      })
    }, {
      timeoutMs: 30000,
      retries: 1,
      retryDelayMs: 800,
      maxRetryDelayMs: 3000,
      metricName: 'terminal.ai.stream',
      fallbackName: 'terminal.ai.unavailable',
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';

    while (true) {
      const {done, value} = await reader!.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content || '';
            fullText += content;
            logs.value[logIndex].content = fullText;
            scrollToBottom();
          } catch {
          }
        }
      }
    }

    aiContext.value.push({role: 'assistant', content: fullText});
  } catch (e: any) {
    logs.value.push({type: 'error', content: e.message});
    aiContext.value.pop();
  } finally {
    isProcessing.value = false;
    nextTick(() => inputRef.value?.focus());
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (isProcessing.value) {
    e.preventDefault();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex.value > 0) {
      historyIndex.value--;
      inputValue.value = commandHistory.value[historyIndex.value];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex.value < commandHistory.value.length - 1) {
      historyIndex.value++;
      inputValue.value = commandHistory.value[historyIndex.value];
    } else {
      historyIndex.value = commandHistory.value.length;
      inputValue.value = '';
    }
  } else if (e.key === 'c' && e.ctrlKey) {
    logs.value.push({type: 'info', content: '^C'});
    inputValue.value = '';
  }
};
</script>

<template>
  <div class="vt-term" :style="terminalStyleVars" @click="keepFocus">
    <div class="vt-term__scanlines pointer-events-none"></div>
    <div class="vt-term__glow pointer-events-none"></div>

    <div ref="containerRef" class="vt-term__body custom-scroll space-y-1">
      <div v-for="(log, idx) in logs" :key="idx" class="vt-term__line">
        <span v-if="log.time" class="vt-term__time">[{{ log.time }}]</span>

        <template v-if="log.type === 'system'">
          <span class="vt-term__sys">[SYS]</span>
          <span class="vt-term__muted">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'cmd'">
          <span class="vt-term__prompt">root@voidtab:~#</span>
          <span class="vt-term__cmd">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'error'">
          <span class="vt-term__err">Error:</span>
          <span class="vt-term__errMsg">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'success'">
          <span class="vt-term__ok">✔ {{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'ai-stream'">
          <div class="vt-term__ai">
            <span class="vt-term__aiTitle">🤖 AI Assistant:</span>
            <span class="whitespace-pre-wrap">{{ log.content }}</span>
            <span v-if="isProcessing" class="vt-term__aiCaret animate-pulse"></span>
          </div>
        </template>

        <template v-else>
          <span class="whitespace-pre-wrap vt-term__text">{{ log.content }}</span>
        </template>
      </div>

      <div v-if="!isBooting" class="vt-term__inputRow">
        <span class="vt-term__prompt">root@voidtab:~#</span>
        <input
            ref="inputRef"
            v-model="inputValue"
            type="text"
            class="vt-term__input"
            :class="{ 'opacity-50 cursor-not-allowed': isProcessing }"
            spellcheck="false"
            autocomplete="off"
            :disabled="isProcessing"
            @keydown.enter="executeCommand"
            @keydown="onKeyDown"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 根容器：完全用变量，不写死主题 */
.vt-term {
  position: fixed;
  inset: 0;
  z-index: 9999;

  background: var(--term-bg);
  color: var(--term-fg);

  font-family: var(--tech-font-family), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  "Liberation Mono", "Courier New", monospace;

  display: flex;
  flex-direction: column;

  /*提升清晰度 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: geometricPrecision;
}

/* 滚动区 */
.vt-term__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
  z-index: 1;
}

/* 行 */
.vt-term__line {
  word-break: break-word;
  line-height: 1.55;

  /*只做透明度，不要 transform（transform 会让字发虚） */
  animation: vtFadeIn 0.12s ease-out;
}

@keyframes vtFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 文本色系 */
.vt-term__time {
  color: var(--term-dim);
  margin-right: 8px;
  user-select: none;
}

.vt-term__muted { color: var(--term-muted); }

.vt-term__sys {
  color: rgba(var(--accent-color-rgb), 0.92);
  font-weight: 800;
  letter-spacing: 0.5px;
}

/* prompt / caret：默认主题色 */
.vt-term__prompt {
  color: var(--accent-color);
  font-weight: 800;
  flex-shrink: 0;
}

.vt-term__cmd {
  margin-left: 8px;
  color: var(--term-fg);
  font-weight: 800;
}

.vt-term__text { color: var(--term-fg); }

.vt-term__ok { color: rgba(34, 197, 94, 0.95); }

.vt-term__err {
  color: rgba(239, 68, 68, 0.95);
  font-weight: 800;
}

.vt-term__errMsg {
  color: rgba(248, 113, 113, 0.95);
  margin-left: 6px;
}

/* AI 块：用主题色做边 */
.vt-term__ai {
  margin-top: 6px;
  padding: 10px 12px;
  background: var(--term-panel);
  border: 1px solid var(--term-border);
  border-left: 3px solid rgba(var(--accent-color-rgb), 0.88);
  border-radius: 12px;
  box-shadow: var(--term-shadow);
}

.vt-term__aiTitle {
  display: block;
  margin-bottom: 6px;
  color: rgba(var(--accent-color-rgb), 0.92);
  font-weight: 800;
}

.vt-term__aiCaret {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: rgba(var(--accent-color-rgb), 0.92);
  vertical-align: middle;
  margin-left: 4px;
}

/* 输入行 */
.vt-term__inputRow {
  display: flex;
  align-items: center;
  padding-top: 10px;
}

.vt-term__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  margin-left: 8px;
  color: var(--term-fg);
  font-weight: 800;
  caret-color: var(--accent-color);
}

/*扫描线：改成更细、更弱（不会糊字） */
.vt-term__scanlines {
  position: fixed;
  inset: 0;
  z-index: 2;

  background: repeating-linear-gradient(
      to bottom,
      rgba(255,255,255,0.00) 0px,
      rgba(255,255,255,0.00) 2px,
      rgba(0,0,0,0.25) 3px,
      rgba(0,0,0,0.25) 4px
  );

  /*默认更低，真正要强烈再调 */
  opacity: var(--term-scanline-alpha, 0.10);
}

/*光晕：也降低点，避免雾化 */
.vt-term__glow {
  position: fixed;
  inset: 0;
  z-index: 1;
  box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.85);
  background: radial-gradient(
      circle,
      rgba(var(--accent-color-rgb), var(--term-glow-alpha, 0.12)) 0%,
      rgba(0, 0, 0, 0) 78%
  );
}

/* 减少动态效果时禁用 */
@media (prefers-reduced-motion: reduce) {
  .vt-term__line { animation: none !important; }
}

</style>
