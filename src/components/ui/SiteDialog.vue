<script setup lang="ts">
import {ref, watch, computed} from 'vue';
import {PhX, PhCheck, PhGlobe, PhSpinner} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import {getHighResIconUrl} from '../../utils/icon';

const props = defineProps<{ show: boolean; isEdit: boolean; initialData?: any; }>();
const emit = defineEmits(['close', 'submit']);

const activeTab = ref<'auto' | 'text' | 'icon'>('auto');
const tabs = [
  {id: 'auto', label: '自动'},
  {id: 'text', label: '文字'},
  {id: 'icon', label: '图标'}
];

const formData = ref({
  title: '',
  url: '',
  bgColor: '#3b82f6',
  iconType: 'auto' as 'auto' | 'icon' | 'text',
  iconValue: ''
});

const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#1f2937', '#4b5563', '#000000', '#ffffff'];

const debouncedFaviconUrl = ref('');
const isFetchingIcon = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ✨✨✨ 核心修改：使用 getHighResIconUrl 替代旧逻辑 ✨✨✨
const fetchFavicon = (url: string, immediate = false) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!url) {
    debouncedFaviconUrl.value = '';
    return;
  }

  const run = () => {
    isFetchingIcon.value = true;
    try {
      // 直接调用工具函数，获取 Google S2 高清图
      debouncedFaviconUrl.value = getHighResIconUrl(url);
    } catch {
      debouncedFaviconUrl.value = '';
    } finally {
      // 稍微延迟一点关闭 loading，让用户感知到在加载（可选）
      setTimeout(() => {
        isFetchingIcon.value = false;
      }, 200);
    }
  };

  if (immediate) {
    run();
  } else {
    debounceTimer = setTimeout(run, 500); // 防抖 500ms
  }
};

watch(() => formData.value.url, (newVal) => {
  fetchFavicon(newVal);
});

watch(() => props.show, (val) => {
  if (val) {
    if (props.isEdit && props.initialData) {
      formData.value = {
        title: props.initialData.title || '',
        url: props.initialData.url || '',
        bgColor: props.initialData.bgColor || '#3b82f6',
        iconType: props.initialData.iconType || 'auto',
        iconValue: props.initialData.iconValue || ''
      };
      activeTab.value = formData.value.iconType;
      // 编辑模式下立即加载图标
      fetchFavicon(formData.value.url, true);
    } else {
      formData.value = {
        title: '',
        url: '',
        bgColor: '#3b82f6',
        iconType: 'auto',
        iconValue: ''
      };
      activeTab.value = 'auto';
      debouncedFaviconUrl.value = '';
    }
  }
});

const handleUrlBlur = () => {
  if (!formData.value.title && formData.value.url) {
    try {
      let fullUrl = formData.value.url;
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      const domain = new URL(fullUrl).hostname;
      const name = domain.split('.')[0];
      if (name) {
        formData.value.title = name.charAt(0).toUpperCase() + name.slice(1);
        if (activeTab.value === 'text') {
          formData.value.iconValue = name.charAt(0).toUpperCase();
        }
      }
    } catch {
    }
  }
};

const handleTitleInput = () => {
  if (activeTab.value === 'text' && !props.isEdit && formData.value.title) {
    formData.value.iconValue = formData.value.title.substring(0, 1).toUpperCase();
  }
};

const handleSubmit = () => {
  if (!formData.value.title) return;
  emit('submit', {
    ...formData.value,
    iconType: activeTab.value,
    iconValue: activeTab.value === 'icon' && !formData.value.iconValue ? 'Globe' : formData.value.iconValue
  });
  emit('close');
};

const PreviewIcon = computed(() => {
  if (activeTab.value !== 'icon') return null;
  const name = formData.value.iconValue.replace(/^Ph/, '');
  return (PhIcons as any)['Ph' + name] || PhIcons.PhGlobe;
});
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

      <div
          class="relative w-full max-w-md rounded-3xl shadow-2xl p-6 flex flex-col gap-5 transition-all animate-scale-in"
          style="background-color: var(--modal-bg); color: var(--modal-text); border: 1px solid var(--modal-border);">

        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑网站' : '添加网站' }}</h3>
          <button @click="$emit('close')" class="p-2 rounded-full hover:bg-white/10 transition-colors">
            <PhX size="20"/>
          </button>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">URL 链接</label>
            <input
                v-model="formData.url"
                @blur="handleUrlBlur"
                type="text"
                placeholder="https://example.com"
                class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            >
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">名称</label>
            <input
                v-model="formData.title"
                @input="handleTitleInput"
                type="text"
                placeholder="网站名称"
                class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
                style="background-color: var(--modal-input-bg); color: var(--modal-text);"
            >
          </div>

          <div class="p-4 rounded-2xl flex gap-4 border border-white/5"
               style="background-color: var(--modal-input-bg);">

            <div
                class="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden relative transition-colors"
                :style="{ backgroundColor: activeTab === 'auto' ? '#ffffff' : formData.bgColor }"
            >
              <template v-if="activeTab === 'auto'">
                <PhSpinner v-if="isFetchingIcon" class="animate-spin text-gray-400" size="24"/>

                <img v-else-if="debouncedFaviconUrl"
                     :src="debouncedFaviconUrl"
                     class="w-full h-full object-cover"
                     onerror="this.style.display='none'"
                >
                <PhGlobe v-else size="32" class="text-gray-300"/>
              </template>

              <span v-else-if="activeTab === 'text'" class="text-white text-3xl font-bold">
                {{ formData.iconValue ? formData.iconValue.substring(0, 1) : (formData.title.substring(0, 1) || 'A') }}
              </span>

              <component v-else-if="activeTab === 'icon'" :is="PreviewIcon" size="36" weight="fill" class="text-white"/>
            </div>

            <div class="flex-1 flex flex-col gap-3">
              <div class="flex rounded-lg p-1 bg-black/5 dark:bg-white/5">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    @click="activeTab = tab.id as any"
                    class="flex-1 py-1.5 rounded-md text-xs font-bold transition-all"
                    :class="activeTab === tab.id ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white' : 'opacity-50 hover:opacity-100'"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div class="flex-1 flex items-center">
                <div v-if="activeTab === 'auto'" class="text-xs opacity-50 px-1">
                  自动获取高清官方图标
                </div>

                <input v-else-if="activeTab === 'text'"
                       v-model="formData.iconValue"
                       maxlength="1"
                       type="text"
                       placeholder="显示的文字"
                       class="w-full bg-transparent border-b-2 border-current/10 text-center font-bold outline-none py-1 focus:border-[var(--accent-color)]"
                       style="color: var(--modal-text);"
                >

                <input v-else
                       v-model="formData.iconValue"
                       type="text"
                       placeholder="图标名 (如 GithubLogo)"
                       class="w-full bg-transparent border-b-2 border-current/10 text-xs py-1 outline-none focus:border-[var(--accent-color)]"
                       style="color: var(--modal-text);"
                >
              </div>
            </div>
          </div>

          <div v-if="activeTab !== 'auto'" class="flex flex-wrap gap-2 pt-2 justify-center sm:justify-start">
            <button v-for="c in colors" :key="c" @click="formData.bgColor = c"
                    class="w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-offset-2 ring-offset-transparent transition-transform hover:scale-110 border border-black/5"
                    :class="formData.bgColor === c ? 'ring-[var(--accent-color)] scale-110' : 'ring-transparent'"
                    :style="{ backgroundColor: c }">
              <PhCheck v-if="formData.bgColor === c" size="12" :color="c === '#ffffff' ? '#000' : '#fff'"
                       weight="bold"/>
            </button>
          </div>
        </div>

        <button @click="handleSubmit"
                class="w-full py-3.5 rounded-xl bg-[var(--accent-color)] text-white font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all mt-2">
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