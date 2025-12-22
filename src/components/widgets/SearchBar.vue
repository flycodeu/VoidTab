<script setup lang="ts">
import { ref, computed } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import {  PhTrash } from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

const store = useConfigStore();
const searchText = ref('');
const showEngineMenu = ref(false);
const emit = defineEmits(['openSettings']);

const currentEngineIcon = computed(() => {
  const engine = store.config.searchEngines.find((e:any) => e.id === store.config.currentEngineId);
  return engine ? (PhIcons as any)['Ph' + engine.icon] || PhIcons.PhMagnifyingGlass : PhIcons.PhMagnifyingGlass;
});

const handleSearch = () => {
  if (!searchText.value) return;
  const currentEngine = store.config.searchEngines.find((e:any )=> e.id === store.config.currentEngineId);
  if (currentEngine) {
    window.open(currentEngine.url + encodeURIComponent(searchText.value), '_blank');
    searchText.value = '';
  }
};
</script>

<template>
  <div class="relative w-[90%] md:w-full md:max-w-[680px] px-0 group z-30 mb-4 transition-all">
    <div class="flex items-center apple-glass rounded-full px-2 py-2 transition-all border border-transparent shadow-xl hover:shadow-2xl" :class="{ 'effect-neon': store.config.theme.neonGlow }">
      <div class="relative">
        <button @click.stop="showEngineMenu = !showEngineMenu" class="p-2.5 rounded-full hover:bg-[var(--sidebar-active)] transition-colors text-[var(--accent-color)] flex items-center justify-center">
          <component :is="currentEngineIcon" size="22" weight="bold"/>
        </button>
        <transition name="scale">
          <div v-if="showEngineMenu" class="absolute top-14 left-0 w-48 apple-glass rounded-2xl p-2 shadow-xl flex flex-col gap-1 z-50">
            <div v-for="eng in store.config.searchEngines" :key="eng.id" class="flex items-center justify-between p-2 rounded-xl hover:bg-[var(--sidebar-active)] cursor-pointer group/item" @click="store.config.currentEngineId = eng.id; showEngineMenu = false">
              <div class="flex items-center gap-3"><component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"/><span class="text-sm font-bold">{{ eng.name }}</span></div>
              <button v-if="store.config.searchEngines.length > 1" @click.stop="store.removeEngine(eng.id)" class="opacity-0 group-hover/item:opacity-100 hover:text-red-500 p-1"><PhTrash size="14"/></button>
            </div>
            <div class="h-[1px] bg-current opacity-10 my-1"></div>
            <button @click="emit('openSettings')" class="text-xs font-bold opacity-60 hover:opacity-100 text-center py-2">添加引擎...</button>
          </div>
        </transition>
      </div>
      <div class="h-6 w-[1px] bg-current opacity-20 mx-2"></div>
      <input v-model="searchText" @keydown.enter="handleSearch" type="text" placeholder="开始搜索..." class="w-full bg-transparent text-lg font-medium px-2 outline-none placeholder-current/60" autofocus />
    </div>
  </div>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
</style>