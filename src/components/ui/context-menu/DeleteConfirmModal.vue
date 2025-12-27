<script setup lang="ts">
import {PhTrash} from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  targetType: 'site' | 'group';
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('cancel')"></div>

        <div
            class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
            style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);"
        >
          <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-1">
            <PhTrash :size="32" weight="duotone"/>
          </div>

          <div>
            <h3 class="text-xl font-bold mb-2">确认删除？</h3>
            <p class="text-sm opacity-60 leading-relaxed">
              删除后无法恢复，<br/>
              确定要移除这个{{ targetType === 'group' ? '分组' : '图标' }}吗？
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 w-full mt-2">
            <button
                @click="emit('cancel')"
                class="py-3.5 rounded-2xl font-bold transition-all bg-white/5 hover:bg-white/10 active:scale-95 text-white/80"
            >
              取消
            </button>
            <button
                @click="emit('confirm')"
                class="py-3.5 rounded-2xl font-bold transition-all bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-lg shadow-red-500/30"
            >
              确认删除
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
