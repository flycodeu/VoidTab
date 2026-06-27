<script setup lang="ts">
import {computed, ref} from 'vue';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/atom-one-dark.css';

if (!hljs.getLanguage('javascript')) hljs.registerLanguage('javascript', javascript);
if (!hljs.getLanguage('css')) hljs.registerLanguage('css', css);
if (!hljs.getLanguage('json')) hljs.registerLanguage('json', json);
if (!hljs.getLanguage('xml')) hljs.registerLanguage('xml', xml);

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: string;
  rows?: number;
  placeholder?: string;
}>(), {language: 'javascript', rows: 12, placeholder: ''});

const emit = defineEmits<{(e: 'update:modelValue', value: string): void}>();

const preRef = ref<HTMLPreElement | null>(null);

const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const highlighted = computed(() => {
  const code = props.modelValue ?? '';
  const lang = props.language && hljs.getLanguage(props.language) ? props.language : '';
  let out: string;
  try {
    out = lang ? hljs.highlight(code, {language: lang}).value : escapeHtml(code);
  } catch {
    out = escapeHtml(code);
  }
  // Trailing newline keeps the highlight layer tall enough for the last line.
  return out + '\n';
});

const onInput = (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value);

const onScroll = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  if (preRef.value) {
    preRef.value.scrollTop = target.scrollTop;
    preRef.value.scrollLeft = target.scrollLeft;
  }
};
</script>

<template>
  <div class="code-editor" :style="{'--ce-rows': rows}">
    <pre ref="preRef" class="ce-pre" aria-hidden="true"><code class="hljs" v-html="highlighted"></code></pre>
    <textarea
        class="ce-ta"
        :value="modelValue"
        :placeholder="placeholder"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        wrap="off"
        @input="onInput"
        @scroll="onScroll"
    ></textarea>
  </div>
</template>

<style scoped>
.code-editor {
  position: relative;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: #0d1117;
  overflow: hidden;
  --ce-font: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --ce-pad: 12px;
  --ce-fs: 12.5px;
  --ce-lh: 1.55;
}

.ce-pre,
.ce-ta {
  margin: 0;
  padding: var(--ce-pad);
  font-family: var(--ce-font);
  font-size: var(--ce-fs);
  line-height: var(--ce-lh);
  tab-size: 2;
  white-space: pre;
  word-wrap: normal;
  letter-spacing: 0;
  box-sizing: border-box;
}

.ce-pre {
  position: absolute;
  inset: 0;
  margin: 0;
  overflow: hidden;
  pointer-events: none;
  background: transparent;
}

.ce-pre code {
  background: transparent;
  padding: 0;
  font: inherit;
  white-space: pre;
}

.ce-ta {
  position: relative;
  display: block;
  width: 100%;
  min-height: calc(var(--ce-rows) * var(--ce-fs) * var(--ce-lh) + var(--ce-pad) * 2);
  resize: vertical;
  border: 0;
  outline: none;
  overflow: auto;
  color: transparent;
  background: transparent;
  caret-color: #e6edf3;
  -webkit-text-fill-color: transparent;
}

.ce-ta::placeholder {
  color: rgba(230, 237, 243, 0.35);
  -webkit-text-fill-color: rgba(230, 237, 243, 0.35);
}

.ce-ta::selection {
  background: rgba(56, 139, 253, 0.35);
}
</style>
