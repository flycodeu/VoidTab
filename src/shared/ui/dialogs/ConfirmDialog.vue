<script setup lang="ts">
type Message = string | string[];

const props = defineProps<{
  show: boolean;
  title: string;
  message: Message;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // 危险态：红色按钮
  closeOnBackdrop?: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();

const onBackdrop = () => {
  if (props.closeOnBackdrop === false) return;
  emit('cancel');
};

const normalizedMessage = () => {
  if (Array.isArray(props.message)) return props.message;
  return [props.message];
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="onBackdrop"></div>

        <div
            class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
            style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);"
        >
          <div class="w-16 h-16 rounded-full flex items-center justify-center mb-1"
               :class="danger ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'">
            <slot name="icon">
              <span class="opacity-60 text-xs">ICON</span>
            </slot>
          </div>

          <div>
            <h3 class="text-xl font-bold mb-2">{{ title }}</h3>
            <p class="text-sm opacity-90 leading-relaxed">
              <template v-for="(line, idx) in normalizedMessage()" :key="idx">
                {{ line }}<br v-if="idx !== normalizedMessage().length - 1"/>
              </template>
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 w-full mt-2">
            <button
                @click="emit('cancel')"
                class="py-3.5 rounded-2xl font-bold transition-all bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 active:scale-95 opacity-80 hover:opacity-100"
            >
              {{ cancelText ?? '取消' }}
            </button>

            <button
                @click="emit('confirm')"
                class="py-3.5 rounded-2xl font-bold transition-all active:scale-95 text-white shadow-lg"
                :class="danger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-[var(--accent-color)] hover:brightness-110'"
            >
              {{ confirmText ?? '确认' }}
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
