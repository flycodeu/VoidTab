<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { PhX, PhCheck } from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
  isEdit: boolean;
  initialData?: any;
}>();

const emit = defineEmits(['close', 'submit']);

const activeTab = ref<'icon' | 'text'>('text');
const formData = ref({
  title: '',
  url: '',
  bgColor: '#3b82f6',
  iconType: 'text' as 'icon' | 'text',
  iconValue: 'A'
});

const colors = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#f43f5e', '#1f2937', '#4b5563', '#000000'
];

watch(() => props.show, (val) => {
  if (val) {
    if (props.isEdit && props.initialData) {
      formData.value = {
        title: props.initialData.title || '',
        url: props.initialData.url || '',
        bgColor: props.initialData.bgColor || '#3b82f6',
        iconType: props.initialData.iconType || 'text',
        iconValue: props.initialData.iconValue || 'A'
      };
      activeTab.value = formData.value.iconType;
    } else {
      formData.value = {
        title: '',
        url: '',
        bgColor: colors[Math.floor(Math.random() * colors.length)],
        iconType: 'text',
        iconValue: ''
      };
      activeTab.value = 'text';
    }
  }
});

const handleTitleInput = () => {
  if (activeTab.value === 'text' && !props.isEdit && formData.value.title) {
    formData.value.iconValue = formData.value.title.substring(0, 1).toUpperCase();
  }
};

const handleSubmit = () => {
  if (!formData.value.title) return alert("请输入标题");
  // 修正：确保传出的数据包含 iconType
  emit('submit', {
    ...formData.value,
    iconType: activeTab.value,
    iconValue: activeTab.value === 'icon' && !formData.value.iconValue ? 'Globe' : formData.value.iconValue
  });
  emit('close');
};

const PreviewIcon = computed(() => {
  if (activeTab.value === 'text') return null;
  const name = formData.value.iconValue.replace(/^Ph/, '');
  // @ts-ignore
  return PhIcons['Ph' + name] || PhIcons.PhGlobe;
});
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

      <div class="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-6"
           style="background-color: var(--modal-bg); border: 1px solid var(--modal-border); backdrop-filter: blur(20px);">

        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ isEdit ? '编辑网站' : '添加网站' }}</h3>
          <button @click="$emit('close')" class="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-800 dark:text-white">
            <PhX size="20"/>
          </button>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-50 uppercase ml-1 text-slate-800 dark:text-white">URL</label>
            <input v-model="formData.url" type="text" placeholder="https://..."
                   class="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all text-slate-900 dark:text-white">
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold opacity-50 uppercase ml-1 text-slate-800 dark:text-white">名称</label>
            <input v-model="formData.title" @input="handleTitleInput" type="text" placeholder="网站名称"
                   class="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all text-slate-900 dark:text-white">
          </div>

          <div class="bg-black/5 dark:bg-white/5 p-4 rounded-xl flex gap-4">
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg transition-colors flex-shrink-0"
                 :style="{ backgroundColor: formData.bgColor }">
              <span v-if="activeTab === 'text'">{{ formData.iconValue.substring(0, 1) }}</span>
              <component v-else :is="PreviewIcon" size="32" weight="fill" />
            </div>

            <div class="flex-1 flex flex-col gap-3">
              <div class="flex bg-black/5 dark:bg-white/10 rounded-lg p-1">
                <button @click="activeTab = 'text'" class="flex-1 py-1 rounded text-xs font-bold transition-all text-slate-800 dark:text-white"
                        :class="activeTab === 'text' ? 'bg-white dark:bg-white/20 shadow-sm' : 'opacity-50'">文字</button>
                <button @click="activeTab = 'icon'" class="flex-1 py-1 rounded text-xs font-bold transition-all text-slate-800 dark:text-white"
                        :class="activeTab === 'icon' ? 'bg-white dark:bg-white/20 shadow-sm' : 'opacity-50'">图标</button>
              </div>

              <input v-if="activeTab === 'text'" v-model="formData.iconValue" maxlength="1" type="text" placeholder="字"
                     class="w-full bg-transparent border-b border-current/20 text-center font-bold outline-none py-1 text-slate-900 dark:text-white">
              <input v-else v-model="formData.iconValue" type="text" placeholder="图标名 (如 GithubLogo)"
                     class="w-full bg-transparent border-b border-current/20 text-xs py-1 outline-none text-slate-900 dark:text-white">
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-50 uppercase ml-1 text-slate-800 dark:text-white">颜色</label>
            <div class="flex flex-wrap gap-3">
              <button v-for="c in colors" :key="c" @click="formData.bgColor = c"
                      class="w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center ring-2 ring-offset-2 ring-offset-transparent"
                      :class="formData.bgColor === c ? 'ring-[var(--accent-color)] scale-110' : 'ring-transparent'"
                      :style="{ backgroundColor: c }">
                <PhCheck v-if="formData.bgColor === c" size="12" color="white" weight="bold"/>
              </button>
            </div>
          </div>
        </div>

        <button @click="handleSubmit" class="w-full py-3 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white font-bold text-sm shadow-lg active:scale-95 transition-all">保存</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
</style>