<script setup lang="ts">
import {ref, watch, nextTick, onMounted, onUnmounted} from 'vue';
import GroupDialogForm from './GroupDialogForm.vue';
import {groupIconNames} from '../../../core/registry/groupIcons';

// ✅ 扩展表单类型，包含颜色字段
type GroupForm = {
  title: string;
  icon: string;
  iconColor?: string;
  iconBgColor?: string;
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

const formRef = ref<InstanceType<typeof GroupDialogForm> | null>(null);

// 初始化数据
const formData = ref<GroupForm>({title: '', icon: 'Folder'});
const errorMsg = ref('');

watch(
    () => props.show,
    async (val) => {
      if (!val) return;

      errorMsg.value = '';

      if (props.isEdit && props.initialData) {
        // ✅ 编辑模式：回填颜色数据
        formData.value = {
          title: String(props.initialData.title ?? ''),
          icon: String(props.initialData.icon ?? 'Folder'),
          iconColor: props.initialData.iconColor,
          iconBgColor: props.initialData.iconBgColor
        };
      } else {
        // 新建模式：重置
        formData.value = {title: '', icon: 'Folder'};
      }

      await nextTick();
      formRef.value?.focusTitle();
    }
);

const close = () => emit('close');

const handleSubmit = () => {
  const title = formData.value.title.trim();
  if (!title) {
    errorMsg.value = '请输入分类名称';
    formRef.value?.focusTitle();
    return;
  }
  errorMsg.value = '';

  // ✅ 提交所有字段，包括颜色
  emit('submit', {
    title,
    icon: formData.value.icon || 'Folder',
    iconColor: formData.value.iconColor,
    iconBgColor: formData.value.iconBgColor
  });

  emit('close');
};

const onKeydown = (e: KeyboardEvent) => {
  if (!props.show) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
};

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <GroupDialogForm
      ref="formRef"
      :show="show"
      :isEdit="isEdit"
      :modelValue="formData"
      :errorMsg="errorMsg"
      :icons="groupIconNames"
      @update:modelValue="formData = $event"
      @close="close"
      @submit="handleSubmit"
  />
</template>