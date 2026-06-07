<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import type {SiteItem} from '../../../../core/config/types';
import {PhTerminalWindow, PhCopy, PhCode} from '@phosphor-icons/vue';
import TerminalModal from './TerminalModal.vue';
import {useToast} from '../../../../shared/composables/useToast';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const toast = useToast();

const store = useConfigStore();
const content = computed<string>({
  get: () => store.config.runtime.terminal_buffer?.buffer || '',
  set: (v) => {
    if (!store.config.runtime.terminal_buffer) store.config.runtime.terminal_buffer = {buffer: '', theme: 'none'};
    store.config.runtime.terminal_buffer.buffer = v;
  },
});

const showModal = ref(false);

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};

const layout = computed(() => {
  const w = props.item.w || 1;
  const h = props.item.h || 1;
  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    isTall: w === 1 && h >= 2,
    isStandard: w === 2 && h === 2,
    isLarge: w >= 2 && h >= 3
  };
});

const lineCount = computed(() => content.value ? content.value.split('\n').length : 0);
const charCount = computed(() => content.value ? content.value.length : 0);

const previewLines = computed(() => {
  if (!content.value) return [];
  return content.value
      .split('\n')
      .slice(0, layout.value.isLarge ? 12 : 6); // 稍微增加显示的行数
});

const copyToClipboard = async (e: MouseEvent) => {
  if (props.isEditMode) return;
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(content.value);
    toast.success('缓冲区内容已复制');
  } catch {
    toast.error('复制失败，请检查浏览器权限');
  }
};
</script>

<template>
  <div
      class="w-full h-full relative overflow-hidden group font-mono transition-all duration-300 rounded-[22px]"
      :class="[
        !isEditMode ? 'cursor-pointer' : 'cursor-move',
        'bg-[var(--widget-surface)] text-[var(--widget-text)] border border-[var(--widget-border)] hover:bg-[var(--widget-surface-2)] shadow-sm'
      ]"
      @click="openModal"
  >
    <div v-if="layout.isMini" class="relative z-10 w-full h-full flex flex-col items-center justify-center p-2 gap-1">
      <PhTerminalWindow size="22" weight="duotone" class="text-indigo-500 mb-0.5"/>
      <div class="text-[10px] text-[var(--widget-muted)] font-bold">BUF</div>
      <div class="text-xs font-bold tabular-nums">{{ charCount > 999 ? '999+' : charCount }}</div>
    </div>

    <div v-else-if="layout.isWide" class="relative z-10 w-full h-full flex flex-col justify-center px-4 py-2">
      <div
          class="flex items-center justify-between text-[10px] text-[var(--widget-muted)] mb-1 border-b border-[var(--widget-border)] pb-1">
        <span class="flex items-center gap-1.5">
          <PhCode size="12" weight="bold"/>
          <span>TERMINAL</span>
        </span>
        <span class="font-mono">{{ lineCount }} LN</span>
      </div>
      <div class="text-xs truncate opacity-80 font-mono">
        <span class="mr-2 text-indigo-500 font-bold">❯</span>{{ content || 'Waiting for input...' }}
      </div>
    </div>

    <div v-else class="relative z-10 w-full h-full flex flex-col p-4">
      <div class="flex items-center justify-between text-[10px] text-[var(--widget-muted)] mb-2 shrink-0 select-none">
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span class="font-bold tracking-wider">IDLE</span>
        </div>
        <div class="flex items-center gap-3">
          <span>{{ (charCount / 1024).toFixed(1) }} KB</span>
          <button
              @click="copyToClipboard"
              class="hover:text-[var(--accent-color)] transition-colors p-1 -mr-1 rounded hover:bg-[var(--widget-border)]"
              title="Copy All"
          >
            <PhCopy size="14"/>
          </button>
        </div>
      </div>

      <div
          class="flex-1 overflow-hidden text-xs leading-relaxed font-mono break-all whitespace-pre-wrap pointer-events-none">
        <template v-if="content">
          <div v-for="(line, index) in previewLines" :key="index" class="flex">
            <span class="mr-3 text-[var(--widget-muted)] opacity-50 select-none w-4 text-right shrink-0">{{
                index + 1
              }}</span>
            <span class="text-[var(--widget-text)] opacity-90 truncate">{{ line }}</span>
          </div>
          <div v-if="previewLines.length < lineCount" class="pl-7 opacity-40 mt-1 italic text-[10px]">
            ... {{ lineCount - previewLines.length }} more lines
          </div>
        </template>

        <div v-else class="h-full flex flex-col items-center justify-center opacity-40 italic gap-2">
          <PhTerminalWindow size="24" weight="duotone"/>
          <div class="text-center">
            <span class="text-indigo-500 font-bold">>_</span> System Ready<br>Click to Edit
          </div>
        </div>
      </div>

      <div
          class="mt-auto pt-2 border-t border-[var(--widget-border)] text-[10px] text-[var(--widget-muted)] flex justify-between select-none">
        <span>MODE: INSERT</span>
        <span class="animate-pulse font-bold text-indigo-500">_</span>
      </div>
    </div>

    <Teleport to="body">
      <TerminalModal
          v-if="showModal"
          :show="showModal"
          @close="showModal = false"
      />
    </Teleport>

  </div>
</template>

<style scoped>
</style>
