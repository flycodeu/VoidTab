<script setup lang="ts">
import {ref, onErrorCaptured, watch} from 'vue';
import WidgetState from './WidgetState.vue';

const props = defineProps<{
  resetKey?: string | number;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'error', error: unknown): void;
}>();

const error = ref<unknown>(null);
const resetVersion = ref(0);

onErrorCaptured((err) => {
  error.value = err;
  emit('error', err);
  return false;
});

watch(() => props.resetKey, () => {
  error.value = null;
  resetVersion.value += 1;
});

const retry = () => {
  error.value = null;
  resetVersion.value += 1;
};
</script>

<template>
  <WidgetState
      v-if="error"
      type="error"
      :title="title || '组件渲染失败'"
      description="这个组件已被隔离，其他网站和组件仍可正常使用。"
      actionLabel="重试"
      @action="retry"
  />
  <div v-else :key="resetVersion" class="w-full h-full min-w-0 min-h-0">
    <slot/>
  </div>
</template>
