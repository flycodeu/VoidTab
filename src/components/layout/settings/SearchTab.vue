<script setup lang="ts">
import { ref } from 'vue';
import { useConfigStore } from '../../../stores/useConfigStore.ts';
import * as PhIcons from '@phosphor-icons/vue';
import { PhTrash } from '@phosphor-icons/vue';

const store = useConfigStore();
const newEngineForm = ref({ name: '', url: '' });

const handleAddEngine = () => {
  if (newEngineForm.value.name && newEngineForm.value.url) {
    store.addEngine(newEngineForm.value.name, newEngineForm.value.url);
    newEngineForm.value = { name: '', url: '' };
  }
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <h3 class="font-bold text-sm">添加引擎</h3>

      <div class="flex gap-2">
        <input v-model="newEngineForm.name" placeholder="名称"
               class="w-1/3 bg-transparent border-b px-2 py-1 text-sm outline-none border-current/10 focus:border-[var(--accent-color)]"/>
        <input v-model="newEngineForm.url" placeholder="URL"
               class="flex-1 bg-transparent border-b px-2 py-1 text-sm outline-none border-current/10 focus:border-[var(--accent-color)]"/>
      </div>

      <button @click="handleAddEngine" class="w-full py-2 bg-[var(--accent-color)] text-white rounded-lg text-xs font-bold mt-2">
        添加
      </button>
    </div>

    <div class="space-y-2">
      <div
          v-for="eng in store.config.searchEngines"
          :key="eng.id"
          class="flex items-center justify-between p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]"
      >
        <div class="flex items-center gap-2">
          <component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18" class="text-[var(--accent-color)]"/>
          <span class="text-sm font-bold ml-2">{{ eng.name }}</span>
        </div>

        <button
            v-if="store.config.searchEngines.length > 1"
            @click.stop="store.removeEngine(eng.id)"
            class="text-red-500 p-2 hover:bg-red-500/10 rounded-lg"
        >
          <PhTrash size="16" weight="bold"/>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
