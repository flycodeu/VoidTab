<script setup lang="ts">
import {ref, computed, onMounted, nextTick, watch} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useAiStore} from '../../../stores/useAiStores.ts';
import {
  PhPaperPlaneRight, PhPlus, PhTrash, PhX, PhDownloadSimple,
  PhChatCircleText, PhRobot, PhUser, PhCopy, PhGear, PhCaretDown, PhPencilSimple,
  PhWarning, PhFloppyDisk, PhCheckCircle
} from '@phosphor-icons/vue';

// 🟢 引入自定义弹窗组件
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';

// 🔒 XSS 防护
import DOMPurify from 'dompurify';
import {fetchWithRetry} from '../../../shared/utils/network';
import {useToast} from '../../../shared/composables/useToast';

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/atom-one-dark.css';
import {useEscapeClose} from '../../../shared/composables/useEscapeClose';

const props = defineProps<{
  isOpen: boolean;
  initialQuery?: string;
}>();
const emit = defineEmits(['close']);
useEscapeClose(() => props.isOpen, () => emit('close'));

const configStore = useConfigStore();
const aiStore = useAiStore();
const toast = useToast();

const userInput = ref('');
const isSending = ref(false);
const showSettings = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const mdRenderer = ref<MarkdownIt | null>(null);

// 🟢 弹窗与保存状态
const showKeyAlert = ref(false);
const showClearHistoryConfirm = ref(false);
const alertMessage = ref('');
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle');

const PRESETS = [
  {name: 'DeepSeek (官方)', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat'},
  {name: 'DeepSeek (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3'},
  {name: 'OpenAI (官方)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o'},
  {name: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k'},
  {name: 'Local (Ollama)', baseUrl: 'http://localhost:11434/v1', model: 'llama3'},
  {name: '自定义 (Custom)', baseUrl: '', model: '', isCustom: true}
];

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

// 应用预设 (只填充，不保存)
const applyPreset = (preset: any) => {
  if (preset.isCustom) {
    configStore.config.ai.baseUrl = '';
    configStore.config.ai.model = '';
  } else {
    configStore.config.ai.baseUrl = preset.baseUrl;
    configStore.config.ai.model = preset.model;
  }
};

// 手动保存配置
const handleManualSave = async () => {
  saveStatus.value = 'saving';
  await configStore.saveConfig();
  setTimeout(() => {
    saveStatus.value = 'saved';
    setTimeout(() => {
      saveStatus.value = 'idle';
    }, 2000);
  }, 500);
};

// 打开设置并聚焦
const openSettingsAndFocus = () => {
  showKeyAlert.value = false;
  showSettings.value = true;
};

const confirmClearHistory = () => {
  showClearHistoryConfirm.value = false;
  aiStore.clearHistory();
  aiStore.createSession();
};

onMounted(async () => {
  // 兜底逻辑：如果 store 里还是空的，初始化一个
  if (!configStore.config.ai) {
    configStore.config.ai = {
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxHistory: 10
    };
  }

  aiStore.loadHistory();
  if (aiStore.sessions.length === 0) {
    aiStore.createSession();
  }

  mdRenderer.value = new MarkdownIt({
    html: false, linkify: true, typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(str, {
            language: lang,
            ignoreIllegals: true
          }).value}</code></pre>`;
        } catch (__) {
        }
      }
      return `<pre class="hljs"><code>${mdRenderer.value?.utils.escapeHtml(str)}</code></pre>`;
    }
  });
});

const currentSession = computed(() => aiStore.sessions.find(s => s.id === aiStore.currentSessionId));
const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
};
watch(() => currentSession.value?.messages.length, scrollToBottom);
watch(() => aiStore.currentSessionId, scrollToBottom);

// 发送逻辑
const sendMessage = async () => {
  const text = userInput.value.trim();
  const {apiKey, baseUrl, model, maxHistory} = configStore.config.ai;

  if (!text) return;

  // 🟢 校验逻辑：使用弹窗
  if (!baseUrl) {
    alertMessage.value = '请先配置接口地址 (Base URL)';
    showKeyAlert.value = true;
    return;
  }
  if (!apiKey && !baseUrl.includes('localhost')) {
    alertMessage.value = '检测到未配置 API Key，无法发送请求。';
    showKeyAlert.value = true;
    return;
  }

  if (!currentSession.value) aiStore.createSession();
  aiStore.addMessage(aiStore.currentSessionId, 'user', text);
  userInput.value = '';
  isSending.value = true;
  await scrollToBottom();

  const history = currentSession.value!.messages
      .filter(m => m.status !== 'error')
      .slice(-maxHistory)
      .map(m => ({role: m.role, content: m.content}));

  const aiMsg = aiStore.addMessage(aiStore.currentSessionId, 'assistant', '');
  const aiMsgId = aiMsg!.id;
  let fullContent = '';

  try {
    let endpoint = baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = `${endpoint}/chat/completions`;
    }

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{role: "system", content: "You are a helpful assistant."}, ...history],
        stream: true
      })
    }, {
      timeoutMs: 30000,
      retries: 1,
      retryDelayMs: 800,
      maxRetryDelayMs: 3000,
      metricName: 'ai.chat.stream',
      fallbackName: 'ai.chat.unavailable',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error ${response.status}: ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');

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
            fullContent += content;
            aiStore.updateMessageContent(aiStore.currentSessionId, aiMsgId, fullContent, 'loading');
            if (fullContent.length % 10 === 0) scrollToBottom();
          } catch (e) {
          }
        }
      }
    }
    aiStore.updateMessageContent(aiStore.currentSessionId, aiMsgId, fullContent, 'done');
  } catch (e: any) {
    const message = e instanceof Error ? e.message : '未知错误';
    aiStore.updateMessageContent(aiStore.currentSessionId, aiMsgId, `请求失败: ${message}`, 'error');
    toast.error('AI 请求失败，请检查网络或接口配置。', {
      duration: 8000,
      action: {
        label: '重试',
        handler: () => {
          userInput.value = text;
          return sendMessage();
        }
      }
    });
  } finally {
    isSending.value = false;
    scrollToBottom();
  }
};

// XSS 防护：使用 DOMPurify 清理 HTML
const renderMd = (text: string) => {
  if (!mdRenderer.value) return text;
  const html = mdRenderer.value.render(text);

  // 配置允许的标签和属性白名单
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div'
    ],
    ALLOWED_ATTR: ['href', 'title', 'class', 'src', 'alt', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i
  });
};
const copyText = (text: string) => navigator.clipboard.writeText(text);

watch(() => props.isOpen, async (val) => {
  if (val && props.initialQuery) {
    // 等待 DOM 和 Store 准备好
    await nextTick();

    // 1. 确保有会话
    if (!aiStore.currentSessionId) {
      aiStore.createSession();
    }

    // 2. 填入问题并发送
    userInput.value = props.initialQuery;

    // 3. 调用你原本写好的发送函数
    await sendMessage();
  }
});
</script>

<template>
  <div
      v-if="isOpen"
      class="fixed inset-0 z-[100] flex justify-end bg-black/20 backdrop-blur-[2px]"
      @click.self="emit('close')"
  >
    <div
        class="w-full md:w-[900px] h-full bg-[#f5f5f7] dark:bg-[#121212] shadow-2xl flex overflow-hidden border-l border-white/10 transition-transform duration-300">

      <div
          class="w-72 bg-gray-50 dark:bg-[#1a1a1a] flex flex-col border-r border-gray-200 dark:border-white/5 transition-all">
        <div class="p-4 border-b border-gray-200 dark:border-white/5 flex items-center justify-between shrink-0">
          <span class="font-bold text-sm">对话列表</span>
          <button @click="aiStore.createSession()"
                  class="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition">
            <PhPlus size="16"/>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div
              v-for="session in aiStore.sessions" :key="session.id"
              @click="aiStore.currentSessionId = session.id"
              class="group p-3 rounded-xl cursor-pointer text-sm transition-all flex items-center justify-between"
              :class="aiStore.currentSessionId === session.id ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'"
          >
            <div class="truncate flex-1 pr-2">{{ session.title }}</div>
            <button @click.stop="aiStore.deleteSession(session.id)"
                    class="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition">
              <PhTrash size="14"/>
            </button>
          </div>
        </div>

        <div class="border-t border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-[#151515]">
          <button @click="showSettings = !showSettings"
                  class="w-full flex items-center justify-between p-3 text-xs font-bold opacity-70 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/5">
            <span class="flex items-center gap-2"><PhGear size="14"/> 模型配置</span>
            <PhCaretDown class="transition-transform" :class="showSettings ? 'rotate-180' : ''" size="14"/>
          </button>

          <div v-show="showSettings" class="p-3 space-y-3 animate-fade-in pb-6">
            <div class="grid grid-cols-2 gap-2">
              <button v-for="p in PRESETS" :key="p.name" @click="applyPreset(p)"
                      class="px-2 py-1.5 text-[10px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded truncate hover:border-[var(--accent-color)] transition text-left flex items-center gap-1"
                      :title="p.name">
                <PhPencilSimple v-if="p.isCustom" size="10"/>
                {{ p.name }}
              </button>
            </div>

            <div class="space-y-2 pt-2 border-t border-gray-200 dark:border-white/5">
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">Base URL</label>
                <input v-model="configStore.config.ai.baseUrl" type="text" placeholder="https://..."
                       class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors"/>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">Model</label>
                <input v-model="configStore.config.ai.model" type="text"
                       class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors"/>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">API Key</label>
                <input v-model="configStore.config.ai.apiKey" type="password" placeholder="sk-..."
                       class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors"/>
              </div>

              <div class="pt-2">
                <button
                    @click="handleManualSave"
                    :disabled="saveStatus === 'saving'"
                    class="w-full py-2 text-xs rounded font-bold flex items-center justify-center gap-2 transition-all"
                    :class="saveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-[var(--accent-color)] text-white hover:brightness-110'"
                >
                  <component :is="saveStatus === 'saved' ? PhCheckCircle : PhFloppyDisk" size="16" weight="bold"/>
                  <span>{{ saveStatus === 'saved' ? '已保存配置' : '保存配置' }}</span>
                </button>
              </div>
            </div>

            <div class="flex gap-2 pt-1 mt-2 border-t border-gray-200 dark:border-white/5 pt-2">
              <button @click="aiStore.exportData()"
                      class="flex-1 py-1.5 text-xs bg-white dark:bg-white/5 rounded flex items-center justify-center gap-1 hover:brightness-95 border border-gray-200 dark:border-white/10">
                <PhDownloadSimple/>
                导出
              </button>
              <button @click="showClearHistoryConfirm = true"
                      class="flex-1 py-1.5 text-xs bg-red-500/10 text-red-500 rounded flex items-center justify-center gap-1 hover:bg-red-500/20">
                <PhTrash/>
                清空
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 flex flex-col relative bg-white dark:bg-[#121212]">
        <div class="h-14 border-b border-gray-100 dark:border-white/5 flex items-center justify-between px-6 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" v-if="isSending"></div>
            <span class="font-bold">{{ currentSession?.title || '新对话' }}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 opacity-60 font-mono">{{
                configStore.config.ai.model || '未配置'
              }}</span>
          </div>
          <button @click="emit('close')" class="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition">
            <PhX size="20"/>
          </button>
        </div>

        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth">
          <template v-if="currentSession && currentSession.messages.length > 0">
            <div v-for="msg in currentSession.messages" :key="msg.id" class="flex gap-4"
                 :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'">
              <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                   :class="msg.role === 'user' ? 'bg-gray-200 dark:bg-white/10' : 'bg-[var(--accent-color)] text-white'">
                <component :is="msg.role === 'user' ? PhUser : PhRobot" size="18" weight="fill"/>
              </div>
              <div class="max-w-[85%] group relative">
                <div class="py-3 px-4 rounded-2xl text-sm leading-relaxed shadow-sm overflow-hidden"
                     :class="[msg.role === 'user' ? 'bg-[var(--accent-color)] text-white rounded-tr-sm' : 'bg-gray-50 dark:bg-[#1e1e1e] border border-gray-100 dark:border-white/5 rounded-tl-sm markdown-body', msg.status === 'error' ? 'border-red-500/50 bg-red-500/5' : '']">
                  <div v-if="msg.status === 'loading' && !msg.content" class="flex gap-1 py-1">
                    <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                    <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100"></div>
                    <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200"></div>
                  </div>
                  <div v-if="msg.role === 'user'">{{ msg.content }}</div>
                  <div v-else v-html="renderMd(msg.content)"></div>
                </div>
                <button @click="copyText(msg.content)"
                        class="absolute top-2 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-lg bg-white/80 dark:bg-black/80 backdrop-blur shadow-sm text-xs"
                        :class="msg.role === 'user' ? '-left-8' : '-right-8'">
                  <PhCopy/>
                </button>
              </div>
            </div>
          </template>
          <div v-else class="h-full flex flex-col items-center justify-center opacity-40 gap-4 select-none">
            <PhChatCircleText size="64" weight="thin"/>
            <div class="text-center"><p>开始新的对话</p>
              <p class="text-xs mt-2 opacity-60">AI Content may be inaccurate</p></div>
          </div>
        </div>

        <div class="p-4 md:p-6 bg-white dark:bg-[#121212]">
          <div
              class="relative rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-[var(--accent-color)] transition-all">
            <textarea v-model="userInput" @keydown.enter.prevent="!isSending && sendMessage()"
                      placeholder="输入消息... (Enter 发送)"
                      class="w-full bg-transparent p-4 min-h-[50px] max-h-[150px] resize-none outline-none text-sm"
                      rows="1"></textarea>
            <button @click="sendMessage" :disabled="!userInput.trim() || isSending"
                    class="absolute right-2 bottom-2 p-2 rounded-xl bg-[var(--accent-color)] text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:brightness-110">
              <PhPaperPlaneRight weight="fill"/>
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
        :show="showKeyAlert"
        title="需要配置 API Key"
        :message="[alertMessage, '您的 Key 仅存储在本地或通过您的私有 WebDAV 同步。']"
        confirmText="去配置"
        cancelText="取消"
        @confirm="openSettingsAndFocus"
        @cancel="showKeyAlert = false"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone" class="text-orange-500"/>
      </template>
    </ConfirmDialog>

    <ConfirmDialog
        :show="showClearHistoryConfirm"
        title="清空聊天记录？"
        :message="['将删除所有本地 AI 聊天会话。', '此操作不可撤销。']"
        confirmText="确认清空"
        cancelText="取消"
        :danger="true"
        @confirm="confirmClearHistory"
        @cancel="showClearHistoryConfirm = false"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone" class="text-red-500"/>
      </template>
    </ConfirmDialog>
  </div>
</template>

<style>
.markdown-body pre {
  background: #282c34;
  color: #abb2bf;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.markdown-body code {
  font-family: 'Fira Code', monospace;
  font-size: 0.9em;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
