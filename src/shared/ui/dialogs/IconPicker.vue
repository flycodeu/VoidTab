<script setup lang="ts">
import {computed, ref} from 'vue';
import {PhMagnifyingGlass, PhWarningCircle} from '@phosphor-icons/vue';
import {resolvePhosphorIcon} from '../../icons/phosphorIconMap';

const props = defineProps<{
  modelValue: string;
  icons: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', icon: string): void;
}>();

const searchQuery = ref('');
const idSuffix = Math.random().toString(36).slice(2);
const pickerLabelId = `icon-picker-label-${idSuffix}`;
const searchInputId = `icon-picker-search-${idSuffix}`;
const iconResultsId = `icon-picker-results-${idSuffix}`;

const filteredIcons = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return props.icons;
  return props.icons.filter(name => name.toLowerCase().includes(query));
});

const getIconComp = (name: string) => {
  return resolvePhosphorIcon(name, 'Question');
};
</script>

<template>
  <div class="flex flex-col h-full gap-3 overflow-hidden" role="group" :aria-labelledby="pickerLabelId">
    <span :id="pickerLabelId" class="sr-only">选择分类图标</span>

    <div class="flex-shrink-0 relative group pt-1">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] mt-0.5 pointer-events-none">
        <PhMagnifyingGlass size="14" weight="bold" aria-hidden="true"/>
      </div>
      <input
          :id="searchInputId"
          v-model="searchQuery"
          type="text"
          placeholder="搜索图标..."
          aria-label="搜索分类图标"
          :aria-controls="iconResultsId"
          autocomplete="off"
          class="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--accent-color)] rounded-xl py-2.5 pl-9 pr-3 text-xs outline-none transition-all placeholder:text-[var(--text-tertiary)]"
          style="color: var(--modal-text);"
      />
    </div>

    <div
        :id="iconResultsId"
        class="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-2 border border-black/5 dark:border-white/5 rounded-xl p-2 bg-black/[0.02] dark:bg-white/[0.02]">
      <div class="grid grid-cols-7 gap-2">
        <button
            type="button"
            v-for="icon in filteredIcons"
            :key="icon"
            @click="emit('update:modelValue', icon)"
            class="aspect-square flex flex-col items-center justify-center rounded-xl transition-all duration-200 border active:scale-95"
            :class="[
            modelValue === icon
              ? 'bg-[var(--accent-color)] text-white shadow-md border-[var(--accent-color)] scale-105'
              : 'border-transparent text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10 hover:scale-110'
          ]"
            :title="icon"
            :aria-label="modelValue === icon ? `当前图标：${icon}` : `选择图标：${icon}`"
            :aria-pressed="modelValue === icon"
        >
          <component :is="getIconComp(icon)" size="24" :weight="modelValue === icon ? 'fill' : 'duotone'" aria-hidden="true"/>
        </button>

        <div v-if="filteredIcons.length === 0" class="col-span-7 py-10 flex flex-col items-center opacity-50 gap-2" role="status">
          <PhWarningCircle size="24" aria-hidden="true"/>
          <span class="text-xs">未找到 "{{ searchQuery }}"</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 12px; /* 足够宽，方便鼠标点击 */
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05); /* 轨道稍微深一点，提示这里可滚动 */
  border-radius: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.4); /* 滑块颜色加深 */
  border-radius: 6px;
  border: 2px solid transparent; /* 留白，让滑块不至于太傻大黑粗 */
  background-clip: content-box;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128, 128, 128, 0.6); /* 悬停时更深 */
}
</style>
