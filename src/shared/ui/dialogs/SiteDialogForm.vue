<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhX, PhGlobe, PhSpinner, PhCaretDown, PhCaretUp, PhTag} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import ColorPicker from './ColorPicker.vue';
import {getSmartInitials} from '../../utils/initials.ts';

type IconMode = 'auto' | 'text' | 'icon';

type SiteForm = {
  title: string;
  url: string;
  bgColor: string;
  iconType: IconMode;
  iconValue: string;

  remark: string;
  tags: string[];
};

const props = defineProps<{
  show: boolean;
  isEdit: boolean;

  modelValue: SiteForm;
  activeTab: IconMode;

  faviconUrl: string;
  isFetchingIcon: boolean;

  colors: readonly string[];

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
  {id: 'auto', label: '自动'},
  {id: 'text', label: '文字'},
  {id: 'icon', label: '图标'}
] as const;

const setField = <K extends keyof SiteForm>(k: K, v: SiteForm[K]) => {
  emit('update:modelValue', {...props.modelValue, [k]: v});
};

const PreviewIcon = computed(() => {
  if (props.activeTab !== 'icon') return null;
  const raw = props.modelValue.iconValue || 'Globe';
  const name = raw.replace(/^Ph/, '');
  return (PhIcons as any)['Ph' + name] || PhIcons.PhGlobe;
});

const previewText = computed(() => {
  return props.modelValue.iconValue || getSmartInitials(props.modelValue.title || 'A');
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

// 如果有备注/标签，编辑时自动展开（避免用户找不到）
watch(
    () => props.show,
    (v) => {
      if (!v) return;
      const hasExtra = !!(props.modelValue.remark?.trim() || (props.modelValue.tags?.length || 0) > 0);
      advancedOpen.value = hasExtra;
    }
);

/** ---------------------------
 * Tags input: 不吞字的做法
 * - 用 tagDraft 存“正在输入的那段”
 * - 只有在确认时才写入 modelValue.tags
 * -------------------------- */
const MAX_TAGS = 20;
const tagDraft = ref('');

const normalizeOneTag = (s: string) =>
    s
        .trim()
        .replace(/\s+/g, ' '); // tag 内部多个空格压成一个（可选）

const addTag = (raw: string) => {
  const t = normalizeOneTag(raw);
  if (!t) return;

  const current = Array.isArray(props.modelValue.tags) ? props.modelValue.tags : [];
  if (current.includes(t)) return;
  if (current.length >= MAX_TAGS) return;

  setField('tags', [...current, t]);
};

const addManyTags = (raw: string) => {
  // 粘贴/批量输入时：按逗号/中文逗号/换行拆，再按空格拆
  const parts = raw
      .split(/[,，\n]/g)
      .flatMap((x) => x.split(/\s+/g))
      .map((x) => x.trim())
      .filter(Boolean);

  for (const p of parts) addTag(p);
};

const removeTag = (tag: string) => {
  const next = (props.modelValue.tags || []).filter((t) => t !== tag);
  setField('tags', next);
};

const removeLastTag = () => {
  const current = props.modelValue.tags || [];
  if (current.length === 0) return;
  setField('tags', current.slice(0, -1));
};

const commitDraftIfNeeded = () => {
  const raw = tagDraft.value;
  if (!raw.trim()) {
    tagDraft.value = '';
    return;
  }
  addManyTags(raw);
  tagDraft.value = '';
};

const onTagKeydown = (e: KeyboardEvent) => {
  const key = e.key;

  // Enter / Tab / 逗号：确认输入
  if (key === 'Enter' || key === 'Tab' || key === ',' || key === '，') {
    e.preventDefault();
    commitDraftIfNeeded();
    return;
  }

  // 空格：也作为确认（可选）
  if (key === ' ') {
    // 如果你希望“空格也能输入到 tag 里”，就删掉这个分支
    e.preventDefault();
    commitDraftIfNeeded();
    return;
  }

  // Backspace：输入为空时删除最后一个 tag
  if (key === 'Backspace' && !tagDraft.value) {
    removeLastTag();
  }
};

const onTagPaste = (e: ClipboardEvent) => {
  const text = e.clipboardData?.getData('text') || '';
  if (!text) return;
  // 如果粘贴内容明显是多个 tag，就直接拆分加入
  if (/[,\n，\s]/.test(text.trim())) {
    e.preventDefault();
    addManyTags(text);
    tagDraft.value = '';
  }
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="emit('close')"/>

      <div
          class="relative w-full max-w-md rounded-3xl shadow-2xl p-6 flex flex-col gap-5 transition-all animate-scale-in"
          style="background-color: var(--modal-bg); color: var(--modal-text); border: 1px solid var(--modal-border);"
      >
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑网站' : '添加网站' }}</h3>
          <button @click="emit('close')" class="p-2 rounded-full hover:bg-white/10 transition-colors" type="button">
            <PhX size="20"/>
          </button>
        </div>

        <div class="space-y-4">
          <!-- URL -->
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">URL 链接</label>
            <input
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
            <label class="text-xs font-bold opacity-60 uppercase ml-1">名称</label>
            <input
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
                class="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden relative transition-colors"
                :style="{ backgroundColor: activeTab === 'auto' ? '#ffffff' : modelValue.bgColor }"
            >
              <template v-if="activeTab === 'auto'">
                <PhSpinner v-if="isFetchingIcon" class="animate-spin text-gray-400" size="24"/>
                <img v-else-if="faviconUrl" :src="faviconUrl" class="w-full h-full object-cover" alt="favicon"/>
                <PhGlobe v-else size="32" class="text-gray-300"/>
              </template>

              <span
                  v-else-if="activeTab === 'text'"
                  class="text-white font-bold flex items-center justify-center text-center break-all leading-none px-1 select-none"
                  :style="{ fontSize: previewFontSize }"
              >
                {{ previewText }}
              </span>

              <component v-else :is="PreviewIcon" size="36" weight="fill" class="text-white"/>
            </div>

            <!-- controls -->
            <div class="flex-1 flex flex-col gap-3">
              <div class="flex rounded-lg p-1 bg-black/5 dark:bg-white/5">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    @click="emit('update:activeTab', tab.id)"
                    class="flex-1 py-1.5 rounded-md text-xs font-bold transition-all"
                    :class="activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white'
                    : 'opacity-50 hover:opacity-100'"
                    type="button"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div class="flex-1 flex items-center">
                <div v-if="activeTab === 'auto'" class="text-xs opacity-50 px-1">自动获取高清官方图标</div>

                <input
                    v-else-if="activeTab === 'text'"
                    :value="modelValue.iconValue"
                    @input="setField('iconValue', ($event.target as HTMLInputElement).value)"
                    maxlength="4"
                    type="text"
                    placeholder="显示的文字 (1-4字)"
                    class="w-full bg-transparent border-b-2 border-current/10 text-center font-bold outline-none py-1 focus:border-[var(--accent-color)]"
                    style="color: var(--modal-text);"
                />

                <input
                    v-else
                    :value="modelValue.iconValue"
                    @input="setField('iconValue', ($event.target as HTMLInputElement).value)"
                    type="text"
                    placeholder="图标名 (如 GithubLogo)"
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
          >
            <div class="flex items-center gap-2">
              <PhTag size="16" class="opacity-70" />
              <span class="text-sm font-bold">高级选项（备注 / 标签）</span>
              <span class="text-xs opacity-50">
                {{ (modelValue.remark?.trim() || modelValue.tags?.length) ? '已填写' : '可选' }}
              </span>
            </div>
            <component :is="advancedOpen ? PhCaretUp : PhCaretDown" size="18" class="opacity-70" />
          </button>

          <!-- Advanced content (collapsed by default) -->
          <div v-show="advancedOpen" class="space-y-4 pt-1">
            <!-- Remark -->
            <div class="space-y-1">
              <label class="text-xs font-bold opacity-60 uppercase ml-1">备注（可选）</label>
              <textarea
                  :value="modelValue.remark"
                  @input="setField('remark', ($event.target as HTMLTextAreaElement).value)"
                  rows="2"
                  placeholder="用途、账号、环境说明等…"
                  class="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all resize-none"
                  style="background-color: var(--modal-input-bg); color: var(--modal-text);"
              />
            </div>

            <!-- Tags -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold opacity-60 uppercase ml-1">标签（可选）</label>
                <span class="text-[11px] opacity-50 px-1">
                  {{ (modelValue.tags?.length || 0) }}/{{ MAX_TAGS }}
                </span>
              </div>

              <!-- tag chips + input -->
              <div
                  class="w-full rounded-xl px-3 py-2 flex flex-wrap gap-2 items-center outline-none"
                  style="background-color: var(--modal-input-bg); border: 1px solid rgba(var(--overlay-rgb), 0.18);"
              >
                <button
                    v-for="t in modelValue.tags"
                    :key="t"
                    type="button"
                    class="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all"
                    style="background: rgba(var(--overlay-rgb), 0.18); border: 1px solid rgba(var(--overlay-rgb), 0.15); color: var(--modal-text);"
                    @click="removeTag(t)"
                    :title="`点击移除：${t}`"
                >
                  <span>{{ t }}</span>
                  <span class="opacity-60">×</span>
                </button>

                <input
                    v-model="tagDraft"
                    @keydown="onTagKeydown"
                    @blur="commitDraftIfNeeded"
                    @paste="onTagPaste"
                    type="text"
                    class="flex-1 min-w-[120px] bg-transparent outline-none text-sm font-bold py-1"
                    style="color: var(--modal-text);"
                    placeholder="输入后回车/逗号/空格添加"
                />
              </div>

              <div class="text-[11px] opacity-50 px-1">
                回车/逗号/空格添加标签；空输入时按退格删除上一个；粘贴可批量导入
              </div>
            </div>
          </div>
        </div>

        <button
            @click="emit('submit')"
            class="w-full py-3.5 rounded-xl bg-[var(--accent-color)] text-white font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all mt-2"
            type="button"
        >
          保存
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
