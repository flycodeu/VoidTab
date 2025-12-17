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

const icons = ['Folder', 'Briefcase', 'House', 'Star', 'Heart', 'Coffee', 'Code', 'Terminal', 'GameController', 'MusicNotes', 'Image', 'VideoCamera', 'ShoppingCart', 'Airplane', 'Bug', 'Cpu', 'Lightning', 'Book', 'Chat', 'Users'];

watch(() => props.show, (val) => {
  if (val) {
    if (props.isEdit && props.initialData) {
      formData.value = { title: props.initialData.title, icon: props.initialData.icon };
    } else {
      formData.value = { title: '', icon: 'Folder' };
    }
  }
});

const handleSubmit = () => {
  if (!formData.value.title) return alert("请输入分类名称");
  // 核心修复：提交完整的对象 { title, icon }
  emit('submit', { ...formData.value });
  emit('close');
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

      <div class="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-6"
           style="background-color: var(--modal-bg); border: 1px solid var(--modal-border); backdrop-filter: blur(20px);">

        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ isEdit ? '编辑分类' : '新建分类' }}</h3>
          <button @click="$emit('close')" class="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-800 dark:text-white"><PhX size="20"/></button>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-50 uppercase ml-1 text-slate-800 dark:text-white">名称</label>
            <input v-model="formData.title" type="text" placeholder="分类名称"
                   class="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent-color)] text-slate-900 dark:text-white transition-all">
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold opacity-50 uppercase ml-1 text-slate-800 dark:text-white">图标</label>
            <div class="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 custom-scroll">
              <button v-for="icon in icons" :key="icon"
                      @click="formData.icon = icon"
                      class="aspect-square rounded-xl flex items-center justify-center transition-all text-slate-700 dark:text-slate-300"
                      :class="formData.icon === icon ? 'bg-[var(--accent-color)] text-white shadow-lg scale-105' : 'hover:bg-black/5 dark:hover:bg-white/10'">
                <component :is="(PhIcons as any)['Ph' + icon]" size="24" weight="duotone" />
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
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(100,100,100,0.2); border-radius: 4px; }
</style>