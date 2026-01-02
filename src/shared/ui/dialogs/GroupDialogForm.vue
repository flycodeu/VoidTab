<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhX, PhWarningCircle, PhCheck} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import IconPicker from './IconPicker.vue';

type GroupForm = {
  title: string;
  icon: string;
  iconColor?: string;
  iconBgColor?: string;
};

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

const presetColors = [
  {fg: '#3b82f6'}, {fg: '#8b5cf6'}, {fg: '#ec4899'}, {fg: '#ef4444'},
  {fg: '#f59e0b'}, {fg: '#10b981'}, {fg: '#06b6d4'}, {fg: '#64748b'},
];

const customHex = ref('');

watch(() => props.modelValue.iconColor, (val) => {
  if (val && !presetColors.some(c => c.fg === val)) {
    customHex.value = val;
  } else {
    customHex.value = '';
  }
}, {immediate: true});

const canSubmit = computed(() => {
  if (props.modelValue.title.trim().length === 0) return false;
  if (customHex.value && !/^#([0-9a-fA-F]{6})$/.test(customHex.value)) return false;
  return true;
});

const selectColor = (color: { fg: string } | null) => {
  customHex.value = '';
  const newValue = {...props.modelValue};
  if (color) {
    newValue.iconColor = color.fg;
    newValue.iconBgColor = undefined;
  } else {
    newValue.iconColor = undefined;
    newValue.iconBgColor = undefined;
  }
  emit('update:modelValue', newValue);
};

const onCustomHexInput = (e: Event) => {
  let val = (e.target as HTMLInputElement).value.trim();
  if (val && !val.startsWith('#') && /^[0-9a-fA-F]+$/.test(val)) val = '#' + val;
  if (val.length > 7) val = val.slice(0, 7);

  customHex.value = val;
  (e.target as HTMLInputElement).value = val;

  if (/^#([0-9a-fA-F]{6})$/.test(val)) {
    const newValue = {...props.modelValue, iconColor: val, iconBgColor: undefined};
    emit('update:modelValue', newValue);
  }
};

const setTitle = (v: string) => emit('update:modelValue', {...props.modelValue, title: v});
const setIcon = (v: string) => emit('update:modelValue', {...props.modelValue, icon: v});

const PreviewIcon = computed(() => {
  const name = 'Ph' + props.modelValue.icon;
  return (PhIcons as any)[name] || PhIcons.PhFolder;
});

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
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="emit('close')"/>

      <div
          class="relative w-full max-w-[500px] rounded-3xl shadow-2xl flex flex-col border transition-all h-[85vh] max-h-[720px] overflow-hidden"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
          @click.stop
      >

        <div class="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-white/5">
          <h3 class="text-lg font-bold">{{ isEdit ? '编辑分类' : '新建分类' }}</h3>
          <button
              @click="emit('close')"
              class="p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              :style="{ color: 'var(--modal-text)' }"
              aria-label="Close"
          >
            <PhX size="20"/>
          </button>
        </div>

        <div class="flex-1 flex flex-col overflow-hidden">

          <div class="flex-shrink-0 px-6 py-5 space-y-6 border-b border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">

            <div class="flex gap-4 items-stretch h-[52px]">
              <div
                  class="aspect-square h-full rounded-xl flex items-center justify-center border transition-all flex-shrink-0"
                  :style="{
                  backgroundColor: 'rgba(128,128,128,0.08)',
                  borderColor: 'var(--modal-border)',
                  color: modelValue.iconColor || 'var(--text-primary)'
                }"
              >
                <component :is="PreviewIcon" size="28" weight="duotone"/>
              </div>

              <div class="flex-1 relative">
                <input
                    ref="inputRef"
                    :value="modelValue.title"
                    @input="setTitle(($event.target as HTMLInputElement).value)"
                    type="text"
                    placeholder="分类名称..."
                    class="w-full h-full rounded-xl px-4 text-sm font-bold outline-none transition-all border focus:border-[var(--accent-color)]"
                    style="background-color: var(--modal-input-bg); color: var(--modal-text); border-color: transparent;"
                />
                <div v-if="errorMsg" class="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" :title="errorMsg">
                  <PhWarningCircle size="18" weight="fill"/>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex justify-between items-end">
                <span class="text-xs font-bold opacity-50 uppercase tracking-wider">主题色</span>

                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all shadow-sm
                            bg-white dark:bg-black
                            border-slate-200 dark:border-white/20
                            focus-within:border-[var(--accent-color)] focus-within:ring-2 focus-within:ring-[var(--accent-color)]/20">
                  <span class="text-[10px] font-bold opacity-50 select-none">自定义</span>
                  <div class="w-px h-3 bg-current opacity-20"></div>
                  <input
                      type="text"
                      v-model="customHex"
                      @input="onCustomHexInput"
                      placeholder="#HEX"
                      class="w-16 bg-transparent text-xs font-mono font-bold outline-none uppercase text-center"
                      style="color: var(--modal-text);"
                      maxlength="7"
                  />
                  <div class="w-3 h-3 rounded-full border border-black/10"
                       :style="{ backgroundColor: customHex || 'transparent' }"></div>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button
                    @click="selectColor(null)"
                    class="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    :class="!modelValue.iconColor ? 'border-[var(--text-primary)]' : 'border-transparent bg-black/5 dark:bg-white/10'"
                    title="默认"
                >
                  <PhX v-if="!modelValue.iconColor" size="14"/>
                </button>

                <button
                    v-for="c in presetColors"
                    :key="c.fg"
                    @click="selectColor(c)"
                    class="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative ring-offset-1 ring-offset-transparent focus:ring-2 focus:ring-[var(--accent-color)]"
                    :style="{ backgroundColor: c.fg }"
                >
                  <PhCheck v-if="modelValue.iconColor === c.fg" size="16" class="text-white drop-shadow-md"
                           weight="bold"/>
                </button>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-hidden px-6 pt-4 pb-2">
            <IconPicker :modelValue="modelValue.icon" @update:modelValue="setIcon" :icons="icons"/>
          </div>

        </div>

        <div class="flex-shrink-0 p-5 border-t border-white/5 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md z-10">
          <button
              @click="emit('submit')"
              :disabled="!canSubmit"
              class="w-full py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              :class="[
                canSubmit
                  ? 'bg-[var(--accent-color)] text-white shadow-[var(--accent-color)]/30'
                  : 'bg-black/10 dark:bg-white/10 text-[var(--text-tertiary)]'
              ]"
          >
            {{ isEdit ? '保存更改' : '立即创建' }}
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>