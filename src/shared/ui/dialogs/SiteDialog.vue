<script setup lang="ts">
import {ref, computed, watch, onUnmounted} from 'vue';
// 引入 UI 组件
import SiteDialogForm from './SiteDialogForm.vue';
// 引入 Hook
import {useDebouncedFavicon} from '../../composables/icon/useDebouncedFavicon';
// 引入工具函数
import {getSmartInitials} from '../../utils/initials';
import {getSiteNameFromUrl} from '../../utils/url.ts';

// 类型定义
type IconMode = 'auto' | 'text' | 'icon';

type SiteForm = {
  title: string;
  url: string;
  bgColor: string;
  iconType: IconMode;
  iconValue: string;
};

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  initialData?: Partial<SiteForm> & { id?: string };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', payload: SiteForm): void;
}>();

const colors = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#f43f5e', '#1f2937', '#4b5563', '#000000', '#ffffff'
] as const;

const formData = ref<SiteForm>({
  title: '',
  url: '',
  bgColor: '#3b82f6',
  iconType: 'auto',
  iconValue: ''
});

const activeTab = ref<IconMode>('auto');

// === 1. Favicon 自动获取逻辑 (Hook 内部自带防抖) ===
const urlRef = computed(() => formData.value.url);
const {faviconUrl, isFetching, refresh} = useDebouncedFavicon(urlRef, 600);

// === 2. 监听 URL 变化，自动填充标题 (防抖逻辑) ===
let autoTitleTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => formData.value.url,
    (newUrl) => {
      // 清除旧定时器
      if (autoTitleTimer) clearTimeout(autoTitleTimer);

      if (!newUrl) return;

      // 设置新定时器：用户停止输入 500ms 后触发
      autoTitleTimer = setTimeout(() => {
        // 只有当标题还是空的，才去自动填充
        // 这样不会打扰已经自己写了标题的用户
        if (!formData.value.title) {
          const smartName = getSiteNameFromUrl(newUrl);
          if (smartName) {
            formData.value.title = smartName;

            // 联动文字图标
            if (activeTab.value === 'text') {
              formData.value.iconValue = getSmartInitials(smartName);
            }
          }
        }
      }, 500);
    }
);

onUnmounted(() => {
  if (autoTitleTimer) clearTimeout(autoTitleTimer);
});

// === 3. 初始化逻辑 ===
watch(
    () => props.show,
    (isShow) => {
      if (!isShow) return;

      if (props.isEdit && props.initialData) {
        formData.value = {
          title: props.initialData.title || '',
          url: props.initialData.url || '',
          bgColor: props.initialData.bgColor || '#3b82f6',
          iconType: (props.initialData.iconType as IconMode) || 'auto',
          iconValue: props.initialData.iconValue || ''
        };
        activeTab.value = formData.value.iconType;
        refresh(true);
      } else {
        const randomColor = colors[Math.floor(Math.random() * (colors.length - 2))];
        formData.value = {
          title: '',
          url: '',
          bgColor: randomColor,
          iconType: 'auto',
          iconValue: ''
        };
        activeTab.value = 'auto';
        refresh(true);
      }
    }
);

// 保留这个是为了双重保险 (比如用户直接粘贴然后立马点别的)
const handleUrlBlur = () => {
  if (!formData.value.url || formData.value.title) return;

  const smartName = getSiteNameFromUrl(formData.value.url);
  if (smartName) {
    formData.value.title = smartName;
    if (activeTab.value === 'text') {
      formData.value.iconValue = getSmartInitials(smartName);
    }
  }
};

const handleTitleInput = () => {
  if (activeTab.value === 'text' && !props.isEdit) {
    formData.value.iconValue = getSmartInitials(formData.value.title);
  }
};

const handleSubmit = () => {
  if (!formData.value.title) return;

  let finalIconValue = formData.value.iconValue;

  if (activeTab.value === 'text' && !finalIconValue) {
    finalIconValue = getSmartInitials(formData.value.title);
  } else if (activeTab.value === 'icon' && !finalIconValue) {
    finalIconValue = 'Globe';
  }

  emit('submit', {
    ...formData.value,
    iconType: activeTab.value,
    iconValue: finalIconValue
  });

  emit('close');
};
</script>

<template>
  <SiteDialogForm
      :show="show"
      :isEdit="isEdit"
      :modelValue="formData"
      :activeTab="activeTab"
      :faviconUrl="faviconUrl"
      :isFetchingIcon="isFetching"
      :colors="colors"
      :onUrlBlur="handleUrlBlur"
      :onTitleInput="handleTitleInput"
      @update:modelValue="formData = $event"
      @update:activeTab="activeTab = $event"
      @close="emit('close')"
      @submit="handleSubmit"
  />
</template>