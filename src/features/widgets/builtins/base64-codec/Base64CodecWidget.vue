<script setup lang="ts">
import {computed, ref} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {PhArrowsClockwise, PhCopy, PhTrash} from '@phosphor-icons/vue';
import ToolWidgetState from '../../components/ToolWidgetState.vue';

defineProps<{ item: SiteItem; isEditMode: boolean }>();

const mode = ref<'encode' | 'decode'>('encode');
const input = ref('');
const copied = ref(false);

const bytesToBinary = (bytes: Uint8Array) => {
  let out = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return out;
};

const binaryToBytes = (binary: string) => {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const encodeText = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return btoa(bytesToBinary(bytes));
};

const decodeText = (value: string) => {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return '';
  const binary = atob(compact);
  return new TextDecoder('utf-8', {fatal: true}).decode(binaryToBytes(binary));
};

const result = computed(() => {
  try {
    return {
      value: mode.value === 'encode' ? encodeText(input.value) : decodeText(input.value),
      error: '',
    };
  } catch {
    return {
      value: '',
      error: '输入内容不是有效的 Base64 或不是 UTF-8 文本。',
    };
  }
});

const output = computed(() => result.value.value);
const hasError = computed(() => !!result.value.error);
const hasInput = computed(() => input.value.trim().length > 0);

const toggleMode = () => {
  mode.value = mode.value === 'encode' ? 'decode' : 'encode';
  copied.value = false;
};

const swapContent = () => {
  if (hasError.value) return;
  input.value = output.value;
  toggleMode();
};

const clearContent = () => {
  input.value = '';
  copied.value = false;
};

const copyOutput = async () => {
  if (!output.value) return;
  await navigator.clipboard?.writeText(output.value);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1200);
};
</script>

<template>
  <div class="codec-widget w-full h-full rounded-[18px] overflow-hidden flex flex-col">
    <div class="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
      <div class="flex items-center gap-1 rounded-full bg-white/10 p-1">
        <button
            type="button"
            class="mode-btn"
            :class="mode === 'encode' ? 'is-active' : ''"
            @click="mode = 'encode'"
        >
          编码
        </button>
        <button
            type="button"
            class="mode-btn"
            :class="mode === 'decode' ? 'is-active' : ''"
            @click="mode = 'decode'"
        >
          解码
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button type="button" class="icon-btn" title="交换输入输出" aria-label="交换输入输出" @click.stop="swapContent">
          <PhArrowsClockwise size="16" weight="bold"/>
        </button>
        <button type="button" class="icon-btn" title="复制结果" aria-label="复制结果" @click.stop="copyOutput">
          <PhCopy size="16" weight="bold"/>
        </button>
        <button type="button" class="icon-btn" title="清空" aria-label="清空" @click.stop="clearContent">
          <PhTrash size="16" weight="bold"/>
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 grid grid-rows-2 gap-2 p-3">
      <textarea
          v-model="input"
          data-wheel-allow="true"
          class="text-area"
          :placeholder="mode === 'encode' ? '输入要编码的文本' : '输入 Base64 内容'"
          spellcheck="false"
      />

      <div class="result-box" data-wheel-allow="true">
        <ToolWidgetState
            v-if="!hasInput"
            type="empty"
            compact
            title="等待文本"
            :description="mode === 'encode' ? '输入文本后在本机生成 Base64' : '输入 Base64 后在本机解码'"
        />
        <ToolWidgetState
            v-else-if="hasError"
            type="error"
            compact
            title="解析失败"
            :description="result.error"
        />
        <pre v-else class="result-text">{{ output || (mode === 'encode' ? '编码结果' : '解码结果') }}</pre>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-2 text-[10px] text-white/45 truncate">
      {{ copied ? '已复制到剪贴板' : '本地处理，不上传内容' }}
    </div>
  </div>
</template>

<style scoped>
.codec-widget {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(15, 23, 42, 0.96));
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 36px rgba(2, 6, 23, 0.22);
}

.mode-btn {
  min-width: 42px;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.58);
  transition: background 0.16s ease, color 0.16s ease;
}

.mode-btn.is-active {
  background: rgba(255, 255, 255, 0.20);
  color: white;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.10);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.icon-btn:hover {
  transform: translateY(-1px) scale(1.05);
  background: rgba(255, 255, 255, 0.18);
  color: white;
}

.text-area,
.result-box {
  width: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: 12px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: white;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.text-area {
  resize: none;
  outline: none;
}

.text-area::placeholder,
.result-text {
  color: rgba(255, 255, 255, 0.50);
}

.result-box {
  overflow: auto;
}

.result-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
