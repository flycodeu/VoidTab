<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import SiteDialogForm from './SiteDialogForm.vue';
import {useDebouncedFavicon} from '../../../composables/useDebouncedFavicon';
import {getSmartInitials} from '../../../utils/initials';

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

// favicon debounce（只依赖 url）
const urlRef = computed(() => formData.value.url);
const {faviconUrl, isFetching, refresh} = useDebouncedFavicon(urlRef, 500);

watch(
    () => props.show,
    (val) => {
      if (!val) return;

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
        formData.value = {title: '', url: '', bgColor: '#3b82f6', iconType: 'auto', iconValue: ''};
        activeTab.value = 'auto';
        refresh(true);
      }
    }
);

const normalizeUrl = (raw: string) => {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

const handleUrlBlur = () => {
  // 自动补全标题
  if (!formData.value.title && formData.value.url) {
    try {
      const fullUrl = normalizeUrl(formData.value.url);
      const domain = new URL(fullUrl).hostname;
      const name = domain.split('.')[0];
      if (name) {
        formData.value.title = name.charAt(0).toUpperCase() + name.slice(1);
        if (activeTab.value === 'text') formData.value.iconValue = getSmartInitials(name);
      }
    } catch {
      // ignore
    }
  }
};

const handleTitleInput = () => {
  if (activeTab.value === 'text' && !props.isEdit && formData.value.title) {
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
