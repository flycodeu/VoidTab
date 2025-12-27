<script setup lang="ts">
import {PhGear, PhSquaresFour} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  groups: Array<{ id: string; title: string; icon: string }>;
  activeGroupId: string;
}>();

const emit = defineEmits<{
  (e: 'update:activeGroupId', id: string): void;
  (e: 'openSettings'): void;
}>();
</script>

<template>
  <div
      v-if="show"
      class="fixed bottom-0 left-0 right-0 z-40 md:hidden flex items-center justify-between px-4 py-3 border-t border-white/10 transition-transform duration-300"
      style="background: var(--modal-bg); backdrop-filter: blur(20px);"
  >
    <div class="flex-1 flex items-center gap-3 overflow-x-auto no-scrollbar pr-4">
      <button
          v-for="group in groups"
          :key="group.id"
          @click="emit('update:activeGroupId', group.id)"
          class="flex flex-col items-center justify-center p-2 rounded-xl transition-all min-w-[3.5rem]"
          :class="activeGroupId === group.id ? 'bg-[var(--accent-color)] text-white shadow-lg' : 'text-[var(--text-primary)] opacity-50'"
      >
        <component :is="(PhIcons as any)['Ph' + group.icon] || PhSquaresFour" size="20" weight="bold"/>
        <span class="text-[10px] font-bold mt-1 truncate max-w-[4em]">{{ group.title }}</span>
      </button>
    </div>

    <div class="pl-3 border-l border-current/10 ml-1">
      <button
          @click="emit('openSettings')"
          class="p-2.5 rounded-full bg-black/5 dark:bg-white/10 text-[var(--text-primary)] active:scale-95 transition-transform"
      >
        <PhGear size="20" weight="fill"/>
      </button>
    </div>
  </div>
</template>
