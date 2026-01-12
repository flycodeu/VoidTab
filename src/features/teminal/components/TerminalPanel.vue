<script setup lang="ts">
import {ref, nextTick, onMounted} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore';
//import {useHistoryStore} from '../../../stores/useHistoryStore';

const emit = defineEmits(['close']);
const store = useConfigStore();
//const historyStore = useHistoryStore();

// === DOM Refs ===
const inputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

// === State ===
const inputValue = ref('');
const commandHistory = ref<string[]>([]);
const historyIndex = ref(-1);
const isBooting = ref(true);
const isProcessing = ref(false); // 正在处理任务（如AI生成中），此时锁定输入

// AI 上下文 (多轮对话) - 仅在当前终端会话有效
const aiContext = ref<{ role: string; content: string }[]>([]);

// 日志结构
interface LogLine {
  type: 'cmd' | 'info' | 'success' | 'error' | 'warn' | 'system' | 'ai-stream';
  content: string;
  time?: string;
}

const logs = ref<LogLine[]>([]);

// === 初始化 ===
onMounted(async () => {
  nextTick(() => inputRef.value?.focus());

  // 简化的 Boot 动画
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
  if (isProcessing.value) return; // 锁定状态不可输入

  const raw = inputValue.value.trim();
  if (!raw) return;

  // 1. UI 反馈
  logs.value.push({
    type: 'cmd',
    content: raw,
    time: new Date().toLocaleTimeString('en-US', {hour12: false})
  });

  // 2. 历史记录
  commandHistory.value.push(raw);
  historyIndex.value = commandHistory.value.length;
  inputValue.value = '';

  // 3. 解析
  const args = raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(s => s.replace(/"/g, '')) || [];
  const cmd = args[0]?.toLowerCase();

  try {
    await processCommand(cmd, args);
  } catch (e: any) {
    logs.value.push({type: 'error', content: e.message || 'Unknown error occurred.'});
  }

  await scrollToBottom();
};

// --- 命令处理中心 ---
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
  mv <type> <id> <name>  Rename group/site
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

      // ✅ 增强：引擎配置
    case 'config':
      handleConfig(args);
      break;

    case 'search':
      handleWebSearch(args);
      break;

    case 'find':
      handleLocalFind(args);
      break;

      // ✅ 增强：多轮对话 AI
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

// === 具体实现 ===

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

  let found = null;
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

// 🌟 配置引擎：支持列表、切换、新增
const handleConfig = (args: string[]) => {
  const subCmd = args[1];

  if (subCmd === 'engine') {
    // 1. config engine list
    if (args[2] === 'list') {
      logs.value.push({type: 'info', content: 'Available Search Engines:'});
      store.config.searchEngines.forEach((e: any) => {
        const isCurrent = e.id === store.config.currentEngineId ? '*' : ' ';
        logs.value.push({type: 'info', content: ` [${isCurrent}] ${e.name} (${e.id}) - ${e.url}`});
      });
      return;
    }

    // 2. config engine add <name> <url>
    if (args[2] === 'add') {
      const name = args[3];
      const url = args[4];
      if (!name || !url) throw new Error('Usage: config engine add <name> <url>');

      store.addEngine(name, url); // 假设 store 有此方法，如果没有需自行实现
      logs.value.push({type: 'success', content: `Engine "${name}" added.`});
      return;
    }

    // 3. config engine <name> (Switch)
    const target = args[2]?.toLowerCase();
    if (!target) {
      throw new Error('Usage: config engine <name|list|add>');
    }

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
  if (mode !== 'light' && mode !== 'dark' && mode !== 'system') throw new Error('Usage: theme [light|dark|system]');
  store.config.theme.mode = mode;
  store.saveConfig();
  logs.value.push({type: 'success', content: `Theme: ${mode}`});
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

// 🌟 核心：AI 增强逻辑 (多轮对话 + 实时流)
const handleAi = async (args: string[]) => {
  const arg1 = args[1];

  // 1. 重置上下文
  if (arg1 === '--reset') {
    aiContext.value = [];
    logs.value.push({type: 'success', content: 'AI Context cleared.'});
    return;
  }

  // 2. 查看配置
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

  // 添加用户消息到上下文
  aiContext.value.push({role: 'user', content: prompt});

  // 创建流式日志行
  const logIndex = logs.value.length;
  logs.value.push({type: 'ai-stream', content: ''});

  try {
    let endpoint = baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint += '/chat/completions';

    // 限制历史上下文长度，防止 Token 溢出
    const contextToSend = aiContext.value.slice(-6); // 只带最近6条

    const response = await fetch(endpoint, {
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
          } catch (e) {
          }
        }
      }
    }
    // 对话完成后，将 AI 回复加入上下文，实现多轮记忆
    aiContext.value.push({role: 'assistant', content: fullText});

  } catch (e: any) {
    logs.value.push({type: 'error', content: e.message});
    // 出错则移除刚才的用户提问，保持上下文干净
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
  <div
      class="fixed inset-0 z-[9999] bg-[#0c0c0c] text-[#cccccc] font-mono text-sm sm:text-base flex flex-col"
      @click="keepFocus"
  >
    <div class="scanlines pointer-events-none fixed inset-0 z-50"></div>
    <div class="glow pointer-events-none fixed inset-0 z-40"></div>

    <div ref="containerRef" class="flex-1 overflow-y-auto p-4 sm:p-8 space-y-1 relative z-10 custom-scrollbar">

      <div v-for="(log, idx) in logs" :key="idx" class="break-words leading-relaxed animate-fade-in">
        <span v-if="log.time" class="text-gray-600 mr-2 select-none">[{{ log.time }}]</span>

        <template v-if="log.type === 'system'">
          <span class="text-blue-400 font-bold">[SYS]</span>
          <span class="ml-2 text-gray-400">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'cmd'">
          <span class="text-[#00ff00] font-bold">root@voidtab:~#</span>
          <span class="ml-2 text-white font-bold">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'error'">
          <span class="text-red-500 font-bold">Error:</span>
          <span class="text-red-400 ml-1">{{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'success'">
          <span class="text-green-400">✔ {{ log.content }}</span>
        </template>

        <template v-else-if="log.type === 'ai-stream'">
          <div class="mt-1 p-2 border-l-2 border-purple-500 bg-[#1a1a1a] text-gray-300">
            <span class="text-purple-400 font-bold block mb-1">🤖 AI Assistant:</span>
            <span class="whitespace-pre-wrap">{{ log.content }}</span>
            <span class="inline-block w-2 h-4 bg-purple-500 align-middle animate-pulse" v-if="isProcessing"></span>
          </div>
        </template>

        <template v-else>
          <span class="whitespace-pre-wrap text-gray-300">{{ log.content }}</span>
        </template>
      </div>

      <div v-if="!isBooting" class="flex items-center pt-2">
        <span class="text-[#00ff00] font-bold shrink-0">root@voidtab:~#</span>
        <input
            ref="inputRef"
            v-model="inputValue"
            type="text"
            class="flex-1 bg-transparent border-none outline-none text-white ml-2 caret-[#00ff00] font-bold"
            :class="{'opacity-50 cursor-not-allowed': isProcessing}"
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
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap');

div {
  font-family: 'Fira Code', 'Courier New', monospace;
}

.animate-fade-in {
  animation: fadeIn 0.1s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 0;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #000;
}

.scanlines {
  background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 0) 50%,
      rgba(0, 0, 0, 0.2) 50%,
      rgba(0, 0, 0, 0.2)
  );
  background-size: 100% 4px;
  opacity: 0.6;
}

.glow {
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.9);
  background: radial-gradient(circle, rgba(0, 255, 0, 0.02) 0%, rgba(0, 0, 0, 0) 80%);
}
</style>