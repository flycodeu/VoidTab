<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { PhPencilSimple, PhTrash } from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  x: number;
  y: number;
}>();

const emit = defineEmits(['close', 'edit', 'delete']);

const closeMenu = () => emit('close');

onMounted(() => {
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('click', closeMenu);
});

onUnmounted(() => {
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('click', closeMenu);
});
</script>

<template>
  <Transition name="scale">
    <div
        v-if="show"
        class="fixed z-[9999] min-w-[140px] p-1.5 rounded-xl apple-glass shadow-2xl flex flex-col gap-1 origin-top-left"
        :style="{ top: y + 'px', left: x + 'px' }"
        @click.stop
        @contextmenu.prevent
    >
      <button
          @click="$emit('edit'); closeMenu()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all hover:bg-[var(--sidebar-active)] text-[var(--text-primary)] text-left group w-full"
      >
        <PhPencilSimple size="16" class="opacity-70 group-hover:text-[var(--accent-color)]"/>
        编辑信息
      </button>

      <div class="h-[1px] bg-current opacity-5 my-0.5 mx-2"></div>

      <button
          @click="$emit('delete'); closeMenu()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
      >
        <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
        删除
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.9); }
</style>