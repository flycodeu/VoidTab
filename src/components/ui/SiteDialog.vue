<script setup lang="ts">
import { ref, watch } from 'vue';
import { PhX, PhCheck, PhTextT, PhImage } from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  initialData?: any;
}>();

const emit = defineEmits(['close', 'submit']);
const activeTab = ref<'icon' | 'text'>('text'); // 默认用文字图标

const formData = ref({
  title: '',
  url: '',
  bgColor: '#ef4444',
  iconType: 'text',
  iconValue: 'A'
});

const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];

watch(() => props.show, (val) => {
  if (val && props.isEdit && props.initialData) {
    formData.value = { ...props.initialData };
    activeTab.value = props.initialData.iconType;
  } else if (val) {
    // 新增时默认
    formData.value = { title: '', url: '', bgColor: colors[Math.floor(Math.random()*colors.length)], iconType: 'text', iconValue: '' };
    activeTab.value = 'text';
  }
});

// 监听标题输入，自动填充文字图标
const handleTitleInput = () => {
  if (activeTab.value === 'text' && !props.isEdit && formData.value.title) {
    formData.value.iconValue = formData.value.title.substring(0, 1);
  }
};

const handleSubmit = () => {
  formData.value.iconType = activeTab.value;
  emit('submit', { ...formData.value });
  emit('close');
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="$emit('close')"></div>

      <div class="relative w-[500px] bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col gap-6 text-slate-800 dark:text-white">
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">{{ isEdit ? '编辑图标' : '添加图标' }}</h3>
          <button @click="$emit('close')"><PhX size="20" class="opacity-50 hover:opacity-100"/></button>
        </div>

        <div class="space-y-4">
          <div class="bg-slate-100 dark:bg-slate-900/50 rounded-xl px-4 py-3 flex items-center">
            <span class="w-12 text-sm opacity-50">网址</span>
            <input v-model="formData.url" type="text" placeholder="https://" class="flex-1 bg-transparent outline-none text-sm">
          </div>
          <div class="bg-slate-100 dark:bg-slate-900/50 rounded-xl px-4 py-3 flex items-center">
            <span class="w-12 text-sm opacity-50">名称</span>
            <input v-model="formData.title" @input="handleTitleInput" type="text" placeholder="网站名称" class="flex-1 bg-transparent outline-none text-sm">
          </div>

          <div>
            <div class="text-xs opacity-50 mb-2">图标颜色</div>
            <div class="flex gap-3 flex-wrap">
              <button
                  v-for="c in colors" :key="c" @click="formData.bgColor = c"
                  class="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  :style="{ backgroundColor: c }"
              >
                <PhCheck v-if="formData.bgColor === c" color="white" weight="bold"/>
              </button>
            </div>
          </div>

          <div class="bg-slate-50 dark:bg-slate-900/30 rounded-2xl p-4 flex gap-6 items-center">
            <div class="w-20 h-20 rounded-[20px] shadow-lg flex items-center justify-center text-white text-3xl font-bold transition-colors"
                 :style="{ backgroundColor: formData.bgColor }">
              <span v-if="activeTab === 'text'">{{ formData.iconValue.substring(0,1) }}</span>
              <PhImage v-else size="32" weight="fill"/>
            </div>

            <div class="flex-1">
              <div class="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 mb-3">
                <button @click="activeTab = 'text'" class="flex-1 py-1 text-xs rounded-md transition-colors" :class="activeTab === 'text' ? 'bg-white dark:bg-slate-600 shadow' : 'opacity-50'">文字图标</button>
                <button @click="activeTab = 'icon'" class="flex-1 py-1 text-xs rounded-md transition-colors" :class="activeTab === 'icon' ? 'bg-white dark:bg-slate-600 shadow' : 'opacity-50'">SVG图标</button>
              </div>

              <input v-if="activeTab === 'text'" v-model="formData.iconValue" type="text" maxlength="1" placeholder="输入一个字" class="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 outline-none py-1 text-center font-bold">
              <input v-else v-model="formData.iconValue" type="text" placeholder="图标名称 (如 GithubLogo)" class="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 outline-none py-1 text-xs">
            </div>
          </div>
        </div>

        <button @click="handleSubmit" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/30 transition-all">保存</button>
      </div>
    </div>
  </Transition>
</template>