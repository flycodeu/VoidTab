<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhX, PhWarningCircle, PhCheck} from '@phosphor-icons/vue';
import IconPicker from './IconPicker.vue';
import {useFocusTrap} from '../../composables/useFocusTrap';
import {useEscapeClose} from '../../composables/useEscapeClose';
import {resolvePhosphorIcon} from '../../icons/phosphorIconMap';

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
const dialogRef = ref<HTMLElement | null>(null);
const idSuffix = Math.random().toString(36).slice(2);
const dialogTitleId = `group-dialog-title-${idSuffix}`;
const groupNameInputId = `group-dialog-name-${idSuffix}`;
const groupNameErrorId = `group-dialog-name-error-${idSuffix}`;
const themeColorLabelId = `group-dialog-theme-color-${idSuffix}`;
const customHexInputId = `group-dialog-custom-hex-${idSuffix}`;
const isDialogActive = computed(() => props.show);
useFocusTrap(dialogRef, isDialogActive);
useEscapeClose(isDialogActive, () => emit('close'));

const presetColors = [
  {fg: '#3b82f6'}, {fg: '#8b5cf6'}, {fg: '#ec4899'}, {fg: '#ef4444'},
  {fg: '#f59e0b'}, {fg: '#10b981'}, {fg: '#06b6d4'}, {fg: '#64748b'},
];

const customHex = ref('');
const customHexInvalid = computed(() => {
  return !!customHex.value && !/^#([0-9a-fA-F]{6})$/.test(customHex.value);
});

watch(() => props.modelValue.iconColor, (val) => {
  if (val && !presetColors.some(c => c.fg === val)) {
    customHex.value = val;
  } else {
    customHex.value = '';
  }
}, {immediate: true});

const canSubmit = computed(() => {
  if (props.modelValue.title.trim().length === 0) return false;
  if (customHexInvalid.value) return false;
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
  return resolvePhosphorIcon(props.modelValue.icon, 'Folder');
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
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4" data-modal="1">
      <!--   遮罩：用主题 overlay 变量，不再写死黑雾 -->
      <div
          class="absolute inset-0 transition-opacity"
          :style="{
          background: 'rgba(var(--overlay-rgb), var(--overlay-alpha))',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)'
          }"
          @click="emit('close')"
          aria-hidden="true"
      />

      <!--   弹窗主体 -->
      <div
          ref="dialogRef"
          class="relative w-full max-w-[500px] rounded-3xl shadow-2xl flex flex-col border transition-all h-[85vh] max-h-[720px] overflow-hidden"
          :style="{
          backgroundColor: 'var(--modal-bg)',
          color: 'var(--modal-text)',
          borderColor: 'var(--modal-border)',
          boxShadow: 'var(--overlay-panel-shadow)'
          }"
          @click.stop
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          tabindex="-1"
          @keydown.esc.prevent.stop="emit('close')"
      >
        <!-- Header -->
        <div
            class="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b"
            :style="{ borderColor: 'var(--modal-border)' }"
        >
          <h3 :id="dialogTitleId" class="text-lg font-bold" :style="{ color: 'var(--modal-text)' }">
            {{ isEdit ? '编辑分类' : '新建分类' }}
          </h3>

          <button
              type="button"
              @click="emit('close')"
              class="icon-btn p-2 rounded-full transition-colors"
              :aria-label="isEdit ? '关闭编辑分类弹窗' : '关闭新建分类弹窗'"
              :style="{ color: 'var(--modal-text)' }"
          >
            <PhX size="20" aria-hidden="true"/>
          </button>
        </div>

        <div class="flex-1 flex flex-col overflow-hidden">
          <!--   上半部分：不再用 dark: / bg-black 写死 -->
          <div
              class="flex-shrink-0 px-6 py-5 space-y-6 border-b"
              :style="{
              borderColor: 'var(--modal-border)',
              backgroundColor: 'rgba(127,127,127,0.06)'
            }"
          >
            <!-- 标题 + 预览 -->
            <div class="flex gap-4 items-stretch h-[52px]">
              <div
                  class="aspect-square h-full rounded-xl flex items-center justify-center border transition-all flex-shrink-0"
                  :style="{
                  backgroundColor: 'rgba(127,127,127,0.10)',
                  borderColor: 'var(--modal-border)',
                  color: modelValue.iconColor || 'var(--modal-text)'
                }"
                  aria-hidden="true"
              >
                <component :is="PreviewIcon" size="28" weight="duotone"/>
              </div>

              <div class="flex-1 relative">
                <label :for="groupNameInputId" class="sr-only">分类名称</label>
                <input
                    :id="groupNameInputId"
                    ref="inputRef"
                    :value="modelValue.title"
                    @input="setTitle(($event.target as HTMLInputElement).value)"
                    type="text"
                    placeholder="分类名称..."
                    class="field w-full h-full rounded-xl px-4 text-sm font-bold outline-none transition-all border"
                    :style="{
                    backgroundColor: 'var(--modal-input-bg)',
                    color: 'var(--modal-text)',
                    borderColor: 'var(--modal-border)'
                  }"
                    :aria-invalid="!!errorMsg"
                    :aria-describedby="errorMsg ? groupNameErrorId : undefined"
                />
                <div
                    v-if="errorMsg"
                    :id="groupNameErrorId"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-red-500"
                    :title="errorMsg"
                    role="alert"
                >
                  <PhWarningCircle size="18" weight="fill" aria-hidden="true"/>
                  <span class="sr-only">{{ errorMsg }}</span>
                </div>
              </div>
            </div>

            <!-- 主题色 -->
            <div class="space-y-3" role="group" :aria-labelledby="themeColorLabelId">
              <div class="flex justify-between items-end">
                <span :id="themeColorLabelId" class="text-xs font-bold uppercase tracking-wider" style="opacity: .55;">
                  主题色
                </span>

                <!--   自定义 HEX：不再 dark:bg-black / bg-white -->
                <div class="hex-pill flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all shadow-sm">
                  <span class="text-[10px] font-bold select-none" style="opacity:.55;">自定义</span>
                  <div class="sep"></div>

                  <label :for="customHexInputId" class="sr-only">自定义主题色 HEX</label>
                  <input
                      :id="customHexInputId"
                      type="text"
                      v-model="customHex"
                      @input="onCustomHexInput"
                      placeholder="#HEX"
                      class="w-16 bg-transparent text-xs font-mono font-bold outline-none uppercase text-center"
                      :style="{ color: 'var(--modal-text)' }"
                      maxlength="7"
                      aria-label="自定义主题色 HEX"
                      :aria-invalid="customHexInvalid"
                  />

                  <!--   预览小圆点：加边框，白色也清晰 -->
                  <div
                      class="w-3 h-3 rounded-full"
                      :style="{
                      backgroundColor: customHex || 'transparent',
                      border: '1px solid var(--modal-border)'
                    }"
                  ></div>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <!-- 默认 -->
                <button
                    type="button"
                    @click="selectColor(null)"
                    class="swatch w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    :style="{
                    borderColor: !modelValue.iconColor ? 'rgba(var(--accent-color-rgb),0.55)' : 'var(--modal-border)',
                    backgroundColor: !modelValue.iconColor ? 'rgba(var(--accent-color-rgb),0.10)' : 'rgba(127,127,127,0.10)',
                    color: 'var(--modal-text)'
                  }"
                    title="默认"
                    aria-label="使用默认主题色"
                    :aria-pressed="!modelValue.iconColor"
                >
                  <PhX v-if="!modelValue.iconColor" size="14" aria-hidden="true"/>
                </button>

                <!-- 预设色 -->
                <button
                    type="button"
                    v-for="c in presetColors"
                    :key="c.fg"
                    @click="selectColor(c)"
                    class="swatch w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative focus-visible:outline-none"
                    :style="{
                    backgroundColor: c.fg,
                    border: modelValue.iconColor === c.fg ? '2px solid rgba(0,0,0,0.10)' : '2px solid transparent'
                  }"
                    :aria-label="modelValue.iconColor === c.fg ? `当前主题色：${c.fg}` : `选择主题色：${c.fg}`"
                    :aria-pressed="modelValue.iconColor === c.fg"
                    :title="c.fg"
                >
                  <PhCheck
                      v-if="modelValue.iconColor === c.fg"
                      size="16"
                      class="text-white drop-shadow-md"
                      weight="bold"
                      aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>

          <!-- Icon Picker -->
          <div class="flex-1 overflow-hidden px-6 pt-4 pb-2">
            <IconPicker :modelValue="modelValue.icon" @update:modelValue="setIcon" :icons="icons"/>
          </div>
        </div>

        <!--   Footer：不再 dark:bg / bg-white/90，彻底解决底部黑条 -->
        <div
            class="flex-shrink-0 p-5 border-t z-10"
            :style="{
            borderColor: 'var(--modal-border)',
            backgroundColor: 'var(--modal-bg)'
          }"
        >
          <button
              type="button"
              @click="emit('submit')"
              :disabled="!canSubmit"
              class="modal-submit w-full py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed"
              :class="canSubmit ? 'btn-primary' : 'btn-disabled'"
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

/* hover 背景：中性灰，不依赖 dark class */
.icon-btn:hover {
  background: rgba(127, 127, 127, 0.12);
}

/* 输入框 focus：统一用 accent */
.field:focus {
  border-color: rgba(var(--accent-color-rgb), 0.55) !important;
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

/* HEX pill：统一变量，避免黑块 */
.hex-pill {
  background: var(--modal-input-bg);
  border-color: var(--modal-border);
}

.hex-pill:focus-within {
  border-color: rgba(var(--accent-color-rgb), 0.55);
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.14);
}

.sep {
  width: 1px;
  height: 12px;
  background: var(--modal-border);
  opacity: .8;
}

/* 主题色圆点聚焦可视 */
.swatch:focus-visible {
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

/* 底部按钮 */
.modal-submit {
  color: #fff;
}

.btn-primary {
  background: var(--accent-color);
  box-shadow: 0 12px 24px rgba(var(--accent-color-rgb), 0.25);
}

.btn-primary:hover {
  filter: brightness(1.06);
}

.btn-disabled {
  background: rgba(127, 127, 127, 0.14);
  color: rgba(127, 127, 127, 0.75);
  box-shadow: none;
  opacity: 0.9;
}
</style>
