<script setup lang="ts">
defineProps<{
  modelValue: string;
  colors: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
}>();

const pick = (c: string) => emit('update:modelValue', c);
</script>

<template>
  <div class="flex flex-wrap gap-2 pt-2 justify-center sm:justify-start" role="group" aria-label="背景颜色">
    <button
        v-for="c in colors"
        :key="c"
        @click="pick(c)"
        class="w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-offset-2 ring-offset-transparent transition-transform hover:scale-110 border border-black/5"
        :class="modelValue === c ? 'ring-[var(--accent-color)] scale-110' : 'ring-transparent'"
        :style="{ backgroundColor: c }"
        type="button"
        :aria-label="modelValue === c ? `当前背景颜色：${c}` : `选择背景颜色：${c}`"
        :aria-pressed="modelValue === c"
        :title="c"
    />
  </div>
</template>
