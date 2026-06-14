<script setup lang="ts">
import {PhArrowClockwise, PhInfo, PhSpinnerGap, PhWarning} from '@phosphor-icons/vue';

const props = withDefaults(defineProps<{
  type?: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  actionLabel?: string;
  compact?: boolean;
}>(), {
  type: 'empty',
  title: '',
  description: '',
  actionLabel: '',
  compact: false,
});

const emit = defineEmits<{
  (e: 'action'): void;
}>();

const iconMap = {
  loading: PhSpinnerGap,
  empty: PhInfo,
  error: PhWarning,
};

const defaultTitle = {
  loading: '加载中',
  empty: '暂无内容',
  error: '组件暂时不可用',
};

const defaultDescription = {
  loading: '正在准备组件内容',
  empty: '当前没有可展示的数据',
  error: '该组件发生异常，不会影响其他内容',
};
</script>

<template>
  <div class="widget-state" :class="[`widget-state--${props.type}`, { 'widget-state--compact': compact }]">
    <component
        :is="iconMap[props.type]"
        class="state-icon"
        :class="{ 'animate-spin': props.type === 'loading' }"
        :size="compact ? 20 : 26"
        weight="duotone"
        aria-hidden="true"
    />
    <div class="state-copy">
      <div class="state-title">{{ title || defaultTitle[props.type] }}</div>
      <div v-if="!compact" class="state-desc">{{ description || defaultDescription[props.type] }}</div>
    </div>
    <button
        v-if="actionLabel"
        type="button"
        class="state-action"
        @click.stop="emit('action')"
    >
      <PhArrowClockwise v-if="props.type === 'error'" size="14" weight="bold" aria-hidden="true"/>
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.widget-state {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  text-align: center;
  color: var(--text-primary);
  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.12), rgba(var(--overlay-rgb), 0.04)),
      rgba(var(--overlay-rgb), 0.05);
}

.widget-state--compact {
  gap: 5px;
  padding: 10px;
}

.state-icon {
  color: var(--accent-color);
  opacity: 0.9;
}

.widget-state--error .state-icon {
  color: rgb(239, 68, 68);
}

.state-copy {
  min-width: 0;
}

.state-title {
  font-size: 12px;
  line-height: 1.2;
  font-weight: 900;
}

.state-desc {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.state-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.22);
  background: rgba(var(--accent-color-rgb), 0.12);
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 900;
  transition: transform 0.14s ease, filter 0.14s ease;
}

.state-action:hover {
  filter: brightness(1.05);
}

.state-action:active {
  transform: scale(0.96);
}
</style>
