<script setup lang="ts">
import {ref, computed} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {PhTrash, PhMagnifyingGlass, PhArrowRight} from '@phosphor-icons/vue'; // ✨ 引入新图标
import * as PhIcons from '@phosphor-icons/vue';

const store = useConfigStore();
const searchText = ref('');
const showEngineMenu = ref(false);
const emit = defineEmits(['openSettings']);

const currentEngineIcon = computed(() => {
  const engine = store.config.searchEngines.find((e: any) => e.id === store.config.currentEngineId);
  return engine ? (PhIcons as any)['Ph' + engine.icon] || PhIcons.PhMagnifyingGlass : PhIcons.PhMagnifyingGlass;
});

const handleSearch = () => {
  if (!searchText.value) return;
  const currentEngine = store.config.searchEngines.find((e: any) => e.id === store.config.currentEngineId);
  if (currentEngine) {
    window.open(currentEngine.url + encodeURIComponent(searchText.value), '_blank');
    searchText.value = '';
  }
};
</script>

<template>
  <div class="relative w-[90%] md:w-full md:max-w-[680px] px-0 group z-30 mb-4 transition-all">

    <div
        class="flex items-center rounded-full px-2 py-2 transition-all border border-white/20 shadow-lg hover:shadow-2xl hover:bg-white/20"
        :class="[
        'bg-white/10 dark:bg-black/20 backdrop-blur-xl',
        { 'effect-neon': store.config.theme.neonGlow }
      ]"
    >

      <div class="relative shrink-0">
        <button @click.stop="showEngineMenu = !showEngineMenu"
                class="p-3 rounded-full hover:bg-white/20 transition-colors text-[var(--accent-color)] flex items-center justify-center">
          <component :is="currentEngineIcon" size="24" weight="bold"/>
        </button>

        <transition name="scale">
          <div v-if="showEngineMenu"
               class="absolute top-14 left-0 w-48 bg-[#1e1e1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 z-50 text-white">
            <div v-for="eng in store.config.searchEngines" :key="eng.id"
                 class="flex items-center justify-between p-3 rounded-xl hover:bg-white/10 cursor-pointer group/item transition-colors"
                 @click="store.config.currentEngineId = eng.id; showEngineMenu = false">
              <div class="flex items-center gap-3">
                <component :is="(PhIcons as any)['Ph' + eng.icon] || PhIcons.PhGlobe" size="18"/>
                <span class="text-sm font-bold">{{ eng.name }}</span>
              </div>
              <button v-if="store.config.searchEngines.length > 1" @click.stop="store.removeEngine(eng.id)"
                      class="opacity-0 group-hover/item:opacity-100 hover:text-red-500 p-1 transition-opacity">
                <PhTrash size="14"/>
              </button>
            </div>
            <div class="h-[1px] bg-white/10 my-1"></div>
            <button @click="emit('openSettings')"
                    class="text-xs font-bold opacity-60 hover:opacity-100 text-center py-2 transition-opacity">添加引擎...
            </button>
          </div>
        </transition>
      </div>

      <div class="h-6 w-[1px] bg-current opacity-20 mx-2 shrink-0"></div>

      <input
          v-model="searchText"
          @keydown.enter="handleSearch"
          type="text"
          placeholder="开始搜索..."
          class="flex-1 min-w-0 h-10 bg-transparent text-lg font-medium px-2 outline-none placeholder-gray-500 dark:placeholder-gray-400 text-[var(--text-primary)]"
          autofocus
      />

      <button
          @click="handleSearch"
          class="p-2.5 rounded-full hover:bg-[var(--accent-color)] hover:text-white text-[var(--text-primary)] transition-all active:scale-95 shrink-0 ml-1"
          title="搜索"
      >
        <PhMagnifyingGlass v-if="!searchText" size="20" weight="bold" class="opacity-70"/>
        <PhArrowRight v-else size="20" weight="bold"/>
      </button>

    </div>
  </div>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.effect-neon {
  box-shadow: 0 0 10px var(--accent-color), inset 0 0 5px rgba(255, 255, 255, 0.1);
  border-color: var(--accent-color);
}
</style>