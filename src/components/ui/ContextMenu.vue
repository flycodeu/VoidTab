<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { PhPencilSimple, PhTrash, PhCopy } from '@phosphor-icons/vue';

const props = defineProps<{
  x: number;
  y: number;
  show: boolean;
}>();

const emit = defineEmits(['close', 'edit', 'delete']);

// 点击外部关闭
const closeMenu = () => emit('close');

onMounted(() => window.addEventListener('click', closeMenu));
onUnmounted(() => window.removeEventListener('click', closeMenu));
</script>

<template>
  <Transition name="scale">
    <div
        v-if="show"
        class="fixed z-[999] min-w-[160px] bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-white/20 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1"
        :style="{ top: y + 'px', left: x + 'px' }"
        @click.stop
    >
      <button @click="$emit('edit')" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-500 hover:text-white transition-colors text-left">
        <PhPencilSimple size="16" /> 编辑图标
      </button>
      <button class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-500 hover:text-white transition-colors text-left">
        <PhCopy size="16" /> 复制链接
      </button>
      <div class="h-[1px] bg-slate-200 dark:bg-slate-700 my-0.5"></div>
      <button @click="$emit('delete')" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors text-left">
        <PhTrash size="16" /> 删除
      </button>
    </div>
  </Transition>
</template>