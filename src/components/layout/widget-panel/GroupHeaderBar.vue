<script setup lang="ts">
import {ref} from 'vue';
import {PhCaretDown, PhSortAscending} from '@phosphor-icons/vue';

interface Props {
  groupName: string;
  count: number;
  sortKey?: string; // 预留排序字段
}

defineProps<Props>();

// 仅做 UI 交互，暂不涉及真实排序逻辑
const isSortOpen = ref(false);
const currentSortLabel = ref('默认排序');

const toggleSort = () => {
  isSortOpen.value = !isSortOpen.value;
};
</script>

<template>
  <div class="w-full flex items-end justify-between mb-6 px-2 animate-fade-in select-none">
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

    <div class="relative z-20">
      <button
          @click="toggleSort"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-[var(--text-primary)] hover:bg-white/10 active:scale-95 border border-transparent hover:border-white/5"
          :class="{ 'bg-white/5': isSortOpen }"
      >
        <PhSortAscending size="16" weight="duotone" class="opacity-70"/>
        <span class="opacity-80">{{ currentSortLabel }}</span>
        <PhCaretDown
            size="14"
            class="opacity-50 transition-transform duration-300"
            :class="{ 'rotate-180': isSortOpen }"
        />
      </button>

      <transition name="scale-fade">
        <div
            v-if="isSortOpen"
            class="absolute right-0 top-full mt-2 w-32 py-1 rounded-xl bg-[rgba(30,30,30,0.85)] backdrop-blur-md border border-white/10 shadow-xl flex flex-col overflow-hidden"
            @mouseleave="isSortOpen = false"
        >
          <div v-for="label in ['默认排序', '名称 A-Z', '最近访问']" :key="label">
            <button
                class="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                @click="currentSortLabel = label; isSortOpen = false"
            >
              {{ label }}
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

.scale-fade-enter-active,
.scale-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-fade-enter-from,
.scale-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>