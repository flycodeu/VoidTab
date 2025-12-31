<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhX, PhWarningCircle, PhCheck} from '@phosphor-icons/vue';
import IconPicker from './IconPicker.vue';
import * as PhIcons from '@phosphor-icons/vue';

// 扩展表单类型
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

// 预设颜色列表 (Tailwind 风格)
const presetColors = [
  {fg: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)'}, // Blue
  {fg: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)'}, // Purple
  {fg: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)'}, // Pink
  {fg: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)'},  // Red
  {fg: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)'}, // Amber
  {fg: '#10b981', bg: 'rgba(16, 185, 129, 0.15)'}, // Emerald
  {fg: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)'},  // Cyan
  {fg: '#64748b', bg: 'rgba(100, 116, 139, 0.15)'}, // Slate
];

const customHex = ref('');

// 初始化自定义颜色输入框
watch(() => props.modelValue.iconColor, (val) => {
  if (val && !presetColors.some(c => c.fg === val)) {
    customHex.value = val;
  }
}, {immediate: true});

const canSubmit = computed(() => {
  if (props.modelValue.title.trim().length === 0) return false;
  // 校验自定义 Hex
  if (customHex.value && !/^#([0-9a-fA-F]{6})$/.test(customHex.value)) return false;
  return true;
});

const updateField = (field: keyof GroupForm, value: any) => {
  emit('update:modelValue', {...props.modelValue, [field]: value});
};

// 选择预设颜色
const selectColor = (color: { fg: string; bg: string } | null) => {
  customHex.value = '';
  updateField('iconColor', color?.fg);
  updateField('iconBgColor', color?.bg);
};

// 处理自定义颜色输入
const onCustomHexInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  customHex.value = val;
  if (/^#([0-9a-fA-F]{6})$/.test(val)) {
    updateField('iconColor', val);
    // 自动生成淡背景 (简单处理：不做复杂计算，直接用透明度低的 hex 也没问题，或者就不设 bg)
    // 这里我们简单置空 bg，或者你可以引入 tinycolor2 来生成
    updateField('iconBgColor', undefined);
  }
};

// 预览图标组件
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
          class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-5 border transition-all max-h-[90vh] overflow-y-auto no-scrollbar"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
          @click.stop
      >
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑分类' : '新建分类' }}</h3>
          <button
              @click="emit('close')"
              class="p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              :style="{ color: 'var(--modal-text)' }"
              aria-label="Close"
          >
            <PhX size="20"/>
          </button>
        </div>

        <div class="flex justify-center py-2">
          <div class="flex flex-col items-center gap-2">
            <div
                class="w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm border border-transparent"
                :style="{
                backgroundColor: modelValue.iconBgColor || 'rgba(128,128,128,0.1)',
                color: modelValue.iconColor || 'var(--text-primary)',
                borderColor: modelValue.iconColor ? 'transparent' : 'var(--modal-border)'
              }"
            >
              <component :is="PreviewIcon" size="28" weight="duotone"/>
            </div>
            <span class="text-xs font-bold opacity-60">预览效果</span>
          </div>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">名称</label>
            <input
                ref="inputRef"
                :value="modelValue.title"
                @input="updateField('title', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="例如：工作..."
                class="w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                :class="errorMsg
                  ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/40'
                  : 'border-current/10 focus:ring-2 focus:ring-[var(--accent-color)]/40'"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            />
            <div v-if="errorMsg" class="flex items-center gap-2 text-xs font-bold text-red-500 pt-1">
              <PhWarningCircle size="16" weight="fill"/>
              {{ errorMsg }}
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">主题色</label>
            <div class="grid grid-cols-5 gap-2">
              <button
                  @click="selectColor(null)"
                  class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
                  :class="!modelValue.iconColor ? 'border-[var(--text-primary)]' : 'border-transparent bg-gray-100 dark:bg-white/10'"
                  title="默认"
              >
                <PhX v-if="!modelValue.iconColor" size="14"/>
              </button>

              <button
                  v-for="c in presetColors"
                  :key="c.fg"
                  @click="selectColor(c)"
                  class="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 relative"
                  :style="{ backgroundColor: c.fg }"
              >
                <PhCheck v-if="modelValue.iconColor === c.fg" size="16" class="text-white drop-shadow-md"
                         weight="bold"/>
              </button>
            </div>

            <div class="flex items-center gap-2 mt-2">
              <div class="w-8 h-8 rounded-full border border-white/10 flex-shrink-0"
                   :style="{ backgroundColor: customHex || 'transparent' }"></div>
              <input
                  type="text"
                  v-model="customHex"
                  @input="onCustomHexInput"
                  placeholder="#RRGGBB"
                  class="flex-1 rounded-xl px-3 py-1.5 text-xs font-mono outline-none border border-current/10 bg-transparent focus:border-[var(--accent-color)]"
                  maxlength="7"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">图标</label>
            <IconPicker :modelValue="modelValue.icon" @update:modelValue="updateField('icon', $event)" :icons="icons"/>
          </div>
        </div>

        <button
            @click="emit('submit')"
            :disabled="!canSubmit"
            class="w-full py-3 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95 mt-2"
            :class="[
              canSubmit
                ? 'bg-[var(--accent-color)] text-white hover:brightness-110 shadow-[var(--accent-color)]/30'
                : 'bg-black/5 dark:bg-white/10 text-[var(--text-tertiary)] cursor-not-allowed opacity-70'
            ]"
        >
          {{ isEdit ? '保存更改' : '立即创建' }}
        </button>
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