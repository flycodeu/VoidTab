<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, nextTick, watch} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useAiStore} from '../../../stores/useAiStores.ts';
import {
  PhPaperPlaneRight, PhPlus, PhTrash, PhX, PhDownloadSimple,
  PhChatCircleText, PhRobot, PhUser, PhCopy, PhGear, PhCaretDown, PhPencilSimple,
  PhWarning, PhFloppyDisk, PhCheckCircle, PhMagnifyingGlass, PhSparkle,
  PhNotebook, PhTag, PhMagicWand
} from '@phosphor-icons/vue';
import type {AiPromptTemplate} from '../../../core/config/types.ts';
import {cloneDefaultAiPromptTemplates} from '../../../core/config/aiPromptTemplates.ts';

// 🟢 引入自定义弹窗组件
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';

// 🔒 XSS 防护
import DOMPurify from 'dompurify';
import {fetchWithRetry} from '../../../shared/utils/network';
import {readChatCompletionStream} from '../../../shared/utils/aiStream';
import {useToast} from '../../../shared/composables/useToast';

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import {
  isHighlightLanguageLoaded,
  loadHighlightLanguage,
  normalizeHighlightLanguage,
} from '../utils/highlightLanguages';
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
const inputEl = ref<HTMLTextAreaElement | null>(null);
const mdRenderer = ref<MarkdownIt | null>(null);
const highlightRevision = ref(0);

// 🟢 弹窗与保存状态
const showKeyAlert = ref(false);
const showClearHistoryConfirm = ref(false);
const alertMessage = ref('');
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle');
const templateSearch = ref('');
const activeTemplateCategory = ref('all');
const showTemplateLibrary = ref(false);
const showTemplateEditor = ref(false);
const editingTemplateId = ref('');
const selectedTemplateId = ref('');

type TemplateDraft = {
  title: string;
  category: string;
  description: string;
  content: string;
  systemPrompt: string;
};

const createBlankTemplateDraft = (): TemplateDraft => ({
  title: '',
  category: '自定义',
  description: '',
  content: '',
  systemPrompt: '',
});

const templateDraft = ref<TemplateDraft>(createBlankTemplateDraft());

const PRESETS = [
  {name: 'DeepSeek (官方)', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat'},
  {name: 'DeepSeek (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3'},
  {name: 'OpenAI (官方)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o'},
  {name: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k'},
  {name: 'Local (Ollama)', baseUrl: 'http://localhost:11434/v1', model: 'llama3'},
  {name: '自定义 (Custom)', baseUrl: '', model: '', isCustom: true}
];

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

const ensureAiConfigShape = () => {
  const ai = configStore.config.ai as any;
  if (!ai) {
    configStore.config.ai = {
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxHistory: 10,
      systemPrompt: 'You are a helpful assistant.',
      templates: cloneDefaultAiPromptTemplates(),
    };
    return;
  }

  if (typeof ai.systemPrompt !== 'string') ai.systemPrompt = 'You are a helpful assistant.';
  if (!Array.isArray(ai.templates)) ai.templates = cloneDefaultAiPromptTemplates();
  if (!Number.isFinite(Number(ai.temperature))) ai.temperature = 0.7;
  if (!Number.isFinite(Number(ai.maxHistory))) ai.maxHistory = 10;
};

const promptTemplates = computed<AiPromptTemplate[]>(() => configStore.config.ai.templates ?? []);
const selectedTemplate = computed(() => promptTemplates.value.find((template) => template.id === selectedTemplateId.value));
const templateCategories = computed(() => {
  const categories = new Set<string>();
  promptTemplates.value.forEach((template) => {
    const category = template.category?.trim();
    if (category) categories.add(category);
  });
  return Array.from(categories);
});
const filteredTemplates = computed(() => {
  const query = templateSearch.value.trim().toLowerCase();
  return promptTemplates.value.filter((template) => {
    const categoryMatches = activeTemplateCategory.value === 'all' || template.category === activeTemplateCategory.value;
    if (!categoryMatches) return false;
    if (!query) return true;
    return [
      template.title,
      template.category,
      template.description,
      template.content,
      template.systemPrompt,
    ].some((value) => (value || '').toLowerCase().includes(query));
  });
});

const extractTemplateVariables = (template: AiPromptTemplate) => {
  const variables = new Set<string>();
  `${template.content}\n${template.systemPrompt || ''}`.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (_, name: string) => {
    const key = name.trim();
    if (key) variables.add(key);
    return '';
  });
  return Array.from(variables).slice(0, 4);
};

const insertTemplate = async (template: AiPromptTemplate) => {
  const content = template.content.trim();
  if (!content) return;
  const existing = userInput.value.trim();
  userInput.value = existing ? `${existing}\n\n${content}` : content;
  selectedTemplateId.value = template.id;
  showTemplateLibrary.value = false;
  await nextTick();
  inputEl.value?.focus();
};

const openTemplateEditor = (template?: AiPromptTemplate) => {
  editingTemplateId.value = template?.id || '';
  templateDraft.value = template
      ? {
        title: template.title,
        category: template.category,
        description: template.description || '',
        content: template.content,
        systemPrompt: template.systemPrompt || '',
      }
      : createBlankTemplateDraft();
  showTemplateLibrary.value = false;
  showTemplateEditor.value = true;
};

const closeTemplateEditor = () => {
  showTemplateEditor.value = false;
  editingTemplateId.value = '';
  templateDraft.value = createBlankTemplateDraft();
};

const savePromptTemplate = async () => {
  const title = templateDraft.value.title.trim();
  const content = templateDraft.value.content.trim();
  if (!title || !content) {
    toast.warning('模板名称和内容不能为空');
    return;
  }

  const now = Date.now();
  const category = templateDraft.value.category.trim() || '自定义';
  const nextTemplate: AiPromptTemplate = {
    id: editingTemplateId.value || `ai-template-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    category,
    description: templateDraft.value.description.trim(),
    content,
    systemPrompt: templateDraft.value.systemPrompt.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const current = [...promptTemplates.value];
  const existingIndex = editingTemplateId.value
      ? current.findIndex((template) => template.id === editingTemplateId.value)
      : -1;
  if (existingIndex >= 0) {
    nextTemplate.createdAt = current[existingIndex].createdAt;
    current[existingIndex] = nextTemplate;
    configStore.config.ai.templates = current;
  } else {
    configStore.config.ai.templates = [nextTemplate, ...current];
    selectedTemplateId.value = nextTemplate.id;
  }

  await configStore.saveConfig();
  closeTemplateEditor();
  toast.success(existingIndex >= 0 ? '模板已更新' : '模板已创建');
};

const deletePromptTemplate = async (template: AiPromptTemplate) => {
  const index = promptTemplates.value.findIndex((item) => item.id === template.id);
  if (index < 0) return;
  configStore.config.ai.templates = promptTemplates.value.filter((item) => item.id !== template.id);
  if (selectedTemplateId.value === template.id) selectedTemplateId.value = '';
  await configStore.saveConfig();
  toast.success('模板已删除', {
    action: {
      label: '撤销',
      handler: async () => {
        const next = [...promptTemplates.value];
        next.splice(Math.min(index, next.length), 0, template);
        configStore.config.ai.templates = next;
        await configStore.saveConfig();
      },
    },
  });
};

const restoreDefaultPromptTemplates = async () => {
  configStore.config.ai.templates = cloneDefaultAiPromptTemplates();
  activeTemplateCategory.value = 'all';
  templateSearch.value = '';
  await configStore.saveConfig();
  toast.success('已恢复默认模板');
};

const toggleTemplateLibrary = () => {
  showTemplateLibrary.value = !showTemplateLibrary.value;
};

const confirmClearHistory = () => {
  showClearHistoryConfirm.value = false;
  aiStore.clearHistory();
  aiStore.createSession();
};

onMounted(async () => {
  ensureAiConfigShape();

  aiStore.loadHistory();
  if (aiStore.sessions.length === 0) {
    aiStore.createSession();
  }

  mdRenderer.value = new MarkdownIt({
    html: false, linkify: true, typographer: true,
    highlight: function (str, lang) {
      const language = normalizeHighlightLanguage(lang);
      if (language && isHighlightLanguageLoaded(language)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(str, {
            language,
            ignoreIllegals: true
          }).value}</code></pre>`;
        } catch (__) {
        }
      }

      if (language) {
        void loadHighlightLanguage(language).then((loaded) => {
          if (loaded) highlightRevision.value += 1;
        });
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
let scrollRaf: number | null = null;
const scheduleScrollToBottom = () => {
  if (scrollRaf != null) return;
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = null;
    void scrollToBottom();
  });
};
watch(() => currentSession.value?.messages.length, scrollToBottom);
watch(() => aiStore.currentSessionId, scrollToBottom);
onUnmounted(() => {
  if (scrollRaf != null) window.cancelAnimationFrame(scrollRaf);
  scrollRaf = null;
});

// 发送逻辑
const sendMessage = async () => {
  const text = userInput.value.trim();
  const {apiKey, baseUrl, model, maxHistory, temperature, systemPrompt} = configStore.config.ai;
  const templateForRequest = selectedTemplate.value;
  const systemContent = (templateForRequest?.systemPrompt || systemPrompt || 'You are a helpful assistant.').trim();

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
  selectedTemplateId.value = '';
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
        messages: [{role: "system", content: systemContent || 'You are a helpful assistant.'}, ...history],
        temperature,
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

    fullContent = await readChatCompletionStream(response, {
      onContent: (content) => {
        fullContent = content;
        aiStore.updateMessageContent(aiStore.currentSessionId, aiMsgId, fullContent, 'loading');
        scheduleScrollToBottom();
      },
    });
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
          selectedTemplateId.value = templateForRequest?.id || '';
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
  void highlightRevision.value;
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
        class="relative w-full md:w-[1120px] h-full bg-[#f5f5f7] dark:bg-[#121212] shadow-2xl flex flex-col md:flex-row overflow-hidden border-l border-white/10 transition-transform duration-300">

      <div
          class="w-full md:w-80 max-h-[52vh] md:max-h-none md:h-full bg-gray-50 dark:bg-[#1a1a1a] flex flex-col border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/5 transition-all overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-white/5 flex items-center justify-between shrink-0">
          <span class="font-bold text-sm">对话列表</span>
          <button @click="aiStore.createSession()"
                  class="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition">
            <PhPlus size="16"/>
          </button>
        </div>

        <div class="shrink-0 max-h-[118px] md:max-h-[250px] overflow-y-auto p-2 space-y-1">
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

        <div class="hidden md:block flex-1 min-h-0"></div>

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
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">System Prompt</label>
                <textarea v-model="configStore.config.ai.systemPrompt"
                          rows="3"
                          class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors resize-none"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="space-y-1">
                  <label class="text-[10px] opacity-50 uppercase font-bold">Temperature</label>
                  <input v-model.number="configStore.config.ai.temperature" type="number" min="0" max="2" step="0.1"
                         class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors"/>
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] opacity-50 uppercase font-bold">History</label>
                  <input v-model.number="configStore.config.ai.maxHistory" type="number" min="1" max="50" step="1"
                         class="w-full bg-white dark:bg-black/20 rounded px-2 py-1 text-xs outline-none border border-transparent focus:border-[var(--accent-color)] transition-colors"/>
                </div>
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

      <div class="flex-1 min-h-0 flex flex-col relative bg-white dark:bg-[#121212]">
        <div class="h-16 border-b border-gray-100 dark:border-white/5 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div class="min-w-0 flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" v-if="isSending"></div>
            <div class="min-w-0">
              <div class="font-bold truncate">{{ currentSession?.title || '新对话' }}</div>
              <div class="mt-0.5 flex items-center gap-2 text-[10px] opacity-55">
                <span class="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 font-mono truncate max-w-[180px]">{{
                    configStore.config.ai.model || '未配置'
                  }}</span>
                <span v-if="selectedTemplate" class="hidden sm:inline truncate max-w-[180px]">模板：{{ selectedTemplate.title }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button @click="emit('close')" class="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition" aria-label="关闭 AI 助手">
              <PhX size="20"/>
            </button>
          </div>
        </div>

        <div ref="messagesContainer" class="flex-1 overflow-y-auto scroll-smooth">
          <div class="mx-auto w-full max-w-[820px] px-4 md:px-8 py-5 md:py-8 space-y-5">
            <template v-if="currentSession && currentSession.messages.length > 0">
              <div
                  v-for="msg in currentSession.messages"
                  :key="msg.id"
                  class="flex items-start gap-3"
                  :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
              >
                <div
                    class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                    :class="msg.role === 'user' ? 'bg-gray-200 dark:bg-white/10' : 'bg-[var(--accent-color)] text-white'"
                >
                  <component :is="msg.role === 'user' ? PhUser : PhRobot" size="18" weight="fill"/>
                </div>
                <div
                    class="group relative min-w-0 max-w-[calc(100%-44px)] md:max-w-[76%]"
                    :class="msg.role === 'user' ? 'items-end' : 'items-start'"
                >
                  <div
                      class="relative py-3 pl-4 pr-10 rounded-2xl text-sm leading-relaxed shadow-sm overflow-hidden break-words"
                      :class="[msg.role === 'user' ? 'bg-[var(--accent-color)] text-white rounded-tr-md whitespace-pre-wrap' : 'bg-gray-50 dark:bg-[#1e1e1e] border border-gray-100 dark:border-white/5 rounded-tl-md markdown-body', msg.status === 'error' ? 'border-red-500/50 bg-red-500/5' : '']"
                  >
                    <button
                        @click="copyText(msg.content)"
                        class="absolute right-2 top-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                        :class="msg.role === 'user' ? 'hover:bg-white/15 text-white/80' : 'hover:bg-gray-200 dark:hover:bg-white/10 opacity-50'"
                        aria-label="复制消息"
                    >
                      <PhCopy size="13"/>
                    </button>
                    <div v-if="msg.status === 'loading' && !msg.content" class="flex gap-1 py-1">
                      <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                      <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100"></div>
                      <div class="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200"></div>
                    </div>
                    <div v-if="msg.role === 'user'">{{ msg.content }}</div>
                    <div v-else v-html="renderMd(msg.content)"></div>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="min-h-[180px] md:min-h-[360px] flex flex-col items-center justify-center opacity-45 gap-4 select-none">
              <PhChatCircleText size="64" weight="thin"/>
              <div class="text-center">
                <p class="font-medium">开始新的对话</p>
                <p class="text-xs mt-2 opacity-60">AI 内容可能不准确</p>
              </div>
            </div>
          </div>
        </div>

        <div class="shrink-0 border-t border-gray-100 dark:border-white/5 bg-white/95 dark:bg-[#121212]/95 backdrop-blur">
          <div class="mx-auto w-full max-w-[820px] px-4 md:px-8 py-3 md:py-4">
            <div class="relative">
              <div
                  v-show="showTemplateLibrary"
                  id="ai-template-library"
                  class="absolute left-0 right-0 bottom-full z-20 mb-3 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#181818] shadow-2xl p-3 md:p-4 space-y-3 animate-fade-in"
              >
                <div class="flex flex-col sm:flex-row gap-2">
                  <div class="relative flex-1">
                    <PhMagnifyingGlass size="14" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-40"/>
                    <input
                        v-model="templateSearch"
                        type="text"
                        placeholder="搜索模板"
                        class="w-full bg-gray-50 dark:bg-black/20 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors"
                    />
                  </div>
                  <button
                      @click="openTemplateEditor()"
                      class="px-3 py-2.5 rounded-xl text-sm bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <PhPlus size="15"/>
                    <span>新建</span>
                  </button>
                </div>

                <div v-if="templateCategories.length > 0" class="flex gap-1 overflow-x-auto pb-1">
                  <button
                      @click="activeTemplateCategory = 'all'"
                      class="px-2.5 py-1 text-[11px] rounded-full border shrink-0 transition"
                      :class="activeTemplateCategory === 'all' ? 'bg-[var(--accent-color)] text-white border-transparent' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 opacity-75 hover:opacity-100'"
                  >
                    全部
                  </button>
                  <button
                      v-for="category in templateCategories"
                      :key="category"
                      @click="activeTemplateCategory = category"
                      class="px-2.5 py-1 text-[11px] rounded-full border shrink-0 transition"
                      :class="activeTemplateCategory === category ? 'bg-[var(--accent-color)] text-white border-transparent' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 opacity-75 hover:opacity-100'"
                  >
                    {{ category }}
                  </button>
                </div>

                <div class="max-h-[320px] md:max-h-[430px] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div
                      v-for="template in filteredTemplates"
                      :key="template.id"
                      @click="insertTemplate(template)"
                      @keydown.enter.prevent="insertTemplate(template)"
                      @keydown.space.prevent="insertTemplate(template)"
                      role="button"
                      tabindex="0"
                      class="group min-w-0 text-left p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-[var(--accent-color)] transition"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="text-sm font-bold truncate">{{ template.title }}</div>
                        <div class="mt-1 flex items-center gap-1 text-[10px] opacity-50">
                          <PhTag size="10"/>
                          <span class="truncate">{{ template.category || '自定义' }}</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                        <button
                            @click.stop="openTemplateEditor(template)"
                            class="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10"
                            title="编辑模板"
                            aria-label="编辑模板"
                        >
                          <PhPencilSimple size="13"/>
                        </button>
                        <button
                            @click.stop="deletePromptTemplate(template)"
                            class="p-1 rounded hover:bg-red-500/10 text-red-500"
                            title="删除模板"
                            aria-label="删除模板"
                        >
                          <PhTrash size="13"/>
                        </button>
                      </div>
                    </div>
                    <p v-if="template.description" class="mt-2 text-xs leading-relaxed opacity-60 line-clamp-2">
                      {{ template.description }}
                    </p>
                    <div v-if="extractTemplateVariables(template).length" class="mt-2 flex flex-wrap gap-1">
                      <span
                          v-for="variable in extractTemplateVariables(template)"
                          :key="variable"
                          class="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/10 text-[10px] text-[var(--accent-color)]"
                      >
                        {{ variable }}
                      </span>
                    </div>
                  </div>

                  <div v-if="filteredTemplates.length === 0" class="md:col-span-2 py-8 text-center text-xs opacity-50">
                    <PhSparkle size="28" class="mx-auto mb-2 opacity-50"/>
                    <p>暂无匹配模板</p>
                    <button
                        v-if="promptTemplates.length === 0"
                        @click="restoreDefaultPromptTemplates"
                        class="mt-3 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-[var(--accent-color)] transition"
                    >
                      恢复默认
                    </button>
                  </div>
                </div>
              </div>

              <div class="mb-2 flex items-center justify-between gap-2">
                <div
                    v-if="selectedTemplate"
                    class="min-w-0 inline-flex max-w-full items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] text-xs"
                >
                  <PhSparkle size="13" class="shrink-0"/>
                  <span class="truncate">{{ selectedTemplate.title }}</span>
                  <button @click="selectedTemplateId = ''" class="p-0.5 rounded-full hover:bg-[var(--accent-color)]/10" aria-label="取消模板">
                    <PhX size="12"/>
                  </button>
                </div>
                <div v-else class="min-w-0"></div>

                <div class="flex items-center gap-2 shrink-0">
                  <button
                      @click="toggleTemplateLibrary"
                      class="px-3 py-1.5 rounded-full text-xs bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center gap-1.5"
                      :aria-expanded="showTemplateLibrary"
                      aria-controls="ai-template-library"
                  >
                    <PhNotebook size="14"/>
                    <span>模板</span>
                    <span class="opacity-45">{{ promptTemplates.length }}</span>
                  </button>
                </div>
              </div>

              <div
                  class="relative rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-[var(--accent-color)] transition-all">
                <textarea ref="inputEl" v-model="userInput" @keydown.enter.prevent="!isSending && sendMessage()"
                          placeholder="输入消息... (Enter 发送)"
                          class="w-full bg-transparent p-4 pr-14 min-h-[56px] max-h-[160px] resize-none outline-none text-sm"
                          rows="1"></textarea>
                <button @click="sendMessage" :disabled="!userInput.trim() || isSending"
                        class="absolute right-2 bottom-2 p-2.5 rounded-xl bg-[var(--accent-color)] text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:brightness-110">
                  <PhPaperPlaneRight weight="fill"/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
          v-if="showTemplateEditor"
          class="absolute inset-0 z-30 flex justify-end bg-black/30 backdrop-blur-[2px]"
          @click.self="closeTemplateEditor"
      >
        <div class="w-full md:w-[480px] h-full bg-white dark:bg-[#171717] border-l border-gray-200 dark:border-white/10 shadow-2xl flex flex-col">
          <div class="h-14 px-5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <PhMagicWand size="18" class="text-[var(--accent-color)] shrink-0"/>
              <span class="font-bold text-sm truncate">{{ editingTemplateId ? '编辑模板' : '新建模板' }}</span>
            </div>
            <button @click="closeTemplateEditor" class="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition" aria-label="关闭模板编辑">
              <PhX size="18"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">名称</label>
                <input
                    v-model="templateDraft.title"
                    type="text"
                    class="w-full bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 text-sm outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] opacity-50 uppercase font-bold">分类</label>
                <input
                    v-model="templateDraft.category"
                    type="text"
                    class="w-full bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 text-sm outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors"
                />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] opacity-50 uppercase font-bold">描述</label>
              <input
                  v-model="templateDraft.description"
                  type="text"
                  class="w-full bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 text-sm outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] opacity-50 uppercase font-bold">Prompt</label>
              <textarea
                  v-model="templateDraft.content"
                  rows="12"
                  class="w-full bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 text-sm leading-relaxed outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors resize-none"
              ></textarea>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] opacity-50 uppercase font-bold">System Prompt</label>
              <textarea
                  v-model="templateDraft.systemPrompt"
                  rows="4"
                  class="w-full bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 text-sm leading-relaxed outline-none border border-gray-200 dark:border-white/10 focus:border-[var(--accent-color)] transition-colors resize-none"
              ></textarea>
            </div>
          </div>

          <div class="p-5 border-t border-gray-100 dark:border-white/5 flex gap-2 shrink-0">
            <button
                @click="closeTemplateEditor"
                class="flex-1 py-2 rounded-xl text-sm bg-gray-100 dark:bg-white/5 hover:brightness-95 transition"
            >
              取消
            </button>
            <button
                @click="savePromptTemplate"
                class="flex-1 py-2 rounded-xl text-sm bg-[var(--accent-color)] text-white hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <PhFloppyDisk size="16"/>
              保存
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
