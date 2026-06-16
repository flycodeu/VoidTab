<script setup lang="ts">
import {computed} from 'vue';
import {PhArrowClockwise, PhCheckCircle, PhInfo, PhSpinnerGap, PhWarningCircle} from '@phosphor-icons/vue';

const props = withDefaults(defineProps<{
  type?: 'empty' | 'error' | 'loading' | 'ok';
  title?: string;
  description?: string;
  actionLabel?: string;
  compact?: boolean;
  surface?: 'dark' | 'theme';
  icon?: any;
}>(), {
  type: 'empty',
  title: '',
  description: '',
  actionLabel: '',
  compact: false,
  surface: 'dark',
  icon: null,
});

const emit = defineEmits<{
  (e: 'action'): void;
}>();

const defaultIcon = computed(() => {
  if (props.icon) return props.icon;
  if (props.type === 'loading') return PhSpinnerGap;
  if (props.type === 'error') return PhWarningCircle;
  if (props.type === 'ok') return PhCheckCircle;
  return PhInfo;
});

const defaultTitle = computed(() => {
  if (props.title) return props.title;
  if (props.type === 'loading') return '处理中';
  if (props.type === 'error') return '暂时不可用';
  if (props.type === 'ok') return '已就绪';
  return '等待输入';
});

const defaultDescription = computed(() => {
  if (props.description) return props.description;
  if (props.type === 'loading') return '正在准备本地工具状态';
  if (props.type === 'error') return '请检查输入内容或稍后重试';
  if (props.type === 'ok') return '结果已在本机生成';
  return '输入内容后会在本机完成处理';
});
</script>

<template>
  <div
      class="tool-state"
      :class="[`tool-state--${type}`, `tool-state--${surface}`, { 'tool-state--compact': compact }]"
  >
    <component
        :is="defaultIcon"
        class="tool-state__icon"
        :class="{ 'animate-spin': type === 'loading' }"
        :size="compact ? 17 : 24"
        weight="duotone"
        aria-hidden="true"
    />
    <div class="tool-state__copy">
      <div class="tool-state__title">{{ defaultTitle }}</div>
      <div v-if="!compact" class="tool-state__desc">{{ defaultDescription }}</div>
    </div>
    <button
        v-if="actionLabel"
        type="button"
        class="tool-state__action"
        @click.stop="emit('action')"
    >
      <PhArrowClockwise v-if="type === 'error'" size="13" weight="bold" aria-hidden="true"/>
      <span>{{ actionLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
.tool-state {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px;
  text-align: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.035)),
      rgba(15, 23, 42, 0.20);
  color: rgba(255, 255, 255, 0.88);
}

.tool-state--theme {
  color: var(--widget-text);
  border-color: var(--widget-border);
  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.08), rgba(var(--overlay-rgb), 0.025)),
      var(--widget-surface-2);
}

.tool-state--compact {
  gap: 5px;
  padding: 8px;
}

.tool-state__icon {
  color: rgba(var(--accent-color-rgb), 0.95);
  flex-shrink: 0;
}

.tool-state--error .tool-state__icon {
  color: rgb(248, 113, 113);
}

.tool-state--ok .tool-state__icon {
  color: rgb(52, 211, 153);
}

.tool-state__copy {
  min-width: 0;
}

.tool-state__title {
  font-size: 11px;
  line-height: 1.2;
  font-weight: 950;
}

.tool-state__desc {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.35;
  color: currentColor;
  opacity: 0.58;
}

.tool-state__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 26px;
  max-width: 100%;
  padding: 0 9px;
  border-radius: 9px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.26);
  background: rgba(var(--accent-color-rgb), 0.14);
  color: var(--accent-color);
  font-size: 10px;
  line-height: 1;
  font-weight: 900;
  transition: filter 0.14s ease, transform 0.14s ease;
}

.tool-state__action:hover {
  filter: brightness(1.06);
}

.tool-state__action:active {
  transform: scale(0.96);
}
</style>
