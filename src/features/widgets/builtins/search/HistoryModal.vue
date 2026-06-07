<script setup lang="ts">
import {ref, watch, nextTick} from 'vue';
import {useHistoryStore} from '../../../../stores/useHistoryStore';
import {useConfigStore} from '../../../../stores/useConfigStore';
import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';
import {
  PhClockCounterClockwise, PhTrendUp, PhBrain, PhX, PhTrash,
  PhMagnifyingGlass, PhArrowSquareOut, PhSparkle, PhCopy, PhCheckCircle
} from '@phosphor-icons/vue';
import MarkdownIt from 'markdown-it';
import {fetchWithRetry} from '../../../../shared/utils/network';
import {useToast} from '../../../../shared/composables/useToast';

const md = new MarkdownIt({html: true});

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

const store = useHistoryStore();
const config = useConfigStore();
const toast = useToast();

const activeTab = ref<'timeline' | 'stats' | 'ai'>('timeline');
const showAiConfirm = ref(false);
const aiAnalysisResult = ref('');
const isAnalyzing = ref(false);
const showCopySuccess = ref(false);

// 监听弹窗打开
watch(() => props.show, (val) => {
  if (val) {
    store.loadLogs(true);
    store.loadStats();
  }
});

// 滚动加载
const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
    store.loadLogs();
  }
};

// 复制结果
const copyResult = () => {
  if (!aiAnalysisResult.value) return;
  navigator.clipboard.writeText(aiAnalysisResult.value)
      .then(() => {
        showCopySuccess.value = true;
        toast.success('报告已复制');
        setTimeout(() => showCopySuccess.value = false, 2000);
      })
      .catch(() => toast.error('复制失败，请检查浏览器权限'));
};

// AI 分析逻辑 (Prompt 已优化为趣味报告风格)
const startAnalysis = async () => {
  showAiConfirm.value = false;

  const {apiKey, baseUrl, model} = config.config.ai;
  if (!baseUrl || (!apiKey && !baseUrl.includes('localhost'))) {
    toast.warning('请先在设置中配置 AI Key 和 URL');
    return;
  }

  isAnalyzing.value = true;
  aiAnalysisResult.value = '';

  // 采样数据
  const dataSample = store.logs.slice(0, 60).map(l =>
      `${l.type}: ${l.content}`
  ).join('\n');

  // ✨ 核心修改：生成“年度总结”风格的 Prompt
  const prompt = `
  作为一位极具洞察力的“数字生活观察家”，请根据用户的近期操作历史，生成一份**“探索者性格报告”**。

  请模仿“年度听歌报告”或“年度阅读总结”的语气，**风格要幽默、温暖、充满好奇心**，必须包含 Emoji 表情。

  请严格按以下 Markdown 格式输出（不要输出其他废话）：

  ### 🏷️ 你的数字标签：[用2-4个字概括，如：硬核极客、吃瓜群众、效率狂人]

  **👀 你的视线锁定在...**
  [这里用一句话总结用户最常看的内容，例如：“看来你最近对 **DeepSeek** 很上头啊，是不是在研究什么黑科技？”]

  **🔥 你的探索关键词**
  * [关键词1]
  * [关键词2]
  * [关键词3]

  **💡 观察员寄语**
  [用一句富有哲理或鼓励的话作为结尾，结合用户的兴趣点。]

  ---
  用户数据：
  ${dataSample}
  `;

  try {
    let endpoint = baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint = `${endpoint}/chat/completions`;

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`},
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{role: "user", content: prompt}],
        stream: true
      })
    }, {
      timeoutMs: 30000,
      retries: 1,
      retryDelayMs: 800,
      maxRetryDelayMs: 3000,
      metricName: 'history.ai.analysis',
      fallbackName: 'history.ai.unavailable',
    });

    if (!response.ok) throw new Error(response.statusText);

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
            aiAnalysisResult.value += data.choices[0]?.delta?.content || '';
            // 滚动到底部
            await nextTick();
            const container = document.getElementById('ai-result-box');
            if (container) container.scrollTop = container.scrollHeight;
          } catch {
          }
        }
      }
    }
  } catch (e: any) {
    const message = e instanceof Error ? e.message : '未知错误';
    aiAnalysisResult.value = `Error: ${message}`;
    toast.error('AI 分析失败，请稍后重试。', {
      duration: 8000,
      action: {
        label: '重试',
        handler: () => startAnalysis(),
      },
    });
  } finally {
    isAnalyzing.value = false;
  }
};

const tabs = [
  {id: 'timeline', label: '时间轴', icon: PhClockCounterClockwise},
  {id: 'stats', label: '频率', icon: PhTrendUp},
  {id: 'ai', label: 'AI 洞察', icon: PhBrain},
];

const getIcon = (type: string) => {
  if (type === 'search') return PhMagnifyingGlass;
  if (type === 'goto') return PhArrowSquareOut;
  return PhSparkle;
};
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 settings-mask"
         @click.self="emit('close')">

      <div
          class="relative w-full max-w-4xl h-[80vh] settings-shell rounded-2xl flex flex-col overflow-hidden transition-colors duration-300">

        <div class="h-16 settings-header flex items-center justify-between px-6 shrink-0 z-20">
          <div class="flex gap-1 p-1 rounded-lg border border-[var(--settings-border)] bg-[var(--settings-input-bg)]">
            <button v-for="tab in tabs" :key="tab.id"
                    @click="activeTab = tab.id as any"
                    class="px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all duration-300 relative overflow-hidden group"
                    :class="activeTab === tab.id ? 'settings-text' : 'settings-muted hover:text-[var(--text-primary)]'">

              <div v-if="activeTab === tab.id"
                   class="absolute inset-0 bg-[var(--widget-surface-2)] shadow-sm rounded-md border border-[var(--settings-border-soft)]"></div>

              <component :is="tab.icon" size="16" class="relative z-10"
                         :class="activeTab === tab.id ? 'settings-accent' : ''"/>
              <span class="relative z-10">{{ tab.label }}</span>
            </button>
          </div>
          <button @click="emit('close')"
                  class="p-2 rounded-full transition settings-close">
            <PhX size="20"/>
          </button>
        </div>

        <div class="flex-1 overflow-hidden relative settings-body">

          <div v-if="activeTab === 'timeline'" class="h-full overflow-y-auto p-6 scroll-smooth custom-scroll"
               @scroll="onScroll">
            <div v-if="store.logs.length === 0"
                 class="text-center settings-muted py-20 flex flex-col items-center gap-2">
              <PhClockCounterClockwise size="48" class="opacity-20"/>
              <span>暂无历史记录</span>
            </div>
            <div class="space-y-3">
              <div v-for="log in store.logs" :key="log.id"
                   class="flex items-center gap-4 p-3 rounded-xl border border-transparent hover:border-[var(--accent-color)]/20 hover:bg-[var(--accent-color)]/5 transition-all group">

                <div
                    class="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--settings-input-bg)] settings-accent ring-1 ring-[var(--settings-border)]">
                  <component :is="getIcon(log.type)" size="18"/>
                </div>

                <div class="flex-1 min-w-0">
                  <div
                      class="text-sm font-bold settings-text truncate group-hover:text-[var(--accent-color)] transition-colors">
                    {{ log.content }}
                  </div>
                  <div class="text-xs settings-muted flex items-center gap-2 mt-0.5">
                    <span>{{ new Date(log.timestamp).toLocaleString() }}</span>
                    <span
                        class="px-1.5 py-0.5 rounded-full bg-[var(--settings-input-bg)] text-[10px] uppercase border border-[var(--settings-border)]">{{
                        log.type
                      }}</span>
                  </div>
                </div>

                <button @click="store.removeLog(log.id)"
                        class="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                  <PhTrash size="18"/>
                </button>
              </div>
              <div v-if="store.isLoading" class="text-center text-xs settings-muted py-4 animate-pulse">加载更多记录...
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'stats'" class="h-full overflow-y-auto p-6 custom-scroll">
            <div v-if="store.stats.length === 0" class="text-center settings-muted py-20">暂无数据</div>
            <div v-for="(item, idx) in store.stats.slice(0, 50)" :key="item.content" class="mb-5 group">
              <div class="flex justify-between text-sm mb-2 px-1 items-end">
                      <span class="font-bold settings-text flex items-center gap-3 max-w-[70%] truncate">
                         <span
                             class="w-6 h-6 rounded bg-[var(--settings-input-bg)] text-xs flex items-center justify-center font-mono settings-muted group-hover:text-[var(--accent-color)] transition-colors">
                             {{ idx + 1 }}
                         </span>
                         {{ item.content }}
                      </span>
                <div class="flex items-center gap-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <span class="settings-accent font-mono text-xs font-bold">{{ item.count }} 次</span>
                  <button @click="store.removeByContent(item.content)"
                          class="text-xs text-red-400 hover:text-red-300 hover:underline">删除
                  </button>
                </div>
              </div>
              <div class="h-1.5 bg-[var(--settings-input-bg)] rounded-full overflow-hidden">
                <div
                    class="h-full bg-[var(--accent-color)] opacity-80 transition-all duration-1000 ease-out"
                    :style="{ width: (item.count / store.stats[0].count * 100) + '%' }"></div>
              </div>
            </div>
          </div>

          <div v-else class="h-full overflow-y-auto p-0 flex flex-col relative custom-scroll">

            <div v-if="!aiAnalysisResult && !isAnalyzing"
                 class="flex-1 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
              <div
                  class="w-20 h-20 rounded-full bg-[var(--accent-color)]/10 flex items-center justify-center mb-6">
                <PhBrain size="40" class="settings-accent"/>
              </div>
              <h3 class="text-2xl font-bold settings-text mb-2 tracking-tight">AI 探索者报告</h3>
              <p class="text-sm settings-muted mb-8 max-w-sm leading-relaxed">
                让 AI 分析你的浏览足迹，看看你最近对什么“上头”，生成你的专属探索者画像。
              </p>

              <button @click="showAiConfirm = true"
                      class="group px-8 py-3 bg-[var(--accent-color)] text-white font-bold rounded-full hover:opacity-90 transition-all shadow-lg flex items-center gap-2">
                <PhSparkle weight="fill" class="text-white/80 group-hover:animate-spin-slow"/>
                生成我的报告
              </button>
            </div>

            <div v-if="isAnalyzing" class="flex-1 flex flex-col items-center justify-center p-8">
              <div class="relative">
                <div
                    class="w-12 h-12 border-4 border-[var(--settings-border)] border-t-[var(--accent-color)] rounded-full animate-spin"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <PhSparkle size="16" class="settings-muted animate-pulse"/>
                </div>
              </div>
              <p class="mt-4 text-sm font-mono settings-accent animate-pulse">正在连接神经网络...</p>
            </div>

            <div v-if="aiAnalysisResult" class="flex-1 p-8">
              <div class="relative max-w-3xl mx-auto">

                <div
                    class="relative bg-[var(--widget-surface)] rounded-xl border border-[var(--widget-border)] shadow-[var(--widget-shadow)] overflow-hidden">

                  <div
                      class="h-10 bg-[var(--settings-input-bg)] border-b border-[var(--settings-border)] flex items-center justify-between px-4">
                    <div class="flex items-center gap-2">
                      <div class="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                      <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                      <div class="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                    </div>
                    <button @click="copyResult"
                            class="flex items-center gap-1.5 text-[10px] font-bold settings-muted hover:settings-text transition uppercase tracking-wider">
                      <component :is="showCopySuccess ? PhCheckCircle : PhCopy" size="14"/>
                      {{ showCopySuccess ? '已复制' : '复制报告' }}
                    </button>
                  </div>

                  <div id="ai-result-box"
                       class="p-8 max-h-[60vh] overflow-y-auto custom-scroll bg-[var(--widget-surface)]">
                    <div class="markdown-body font-sans text-sm leading-7"
                         v-html="md.render(aiAnalysisResult)"></div>
                    <div class="mt-2 w-2 h-5 bg-[var(--accent-color)] animate-blink inline-block"
                         v-if="isAnalyzing"></div>
                  </div>

                  <div
                      class="h-12 bg-[var(--settings-input-bg)] border-t border-[var(--settings-border)] flex items-center justify-center">
                    <button @click="aiAnalysisResult = ''; isAnalyzing = false"
                            class="text-xs settings-accent hover:opacity-80 transition flex items-center gap-2 font-bold">
                      <PhArrowSquareOut weight="bold"/>
                      生成新画像
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>


  </Transition>
  <ConfirmDialog
      :show="showAiConfirm"
      title="准备好了吗？"
      :message="['AI 将分析你的近期操作历史以生成报告。', '这就像是一次性格测试，但基于你的真实行为。', '数据仅用于本次生成，不会被存储。']"
      confirmText="开始分析"
      @confirm="startAnalysis"
      @cancel="showAiConfirm = false"
  >
    <template #icon>
      <PhSparkle class="text-[var(--accent-color)]" size="32" weight="duotone"/>
    </template>
  </ConfirmDialog>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.animate-blink {
  animation: blink 1s step-end infinite;
}

/* Markdown 样式适配 (Light/Dark) */
:deep(.markdown-body) {
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-secondary);
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  color: var(--text-primary);
  margin: 1.5em 0 0.8em;
  font-weight: 800;
  letter-spacing: -0.02em;
}

:deep(.markdown-body p) {
  margin-bottom: 1.2em;
  color: var(--text-secondary);
}

:deep(.markdown-body strong) {
  color: var(--accent-color);
  font-weight: 700;
  background: rgba(var(--accent-color-rgb), 0.1);
  padding: 0 4px;
  border-radius: 4px;
}

:deep(.markdown-body ul) {
  padding-left: 1.2em;
  margin-bottom: 1.2em;
}

:deep(.markdown-body li) {
  margin-bottom: 0.4em;
  color: var(--text-secondary);
  position: relative;
}

:deep(.markdown-body li::marker) {
  color: var(--accent-color);
}

/* 引用块美化 */
:deep(.markdown-body blockquote) {
  border-left: 4px solid var(--accent-color);
  background: var(--settings-input-bg);
  padding: 8px 16px;
  border-radius: 0 8px 8px 0;
  color: var(--text-tertiary);
  font-style: italic;
  margin-bottom: 1.2em;
}
</style>
