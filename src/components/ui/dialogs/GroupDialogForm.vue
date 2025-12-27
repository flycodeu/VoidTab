<script setup lang="ts">
import { computed, ref } from 'vue';
import { PhX, PhWarningCircle } from '@phosphor-icons/vue';
import IconPicker from './IconPicker.vue';

type GroupForm = { title: string; icon: string };

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  modelValue: GroupForm;
  errorMsg?: string;
  icons: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: GroupForm): void;
  (e: 'close'): void;
  (e: 'submit'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const canSubmit = computed(() => props.modelValue.title.trim().length > 0);

const setTitle = (v: string) => emit('update:modelValue', { ...props.modelValue, title: v });
const setIcon = (v: string) => emit('update:modelValue', { ...props.modelValue, icon: v });

defineExpose({
  focusTitle() {
    inputRef.value?.focus();
    inputRef.value?.select?.();
  }
});
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="emit('close')" />

      <div
          class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-6 border"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
          @click.stop
      >
        <!-- header -->
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑分类' : '新建分类' }}</h3>
          <button
              @click="emit('close')"
              class="p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              :style="{ color: 'var(--modal-text)' }"
              aria-label="Close"
          >
            <PhX size="20" />
          </button>
        </div>

        <!-- body -->
        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">分类名称</label>

            <input
                ref="inputRef"
                :value="modelValue.title"
                @input="setTitle(($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="例如：工作..."
                class="w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                :class="errorMsg
                ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/40'
                : 'border-current/10 focus:ring-2 focus:ring-[var(--accent-color)]/40'"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            />

            <div v-if="errorMsg" class="flex items-center gap-2 text-xs font-bold text-red-500 pt-1">
              <PhWarningCircle size="16" weight="fill" />
              {{ errorMsg }}
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">图标</label>
            <IconPicker :modelValue="modelValue.icon" @update:modelValue="setIcon" :icons="icons" />
          </div>
        </div>

        <!-- footer -->
        <button
            @click="emit('submit')"
            :disabled="!canSubmit"
            class="w-full py-3 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95"
            :class="canSubmit
            ? 'bg-[var(--accent-color)] text-white hover:brightness-110'
            : 'bg-white/10 text-white/40 cursor-not-allowed'"
        >
          保存
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
</style>
