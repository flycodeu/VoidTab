<script setup lang="ts">
import {PhX, PhSquaresFour} from '@phosphor-icons/vue';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits(['close']);

</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-lg transition-opacity" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-7xl h-[85vh] md:h-[80vh] apple-glass rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/10 bg-[var(--glass-surface)]"
      >
        <div
            class="flex items-center justify-between px-8 py-5 border-b border-[var(--glass-border)] bg-[var(--sidebar-active)] select-none shrink-0 z-10"
        >
          <div class="flex items-center gap-4">
            <div class="p-2.5 rounded-xl bg-[var(--accent-color)] text-white shadow-lg shadow-blue-500/20">
              <PhSquaresFour size="20" weight="fill"/>
            </div>
            <span class="font-bold text-sm tracking-[0.2em] font-tech opacity-90 text-[var(--text-primary)]">
              DATA DASHBOARD
            </span>
          </div>

          <button
              @click="emit('close')"
              class="p-2.5 hover:bg-white/10 rounded-full transition-colors text-[var(--text-primary)]"
          >
            <PhX size="22"/>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.custom-scroll::-webkit-scrollbar {
  width: 5px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.15);
  border-radius: 10px;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
}
</style>