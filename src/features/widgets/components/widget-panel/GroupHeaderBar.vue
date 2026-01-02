<script setup lang="ts">
import {ref, computed} from 'vue';
import {
  PhCaretDown,
  PhSortAscending,
  PhTextAa,
  PhClock
} from '@phosphor-icons/vue';
import type {GroupSortKey} from '../../../../core/config/types.ts';

interface Props {
  groupName: string;
  count: number;
  sortKey?: GroupSortKey; // 接收当前排序状态
}

const props = withDefaults(defineProps<Props>(), {
  sortKey: 'custom'
});

const emit = defineEmits<{
  (e: 'update:sortKey', key: GroupSortKey): void;
}>();

const isSortOpen = ref(false);

const sortOptions = [
  {label: '默认排序', value: 'custom', icon: PhSortAscending},
  {label: '名称 (A-Z)', value: 'name', icon: PhTextAa},
  {label: '最近访问', value: 'lastVisited', icon: PhClock},
] as const;

const currentLabel = computed(() =>
    sortOptions.find(o => o.value === props.sortKey)?.label || '默认排序'
);

const handleSelect = (key: string) => {
  emit('update:sortKey', key as GroupSortKey);
  isSortOpen.value = false;
};
</script>

<template>
  <div class="w-full flex items-end justify-between mb-6 px-2 animate-fade-in select-none relative z-20">
    <div class="flex items-baseline gap-3 overflow-hidden">
      <h2
          class="text-2xl font-bold text-[var(--text-primary)] tracking-tight truncate"
          style="text-shadow: 0 2px 10px rgba(0,0,0,0.1);"
      >
        {{ groupName }}
      </h2>
      <span class="text-sm font-medium text-[var(--text-primary)] opacity-50 shrink-0">
        · {{ count }} 个站点
      </span>
    </div>

    <div class="relative">
      <button
          @click="isSortOpen = !isSortOpen"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-[var(--text-primary)] hover:bg-white/10 active:scale-95 border border-transparent hover:border-white/5"
          :class="{ 'bg-white/5': isSortOpen }"
          title="切换排序方式"
      >
        <component
            :is="sortOptions.find(o => o.value === sortKey)?.icon || PhSortAscending"
            size="16"
            weight="duotone"
            class="opacity-70"
        />
        <span class="opacity-80">{{ currentLabel }}</span>
        <PhCaretDown
            size="14"
            class="opacity-50 transition-transform duration-300"
            :class="{ 'rotate-180': isSortOpen }"
        />
      </button>

      <transition name="scale-fade">
        <div
            v-if="isSortOpen"
            class="absolute right-0 top-full mt-2 w-36 py-1 rounded-xl bg-[rgba(30,30,30,0.9)] backdrop-blur-md border border-white/10 shadow-xl flex flex-col overflow-hidden z-50"
            @mouseleave="isSortOpen = false"
        >
          <div v-for="opt in sortOptions" :key="opt.value">
            <button
                class="w-full text-left px-4 py-2.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-between group"
                @click="handleSelect(opt.value)"
            >
              <div class="flex items-center gap-2">
                <component :is="opt.icon" size="14" weight="bold" class="opacity-60 group-hover:opacity-100"/>
                <span>{{ opt.label }}</span>
              </div>

              <span v-if="sortKey === opt.value" class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>
            </button>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.scale-fade-enter-active, .scale-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-fade-enter-from, .scale-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>