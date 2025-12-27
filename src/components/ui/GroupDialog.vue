<script setup lang="ts">
import {ref, watch, computed, nextTick, onMounted, onUnmounted} from 'vue';
import {PhX, PhWarningCircle} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

type GroupForm = {
  title: string;
  icon: string;
};

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  initialData?: Partial<GroupForm> & { id?: string };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', payload: GroupForm): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const formData = ref<GroupForm>({
  title: '',
  icon: 'Folder'
});

const errorMsg = ref<string>('');

// 你原来的 icon 列表保留（可按需扩展）
const icons = [
  'Folder', 'Briefcase', 'House', 'Star', 'Heart',
  'Coffee', 'Code', 'Terminal', 'GameController',
  'MusicNotes', 'Image', 'VideoCamera', 'ShoppingCart',
  'Airplane', 'Bug', 'Cpu', 'Lightning'
];

// 打开弹窗时初始化数据 + 聚焦
watch(
    () => props.show,
    async (val) => {
      if (!val) return;

      errorMsg.value = '';

      if (props.isEdit && props.initialData) {
        formData.value = {
          title: String(props.initialData.title ?? ''),
          icon: String(props.initialData.icon ?? 'Folder')
        };
      } else {
        formData.value = {title: '', icon: 'Folder'};
      }

      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select?.();
    }
);

const canSubmit = computed(() => formData.value.title.trim().length > 0);

const close = () => emit('close');

const handleSubmit = () => {
  const title = formData.value.title.trim();
  if (!title) {
    errorMsg.value = '请输入分类名称';
    inputRef.value?.focus();
    return;
  }
  errorMsg.value = '';
  emit('submit', {title, icon: formData.value.icon || 'Folder'});
  emit('close');
};

const onKeydown = (e: KeyboardEvent) => {
  if (!props.show) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }

  // Enter 提交（避免在 textarea 等误触；这里就一个 input）
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

const IconComp = (name: string) => {
  const key = 'Ph' + String(name).replace(/^Ph/, '');
  return (PhIcons as any)[key] || (PhIcons as any).PhFolder;
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          @click="close"
      ></div>

      <div
          class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-6 border"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
          @click.stop
      >
        <!-- header -->
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">
            {{ isEdit ? '编辑分类' : '新建分类' }}
          </h3>

          <button
              @click="close"
              class="p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              :style="{ color: 'var(--modal-text)' }"
              aria-label="Close"
          >
            <PhX size="20"/>
          </button>
        </div>

        <!-- body -->
        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">分类名称</label>

            <input
                ref="inputRef"
                v-model="formData.title"
                type="text"
                placeholder="例如：工作..."
                class="w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                :class="errorMsg ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/40' : 'border-current/10 focus:ring-2 focus:ring-[var(--accent-color)]/40'"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            />

            <div v-if="errorMsg" class="flex items-center gap-2 text-xs font-bold text-red-500 pt-1">
              <PhWarningCircle size="16" weight="fill"/>
              {{ errorMsg }}
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">图标</label>

            <div
                class="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 custom-scroll rounded-2xl border border-current/10"
                style="background-color: rgba(255,255,255,0.02);"
            >
              <button
                  v-for="icon in icons"
                  :key="icon"
                  type="button"
                  @click="formData.icon = icon"
                  class="aspect-square rounded-2xl flex items-center justify-center transition-all active:scale-95"
                  :class="formData.icon === icon
                  ? 'bg-[var(--accent-color)] text-white shadow-lg'
                  : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'"
              >
                <component :is="IconComp(icon)" size="24" weight="duotone"/>
              </button>
            </div>
          </div>
        </div>

        <!-- footer -->
        <button
            @click="handleSubmit"
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
.scale-enter-active, .scale-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* 轻量滚动条（和你项目风格一致） */
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.25);
  border-radius: 999px;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.4);
}
</style>
