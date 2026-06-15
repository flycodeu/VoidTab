<script setup lang="ts">
import {computed, ref} from 'vue';
import {useFocusTrap} from '../../composables/useFocusTrap';
import {useEscapeClose} from '../../composables/useEscapeClose';

type Message = string | string[];

const props = defineProps<{
  show: boolean;
  title: string;
  message: Message;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // 危险态：红色按钮
  closeOnBackdrop?: boolean;
  confirmDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const isActive = computed(() => props.show);
const titleId = `confirm-dialog-title-${Math.random().toString(36).slice(2)}`;
const messageId = `confirm-dialog-message-${Math.random().toString(36).slice(2)}`;
useFocusTrap(dialogRef, isActive);
useEscapeClose(isActive, () => emit('cancel'));

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
      <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" data-modal="1">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="onBackdrop" aria-hidden="true"></div>

        <div
            ref="dialogRef"
            class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
            style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);"
            :role="danger ? 'alertdialog' : 'dialog'"
            aria-modal="true"
            :aria-labelledby="titleId"
            :aria-describedby="messageId"
            tabindex="-1"
            @keydown.esc.prevent.stop="emit('cancel')"
        >
          <div class="w-16 h-16 rounded-full flex items-center justify-center mb-1"
               :class="danger ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'"
               aria-hidden="true">
            <slot name="icon">
              <span class="opacity-60 text-xs"></span>
            </slot>
          </div>

          <div>
            <h3 :id="titleId" class="text-xl font-bold mb-2">{{ title }}</h3>
            <p :id="messageId" class="text-sm opacity-90 leading-relaxed">
              <template v-for="(line, idx) in normalizedMessage()" :key="idx">
                {{ line }}<br v-if="idx !== normalizedMessage().length - 1"/>
              </template>
            </p>
          </div>

          <slot name="body"></slot>

          <div class="grid grid-cols-2 gap-3 w-full mt-2">
            <button
                type="button"
                @click="emit('cancel')"
                class="py-3.5 rounded-2xl font-bold transition-all bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 active:scale-95 opacity-80 hover:opacity-100"
            >
              {{ cancelText ?? '取消' }}
            </button>

            <button
                type="button"
                @click="emit('confirm')"
                :disabled="confirmDisabled"
                class="py-3.5 rounded-2xl font-bold transition-all active:scale-95 text-white shadow-lg"
                :class="[
                  danger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-[var(--accent-color)] hover:brightness-110',
                  confirmDisabled ? 'opacity-45 cursor-not-allowed pointer-events-none active:scale-100' : ''
                ]"
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
