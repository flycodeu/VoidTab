<script setup lang="ts">
import {PhWarning} from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="emit('close')"></div>

        <div
            class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
            style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);"
        >
          <div
              class="w-16 h-16 rounded-full flex items-center justify-center mb-1"
              :class="danger ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-400'"
          >
            <PhWarning :size="32" weight="duotone"/>
          </div>

          <div>
            <h3 class="text-xl font-bold mb-2">{{ title || '确认操作？' }}</h3>
            <p class="text-sm opacity-60 leading-relaxed" v-if="description">{{ description }}</p>
          </div>

          <div class="grid grid-cols-2 gap-3 w-full mt-2">
            <button
                @click="emit('close')"
                class="py-3.5 rounded-2xl font-bold transition-all bg-white/5 hover:bg-white/10 active:scale-95 text-white/80"
            >
              {{ cancelText || '取消' }}
            </button>
            <button
                @click="emit('confirm')"
                class="py-3.5 rounded-2xl font-bold transition-all active:scale-95 text-white shadow-lg"
                :class="danger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-[var(--accent-color)] hover:brightness-110 shadow-blue-500/20'"
            >
              {{ confirmText || '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-scale-enter-active,
.modal-scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-scale-enter-from,
.modal-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
