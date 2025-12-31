<script setup lang="ts">
import {PhGear, PhSquaresFour} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  groups: Array<{ id: string; title: string; icon: string; items?: any[] }>; // items 可选
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
      class="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-center justify-between px-3 py-2 border-t border-white/10 transition-transform duration-300"
      style="background: var(--modal-bg); backdrop-filter: blur(25px);"
  >
    <div class="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar pr-2">
      <button
          v-for="group in groups"
          :key="group.id"
          @click="emit('update:activeGroupId', group.id)"
          class="relative flex flex-col items-center justify-center min-w-[4rem] h-[3.8rem] rounded-xl transition-all border border-transparent"
          :class="activeGroupId === group.id
            ? 'bg-white/10 text-[var(--accent-color)] shadow-sm border-white/5'
            : 'text-[var(--text-secondary)] opacity-60 hover:opacity-100'"
      >
        <component
            :is="(PhIcons as any)['Ph' + group.icon] || PhSquaresFour"
            size="20"
            :weight="activeGroupId === group.id ? 'fill' : 'regular'"
        />
        <span class="text-[10px] font-medium mt-0.5 truncate max-w-[3.5em]">{{ group.title }}</span>

        <span v-if="group.items?.length"
              class="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-current opacity-40"></span>
      </button>
    </div>

    <div class="pl-2 border-l border-white/10 ml-1">
      <button
          @click="emit('openSettings')"
          class="p-3 rounded-full bg-white/5 text-[var(--text-primary)] active:scale-90 transition-transform border border-white/5"
      >
        <PhGear size="22" weight="fill"/>
      </button>
    </div>
  </div>
</template>