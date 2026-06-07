<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PhX, PhGlobe, PhSpinner, PhCaretDown, PhCaretUp, PhNotePencil } from '@phosphor-icons/vue';
import ColorPicker from './ColorPicker.vue';
import { getSmartInitials } from '../../utils/initials.ts';
import {useFocusTrap} from '../../composables/useFocusTrap';
import {resolvePhosphorIcon} from '../../icons/phosphorIconMap';

type IconMode = 'auto' | 'text' | 'icon';

type SiteForm = {
  title: string;
  url: string;
  bgColor: string;
  iconType: IconMode;
  iconValue: string;
  icon?: string;

  remark: string;
};

const props = defineProps<{
  show: boolean;
  isEdit: boolean;

  modelValue: SiteForm;
  activeTab: IconMode;

  // auto icon preview state
  faviconUrl: string;
  isFetchingIcon: boolean;

  colors: readonly string[];

  // events (logic in container)
  onUrlBlur: () => void;
  onTitleInput: () => void;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: SiteForm): void;
  (e: 'update:activeTab', v: IconMode): void;
  (e: 'close'): void;
  (e: 'submit'): void;
}>();

const tabs = [
  { id: 'auto', label: '自动' },
  { id: 'text', label: '文字' },
  { id: 'icon', label: '图标' }
] as const;

const idSuffix = Math.random().toString(36).slice(2);
const dialogTitleId = `site-dialog-title-${idSuffix}`;
const urlInputId = `site-dialog-url-${idSuffix}`;
const titleInputId = `site-dialog-site-title-${idSuffix}`;
const iconModeLabelId = `site-dialog-icon-mode-label-${idSuffix}`;
const iconTextInputId = `site-dialog-icon-text-${idSuffix}`;
const iconNameInputId = `site-dialog-icon-name-${idSuffix}`;
const advancedPanelId = `site-dialog-advanced-${idSuffix}`;
const remarkInputId = `site-dialog-remark-${idSuffix}`;

const dialogRef = ref<HTMLElement | null>(null);
const isDialogActive = computed(() => props.show);
useFocusTrap(dialogRef, isDialogActive);

const setField = <K extends keyof SiteForm>(k: K, v: SiteForm[K]) => {
  emit('update:modelValue', { ...props.modelValue, [k]: v });
};

const PreviewIcon = computed(() => {
  if (props.activeTab !== 'icon') return null;
  const raw = props.modelValue.iconValue || 'Globe';
  return resolvePhosphorIcon(raw, 'Globe');
});

const previewText = computed(() => {
  return props.modelValue.iconValue || getSmartInitials(props.modelValue.title || 'A');
});

const iconPreviewLabel = computed(() => {
  if (props.activeTab === 'auto') {
    if (props.isFetchingIcon) return '正在获取网站图标预览';
    return props.faviconUrl ? '自动获取的网站图标预览' : '默认网站图标预览';
  }
  if (props.activeTab === 'text') return `文字图标预览：${previewText.value}`;
  return `图标预览：${props.modelValue.iconValue || 'Globe'}`;
});

const previewFontSize = computed(() => {
  const len = previewText.value.length;
  if (len >= 4) return '16px';
  if (len === 3) return '20px';
  if (len === 2) return '26px';
  return '36px';
});

/** ---------------------------
 * Advanced section (折叠)
 * -------------------------- */
const advancedOpen = ref(false);

// 如果有备注，编辑时自动展开（避免用户找不到）
watch(
    () => props.show,
    (v) => {
      if (!v) return;
      const hasExtra = !!props.modelValue.remark?.trim();
      advancedOpen.value = hasExtra;
    }
);
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4" data-modal="1">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="emit('close')" aria-hidden="true" />

      <div
          ref="dialogRef"
          class="relative w-full max-w-md rounded-3xl shadow-2xl p-6 flex flex-col gap-5 transition-all animate-scale-in"
          style="background-color: var(--modal-bg); color: var(--modal-text); border: 1px solid var(--modal-border);"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          tabindex="-1"
          @keydown.esc.prevent.stop="emit('close')"
      >
        <div class="flex justify-between items-center">
          <h3 :id="dialogTitleId" class="text-xl font-bold">{{ isEdit ? '编辑网站' : '添加网站' }}</h3>
          <button
              @click="emit('close')"
              class="p-2 rounded-full hover:bg-white/10 transition-colors"
              type="button"
              :aria-label="isEdit ? '关闭编辑网站弹窗' : '关闭添加网站弹窗'"
          >
            <PhX size="20" aria-hidden="true" />
          </button>
        </div>

        <div class="space-y-4">
          <!-- URL -->
          <div class="space-y-1">
            <label :for="urlInputId" class="text-xs font-bold opacity-60 uppercase ml-1">URL 链接</label>
            <input
                :id="urlInputId"
                :value="modelValue.url"
                @input="setField('url', ($event.target as HTMLInputElement).value)"
                @blur="onUrlBlur"
                type="text"
                placeholder="https://example.com"
                class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            />
          </div>

          <!-- Title -->
          <div class="space-y-1">
            <label :for="titleInputId" class="text-xs font-bold opacity-60 uppercase ml-1">名称</label>
            <input
                :id="titleInputId"
                :value="modelValue.title"
                @input="
                setField('title', ($event.target as HTMLInputElement).value);
                onTitleInput();
              "
                type="text"
                placeholder="网站名称"
                class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            />
          </div>

          <!-- Icon preview + mode -->
          <div class="p-4 rounded-2xl flex gap-4 border border-white/5" style="background-color: var(--modal-input-bg);">
            <!-- preview -->
            <div
                class="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden relative transition-colors"
                :class="activeTab === 'auto' && faviconUrl ? 'shadow-none' : 'shadow-lg'"
                :style="{ backgroundColor: activeTab === 'auto' && faviconUrl ? 'transparent' : (activeTab === 'auto' ? '#ffffff' : modelValue.bgColor) }"
                role="img"
                :aria-label="iconPreviewLabel"
            >
              <template v-if="activeTab === 'auto'">
                <PhSpinner v-if="isFetchingIcon" class="animate-spin text-gray-400" size="24" aria-hidden="true" />
                <img v-else-if="faviconUrl" :src="faviconUrl" class="w-full h-full object-cover" alt="" />
                <PhGlobe v-else size="32" class="text-gray-300" aria-hidden="true" />
              </template>

              <span
                  v-else-if="activeTab === 'text'"
                  class="text-white font-bold flex items-center justify-center text-center break-all leading-none px-1 select-none"
                  :style="{ fontSize: previewFontSize }"
              >
                {{ previewText }}
              </span>

              <component v-else :is="PreviewIcon" size="36" weight="fill" class="text-white" aria-hidden="true" />
            </div>

            <!-- controls -->
            <div class="flex-1 flex flex-col gap-3">
              <span :id="iconModeLabelId" class="sr-only">图标模式</span>
              <div class="flex rounded-lg p-1 bg-black/5 dark:bg-white/5" role="group" :aria-labelledby="iconModeLabelId">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    @click="emit('update:activeTab', tab.id)"
                    class="flex-1 py-1.5 rounded-md text-xs font-bold transition-all"
                    :class="
                    activeTab === tab.id
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white'
                      : 'opacity-50 hover:opacity-100'
                  "
                    type="button"
                    :aria-pressed="activeTab === tab.id"
                    :aria-label="`选择${tab.label}图标模式`"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div class="flex-1 flex items-center">
                <div v-if="activeTab === 'auto'" class="text-xs opacity-50 px-1">自动获取高清官方图标</div>

                <input
                    v-else-if="activeTab === 'text'"
                    :id="iconTextInputId"
                    :value="modelValue.iconValue"
                    @input="setField('iconValue', ($event.target as HTMLInputElement).value)"
                    maxlength="4"
                    type="text"
                    placeholder="显示的文字 (1-4字)"
                    aria-label="文字图标内容"
                    class="w-full bg-transparent border-b-2 border-current/10 text-center font-bold outline-none py-1 focus:border-[var(--accent-color)]"
                    style="color: var(--modal-text);"
                />

                <input
                    v-else
                    :id="iconNameInputId"
                    :value="modelValue.iconValue"
                    @input="setField('iconValue', ($event.target as HTMLInputElement).value)"
                    type="text"
                    placeholder="图标名 (如 GithubLogo)"
                    aria-label="图标名称"
                    class="w-full bg-transparent border-b-2 border-current/10 text-xs py-1 outline-none focus:border-[var(--accent-color)]"
                    style="color: var(--modal-text);"
                />
              </div>
            </div>
          </div>

          <ColorPicker
              v-if="activeTab !== 'auto'"
              :modelValue="modelValue.bgColor"
              @update:modelValue="setField('bgColor', $event)"
              :colors="colors"
          />

          <!-- Advanced toggle -->
          <button
              type="button"
              class="w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all"
              style="background-color: var(--modal-input-bg); border-color: rgba(var(--overlay-rgb), 0.18);"
              @click="advancedOpen = !advancedOpen"
              :aria-expanded="advancedOpen"
              :aria-controls="advancedPanelId"
          >
            <div class="flex items-center gap-2">
              <PhNotePencil size="16" class="opacity-70" aria-hidden="true" />
              <span class="text-sm font-bold">高级选项（备注）</span>
              <span class="text-xs opacity-50">
                {{ modelValue.remark?.trim() ? '已填写' : '可选' }}
              </span>
            </div>
            <component :is="advancedOpen ? PhCaretUp : PhCaretDown" size="18" class="opacity-70" aria-hidden="true" />
          </button>

          <!-- Advanced content (collapsed by default) -->
          <div :id="advancedPanelId" v-show="advancedOpen" class="space-y-4 pt-1">
            <!-- Remark -->
            <div class="space-y-1">
              <label :for="remarkInputId" class="text-xs font-bold opacity-60 uppercase ml-1">备注（可选）</label>
              <textarea
                  :id="remarkInputId"
                  :value="modelValue.remark"
                  @input="setField('remark', ($event.target as HTMLTextAreaElement).value)"
                  rows="2"
                  placeholder="用途、账号、环境说明等…"
                  class="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all resize-none"
                  style="background-color: var(--modal-input-bg); color: var(--modal-text);"
              />
            </div>
          </div>
        </div>

        <button
            @click="emit('submit')"
            class="w-full py-3.5 rounded-xl bg-[var(--accent-color)] text-white font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all mt-2"
            type="button"
            :aria-label="isEdit ? '保存网站更改' : '保存新网站'"
        >
          保存
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
