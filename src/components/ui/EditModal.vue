<script setup lang="ts">
import { ref, watch } from 'vue';
import { LinkItem } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  editData?: LinkItem | null; // 如果有值就是编辑模式，没值就是新增
}>();

const emit = defineEmits(['close', 'save', 'delete']);

const form = ref({
  title: '',
  url: '',
  icon: 'Globe', // 默认图标
});

// 监听 props 变化，回填数据
watch(() => props.editData, (newVal) => {
  if (newVal) {
    form.value = { ...newVal };
  } else {
    form.value = { title: '', url: '', icon: 'Globe' };
  }
});

const handleSave = () => {
  if (!form.value.title || !form.value.url) return alert('请填写完整');
  emit('save', { ...form.value, id: props.editData?.id || Date.now().toString() });
  emit('close');
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-96 bg-slate-900 border border-white/10 rounded-xl p-6 shadow-2xl animate-fade-in">
      <h3 class="text-xl font-bold text-white mb-6">{{ editData ? '编辑图标' : '添加新网站' }}</h3>

      <div class="space-y-4">
        <div>
          <label class="block text-xs text-cyan-400 uppercase mb-1">标题</label>
          <input v-model="form.title" type="text" class="w-full bg-slate-800 border border-white/10 rounded p-2 text-white focus:border-cyan-500 outline-none" placeholder="例如: Google">
        </div>

        <div>
          <label class="block text-xs text-cyan-400 uppercase mb-1">网址 (URL)</label>
          <input v-model="form.url" type="text" class="w-full bg-slate-800 border border-white/10 rounded p-2 text-white focus:border-cyan-500 outline-none" placeholder="https://...">
        </div>

        <div>
          <label class="block text-xs text-cyan-400 uppercase mb-1">图标名称 (Phosphor)</label>
          <input v-model="form.icon" type="text" class="w-full bg-slate-800 border border-white/10 rounded p-2 text-white focus:border-cyan-500 outline-none" placeholder="例如: GithubLogo, YoutubeLogo">
          <p class="text-[10px] text-gray-500 mt-1">支持 Phosphor Icon 名称</p>
        </div>
      </div>

      <div class="flex gap-3 mt-8">
        <button v-if="editData" @click="$emit('delete', editData.id)" class="px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40">删除</button>
        <div class="flex-1"></div>
        <button @click="$emit('close')" class="px-4 py-2 text-gray-400 hover:text-white">取消</button>
        <button @click="handleSave" class="px-6 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-500 font-bold">保存</button>
      </div>
    </div>
  </div>
</template>