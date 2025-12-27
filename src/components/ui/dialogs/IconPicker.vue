<script setup lang="ts">
import { computed } from 'vue';
import * as PhIcons from '@phosphor-icons/vue';

const props = defineProps<{
  modelValue: string;
  icons: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
}>();

const getIconComp = (name: string) => {
  const key = 'Ph' + String(name).replace(/^Ph/, '');
  return (PhIcons as any)[key] || (PhIcons as any).PhFolder;
};

const isActive = (name: string) => computed(() => props.modelValue === name);
console.log(isActive)
</script>

<template>
  <div
      class="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 custom-scroll rounded-2xl border border-current/10"
      style="background-color: rgba(255,255,255,0.02);"
  >
    <button
        v-for="icon in icons"
        :key="icon"
        type="button"
        @click="emit('update:modelValue', icon)"
        class="aspect-square rounded-2xl flex items-center justify-center transition-all active:scale-95"
        :class="modelValue === icon
        ? 'bg-[var(--accent-color)] text-white shadow-lg'
        : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'"
    >
      <component :is="getIconComp(icon)" size="24" weight="duotone" />
    </button>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,0.25);
  border-radius: 999px;
}
.custom-scroll:hover::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); }
</style>
