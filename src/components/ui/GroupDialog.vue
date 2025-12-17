<script setup lang="ts">
import { ref, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  initialData?: any;
}>();

const emit = defineEmits(['close', 'submit']);
const formData = ref({ title: '', icon: 'Folder' });

// 常用分类图标列表
const icons = ['Folder', 'Briefcase', 'House', 'Star', 'Heart', 'Coffee', 'Code', 'Terminal', 'GameController', 'MusicNotes', 'Image', 'VideoCamera', 'ShoppingCart', 'Airplane'];

watch(() => props.show, (val) => {
  if (val && props.isEdit && props.initialData) {
    formData.value = { title: props.initialData.title, icon: props.initialData.icon };
  } else if (val) {
    formData.value = { title: '', icon: 'Folder' };
  }
});

const handleSubmit = () => {
  emit('submit', { ...formData.value });
  emit('close');
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="$emit('close')"></div>

      <div class="relative w-[400px] bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 text-slate-800 dark:text-white">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑分组' : '新建分组' }}</h3>
          <button @click="$emit('close')"><PhX size="20" class="opacity-50 hover:opacity-100"/></button>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-7 gap-2">
            <button
                v-for="icon in icons" :key="icon"
                @click="formData.icon = icon"
                class="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                :class="formData.icon === icon ? 'bg-blue-500 text-white shadow-md' : 'opacity-60'"
            >
              <component :is="(PhIcons as any)['Ph' + icon]" size="20" />
            </button>
          </div>

          <div class="bg-slate-100 dark:bg-slate-900/50 rounded-xl px-4 py-3">
            <input v-model="formData.title" type="text" placeholder="分组名称" class="w-full bg-transparent outline-none text-sm font-bold">
          </div>
        </div>

        <button @click="handleSubmit" class="w-full mt-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all">保存</button>
      </div>
    </div>
  </Transition>
</template>