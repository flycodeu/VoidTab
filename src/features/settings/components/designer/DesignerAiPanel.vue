<script setup lang="ts">
import {computed, ref} from 'vue';
import {
  PhMagicWand, PhX, PhSparkle, PhCopy, PhClipboard, PhArrowsClockwise,
  PhWarning, PhRobot, PhCaretDown,
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {useToast} from '../../../../shared/composables/useToast';
import {fetchWithRetry} from '../../../../shared/utils/network';
import {readChatCompletionStream} from '../../../../shared/utils/aiStream';
import {
  DESIGNER_AI_SYSTEM_PROMPT,
  applyDesignerAiPatch,
  buildDesignerAiPromptSections,
  buildDesignerAiUserPrompt,
  compileDraft,
  parseDesignerAiResponse,
  type DesignerDraft,
} from '../../../../core/tiles/designerPackage.ts';

const props = defineProps<{
  show: boolean;
  draft: DesignerDraft;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', draft: DesignerDraft): void;
}>();

const store = useConfigStore();
const toast = useToast();

type Mode = 'generate' | 'paste';
const mode = ref<Mode>('generate');
const description = ref('');
const pasteText = ref('');
const generating = ref(false);
const streamOutput = ref('');
const expandedPrompt = ref<string>('');

const aiConfig = computed(() => store.config.ai);
const aiReady = computed(() => {
  const ai = aiConfig.value;
  if (!ai || !ai.baseUrl?.trim()) return false;
  if (!ai.apiKey?.trim() && !ai.baseUrl.includes('localhost')) return false;
  return true;
});
const modelLabel = computed(() => aiConfig.value?.model?.trim() || '未配置');

const promptSections = computed(() => buildDesignerAiPromptSections(description.value, props.draft));

const togglePrompt = (id: string) => {
  expandedPrompt.value = expandedPrompt.value === id ? '' : id;
};

const copyText = async (text: string, label = '提示词') => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`已复制${label}`);
  } catch {
    toast.error('复制失败，请手动选择文本');
  }
};

// Apply a parsed reply onto the draft, validating structure via the real compiler.
const applyReply = (reply: string): boolean => {
  const parsed = parseDesignerAiResponse(reply);
  if (!parsed.ok || !parsed.draftPatch) {
    toast.error(`解析失败：${parsed.error || '未知错误'}`);
    return false;
  }
  const next = applyDesignerAiPatch(props.draft, parsed.draftPatch);
  emit('apply', next);
  const build = compileDraft(next);
  if (build.ok) {
    toast.success('已填入设计器，可在预览中查看');
  } else {
    toast.warning(`已填入，但结构需微调：${build.error || '请检查代码'}`);
  }
  return true;
};

const generate = async () => {
  if (generating.value) return;
  if (!description.value.trim()) {
    toast.warning('请先描述你想要的组件');
    return;
  }
  if (!aiReady.value) {
    toast.error('尚未配置应用内 AI，请在 AI 助手的「模型配置」里填写 Base URL / API Key，或改用「复制提示词」模式');
    return;
  }

  const ai = aiConfig.value;
  generating.value = true;
  streamOutput.value = '';
  try {
    let endpoint = ai.baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint = `${endpoint}/chat/completions`;

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model || 'deepseek-chat',
        messages: [
          {role: 'system', content: DESIGNER_AI_SYSTEM_PROMPT},
          {role: 'user', content: buildDesignerAiUserPrompt(description.value, props.draft)},
        ],
        temperature: Number.isFinite(Number(ai.temperature)) ? Math.min(Number(ai.temperature), 0.6) : 0.4,
        stream: true,
      }),
    }, {
      timeoutMs: 60000,
      retries: 1,
      retryDelayMs: 800,
      maxRetryDelayMs: 3000,
      metricName: 'designer.ai.generate',
      fallbackName: 'designer.ai.unavailable',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const full = await readChatCompletionStream(response, {
      onContent: (content) => {
        streamOutput.value = content;
      },
    });
    if (applyReply(full)) {
      // Keep the raw reply visible so the user can copy/inspect if needed.
      streamOutput.value = full;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    toast.error(`生成失败：${message}`, {duration: 8000});
  } finally {
    generating.value = false;
  }
};

const applyPaste = () => {
  if (!pasteText.value.trim()) {
    toast.warning('请先粘贴 AI 返回的内容');
    return;
  }
  applyReply(pasteText.value);
};
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="ai-mask" @click.self="emit('close')">
      <section class="ai-panel">
        <header class="ai-head">
          <div class="ai-title"><PhMagicWand size="18" weight="duotone"/>AI 生成组件</div>
          <button type="button" class="icon-btn" aria-label="关闭" @click="emit('close')"><PhX size="18"/></button>
        </header>

        <div class="ai-body">
          <div class="seg">
            <button type="button" class="seg-btn" :class="{active: mode === 'generate'}" @click="mode = 'generate'">应用内生成</button>
            <button type="button" class="seg-btn" :class="{active: mode === 'paste'}" @click="mode = 'paste'">复制提示词 / 粘贴回填</button>
          </div>

          <label class="field">
            <span>描述你想要的组件</span>
            <textarea
                v-model="description"
                rows="3"
                class="ai-area"
                placeholder="例如：一个可以增删的闹钟时间组件，封面显示下一项倒计时，点击打开弹窗维护今日计划"
            ></textarea>
          </label>

          <p class="ai-note">
            <PhSparkle size="13" weight="fill"/>
            生成会覆盖：名称、描述、图标、封面 JS/CSS、弹窗 HTML/CSS、能力与设置 Schema；不会改动组件 ID、版本与尺寸。填入后可在右侧预览并继续手动调整。
          </p>

          <!-- 应用内生成 -->
          <div v-if="mode === 'generate'" class="ai-section">
            <div class="ai-model-row">
              <span class="model-chip"><PhRobot size="13"/>{{ modelLabel }}</span>
              <span v-if="!aiReady" class="model-warn"><PhWarning size="13" weight="fill"/>未配置应用内 AI（去 AI 助手 → 模型配置）</span>
            </div>
            <button type="button" class="btn primary full" :disabled="generating" @click="generate">
              <component :is="generating ? PhArrowsClockwise : PhMagicWand" size="15" weight="bold" :class="generating ? 'spin' : ''"/>
              {{ generating ? '生成中…' : '生成并填入' }}
            </button>
            <div v-if="streamOutput" class="ai-stream">
              <div class="ai-stream-head">
                <span>AI 输出</span>
                <button type="button" class="btn ghost xs" @click="copyText(streamOutput, 'AI 输出')"><PhCopy size="12"/>复制</button>
              </div>
              <pre class="ai-stream-body">{{ streamOutput }}</pre>
            </div>
          </div>

          <!-- 复制提示词 / 粘贴回填 -->
          <div v-else class="ai-section">
            <div class="prompt-list">
              <div v-for="section in promptSections" :key="section.id" class="prompt-item">
                <div class="prompt-head">
                  <button type="button" class="prompt-toggle" @click="togglePrompt(section.id)">
                    <PhCaretDown size="13" class="transition" :class="expandedPrompt === section.id ? 'rot' : ''"/>
                    {{ section.label }}
                  </button>
                  <button type="button" class="btn ghost xs" @click="copyText(section.text, section.label)"><PhCopy size="12"/>复制</button>
                </div>
                <pre v-if="expandedPrompt === section.id" class="prompt-body">{{ section.text }}</pre>
              </div>
            </div>

            <label class="field mt-2">
              <span>把外部 AI 返回的内容粘贴到这里</span>
              <textarea
                  v-model="pasteText"
                  rows="6"
                  class="ai-area mono"
                  placeholder='粘贴 AI 回复（支持 ```json 代码块或纯 JSON）'
              ></textarea>
            </label>
            <button type="button" class="btn primary full" @click="applyPaste"><PhClipboard size="15" weight="bold"/>解析并填入</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-mask {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; justify-content: flex-end;
  background: rgba(0, 0, 0, 0.32); backdrop-filter: blur(3px);
}
.ai-panel {
  width: min(560px, 100vw); height: 100%;
  display: flex; flex-direction: column;
  background: var(--settings-panel, #16181d); color: var(--settings-text, #e8eaed);
  border-left: 1px solid var(--glass-border); box-shadow: -12px 0 40px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.22s ease-out;
}
@keyframes slideIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

.ai-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 16px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0;
}
.ai-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 900; }
.icon-btn { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; }
.icon-btn:hover { background: rgba(var(--overlay-rgb), 0.1); }

.ai-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.seg { display: inline-flex; padding: 3px; border-radius: 12px; background: rgba(var(--overlay-rgb), 0.1); }
.seg-btn { padding: 6px 12px; border-radius: 9px; font-size: 12px; font-weight: 800; opacity: 0.7; }
.seg-btn.active { background: var(--accent-color); color: #fff; opacity: 1; }

.field { display: grid; gap: 5px; }
.field > span { font-size: 11px; font-weight: 800; opacity: 0.62; }
.ai-area {
  width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.08); font-size: 12px; line-height: 1.5; resize: vertical; outline: none; color: inherit;
}
.ai-area.mono { font-family: 'Fira Code', ui-monospace, monospace; }
.ai-area:focus { border-color: var(--accent-color); }

.ai-note {
  display: flex; gap: 6px; align-items: flex-start;
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.18); background: rgba(var(--accent-color-rgb), 0.08);
  font-size: 11px; line-height: 1.5; color: var(--settings-text-secondary);
}
.ai-note svg { flex-shrink: 0; margin-top: 2px; color: var(--accent-color); }

.ai-section { display: flex; flex-direction: column; gap: 10px; }
.ai-model-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.model-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; background: rgba(var(--overlay-rgb), 0.1); font-size: 11px; font-family: 'Fira Code', monospace; }
.model-warn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgb(245 158 11); }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer; }
.btn.full { width: 100%; }
.btn.primary { color: #fff; background: var(--accent-color); border: 0; }
.btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.ghost { color: inherit; background: rgba(var(--overlay-rgb), 0.08); border: 1px solid var(--glass-border); }
.btn.xs { height: 24px; padding: 0 8px; font-size: 10px; }

.ai-stream { border: 1px solid var(--glass-border); border-radius: 10px; overflow: hidden; }
.ai-stream-head, .prompt-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(var(--overlay-rgb), 0.08); font-size: 11px; font-weight: 800; }
.ai-stream-body, .prompt-body {
  max-height: 240px; overflow: auto; margin: 0; padding: 10px;
  font-family: 'Fira Code', ui-monospace, monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}

.prompt-list { display: grid; gap: 8px; }
.prompt-item { border: 1px solid var(--glass-border); border-radius: 10px; overflow: hidden; }
.prompt-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; }
.transition { transition: transform 0.18s ease; }
.rot { transform: rotate(180deg); }

.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mt-2 { margin-top: 8px; }
</style>
