<script setup lang="ts">
import {computed, ref} from 'vue';
import {PhCopy, PhListBullets, PhTerminalWindow} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import type {SiteItem} from '../../../../core/config/types';
import {getTerminalCommandCategoryLabel} from '../../../../core/config/terminalCommands';
import ToolWidgetState from '../../components/ToolWidgetState.vue';
import TerminalModal from './TerminalModal.vue';
import {ensureTerminalBufferState} from './commandMemo';
import {useToast} from '../../../../shared/composables/useToast';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();

const store = useConfigStore();
const toast = useToast();
const terminalState = computed(() => ensureTerminalBufferState(store.config.runtime));
const commands = computed(() => {
  return [...terminalState.value.commands].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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

const visibleCommands = computed(() => {
  if (layout.value.isWide) return commands.value.slice(0, 1);
  if (layout.value.isLarge) return commands.value.slice(0, 6);
  return commands.value.slice(0, 3);
});

const bufferLineCount = computed(() => terminalState.value.buffer ? terminalState.value.buffer.split('\n').length : 0);
const commandCount = computed(() => commands.value.length);

const copyCommand = async (command: string, e?: MouseEvent) => {
  if (props.isEditMode) return;
  e?.stopPropagation();
  try {
    await navigator.clipboard.writeText(command);
    toast.success('命令已复制');
  } catch {
    toast.error('复制失败，请检查浏览器权限');
  }
};
</script>

<template>
  <div
      class="command-widget w-full h-full relative overflow-hidden group transition-all duration-300 rounded-[22px]"
      :class="!isEditMode ? 'cursor-pointer' : 'cursor-move'"
      @click="openModal"
  >
    <div v-if="layout.isMini" class="command-mini">
      <PhTerminalWindow size="23" weight="duotone" class="text-emerald-500"/>
      <div class="text-[10px] text-[var(--widget-muted)] font-bold">CMD</div>
      <div class="text-xs font-bold tabular-nums">{{ commandCount }}</div>
    </div>

    <div v-else class="command-body" :data-layout="layout.isWide ? 'wide' : layout.isTall ? 'tall' : 'standard'">
      <div class="command-head">
        <div class="command-mark">
          <PhTerminalWindow size="18" weight="fill"/>
        </div>
        <div class="min-w-0">
          <div class="command-title">命令备忘</div>
          <div class="command-sub truncate">{{ commandCount }} 条命令 · {{ bufferLineCount }} 行缓冲</div>
        </div>
        <div class="command-count">{{ commandCount }}</div>
      </div>

      <div v-if="commands.length === 0" class="flex-1 min-h-0">
        <ToolWidgetState
            type="empty"
            surface="theme"
            title="还没有常用命令"
            description="打开面板保存命令、分类和备注"
        />
      </div>

      <div v-else class="command-list">
        <div v-for="cmd in visibleCommands" :key="cmd.id" class="command-row">
          <div class="min-w-0">
            <div class="command-row-title truncate">{{ cmd.title }}</div>
            <div class="command-row-code truncate">{{ cmd.command }}</div>
          </div>
          <div class="command-row-side">
            <span class="command-pill">{{ getTerminalCommandCategoryLabel(cmd.category) }}</span>
            <button
                type="button"
                class="command-copy"
                title="复制命令"
                aria-label="复制命令"
                @click="copyCommand(cmd.command, $event)"
            >
              <PhCopy size="13" weight="bold"/>
            </button>
          </div>
        </div>
      </div>

      <div v-if="layout.isLarge" class="command-footer">
        <span class="flex items-center gap-1.5">
          <PhListBullets size="13" weight="bold"/>
          点击管理命令库
        </span>
        <span>{{ terminalState.theme.toUpperCase() }}</span>
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
.command-widget {
  min-width: 0;
  min-height: 0;
  color: var(--widget-text);
  background:
      radial-gradient(circle at 84% 10%, rgba(var(--accent-color-rgb), 0.18), transparent 34%),
      var(--widget-surface);
  border: 1px solid var(--widget-border);
  box-shadow: 0 14px 30px rgba(2, 6, 23, 0.15);
}

.command-mini,
.command-body {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.command-mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
}

.command-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.command-body[data-layout="wide"] {
  display: grid;
  grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.command-head {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.command-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
  border: 1px solid rgba(var(--accent-color-rgb), 0.18);
}

.command-title {
  font-size: 13px;
  line-height: 1.05;
  font-weight: 950;
}

.command-sub {
  margin-top: 5px;
  color: var(--widget-muted);
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
}

.command-count {
  margin-left: auto;
  min-width: 28px;
  height: 24px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.10);
  border: 1px solid rgba(var(--accent-color-rgb), 0.16);
  font-size: 11px;
  font-weight: 950;
}

.command-list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 7px;
  align-content: start;
  overflow: hidden;
}

.command-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  background: var(--widget-surface-2);
  border: 1px solid var(--widget-border);
}

.command-row-title {
  color: var(--widget-text);
  font-size: 11px;
  line-height: 1.1;
  font-weight: 950;
}

.command-row-code {
  margin-top: 5px;
  color: var(--widget-muted);
  font-family: var(--tech-font-family), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
}

.command-row-side {
  display: flex;
  align-items: center;
  gap: 6px;
}

.command-pill {
  max-width: 48px;
  border-radius: 999px;
  padding: 4px 7px;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.10);
  border: 1px solid rgba(var(--accent-color-rgb), 0.14);
  font-size: 10px;
  line-height: 1;
  font-weight: 900;
}

.command-copy {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--widget-muted);
  background: rgba(var(--overlay-rgb), 0.06);
  border: 1px solid var(--widget-border);
  transition: color 0.14s ease, background 0.14s ease, transform 0.14s ease;
}

.command-copy:hover {
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.10);
}

.command-copy:active {
  transform: scale(0.94);
}

.command-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 2px;
  color: var(--widget-muted);
  font-size: 10px;
  line-height: 1;
  font-weight: 850;
}

.command-body[data-layout="wide"] .command-list {
  display: block;
}

.command-body[data-layout="wide"] .command-count,
.command-body[data-layout="wide"] .command-sub {
  display: none;
}

.command-body[data-layout="tall"] .command-head {
  flex-direction: column;
  text-align: center;
}

.command-body[data-layout="tall"] .command-count {
  margin-left: 0;
}

.command-body[data-layout="tall"] .command-row {
  grid-template-columns: minmax(0, 1fr);
}

.command-body[data-layout="tall"] .command-row-side {
  justify-content: space-between;
}
</style>
