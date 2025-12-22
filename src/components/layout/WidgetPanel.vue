<script setup lang="ts">
import { computed } from 'vue';
import { PhX, PhSquaresFour } from '@phosphor-icons/vue';
import { useConfigStore } from '../../stores/useConfigStore';

// 引入所有小组件
import WeatherWidget from '../widgets/WeatherWidget.vue';
import GitHubTrendsWidget from '../widgets/GitHubTrendsWidget.vue';
import SystemWidget from '../widgets/SystemWidget.vue';
import DevToolsWidget from '../widgets/DevToolsWidget.vue';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits(['close']);
const store = useConfigStore();

const components: Record<string, any> = {
  weather: WeatherWidget,
  github: GitHubTrendsWidget,
  system: SystemWidget,
  devtools: DevToolsWidget
};

const visibleWidgets = computed(() => {
  return (store.config.widgets || [])
      .filter((w: any) => w.visible)
      .sort((a: any, b: any) => a.order - b.order);
});
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" @click="emit('close')"></div>

      <div class="relative w-full max-w-6xl h-[85vh] md:h-[75vh] apple-glass rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/10"
           style="background-color: var(--glass-surface);">

        <div class="flex items-center justify-between px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--sidebar-active)] select-none shrink-0">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-[var(--accent-color)] text-white shadow-lg"><PhSquaresFour size="20" weight="fill"/></div>
            <span class="font-bold text-sm tracking-widest font-tech opacity-90" style="color: var(--text-primary)">DATA DASHBOARD</span>
          </div>
          <button @click="emit('close')" class="p-2 hover:bg-white/10 rounded-full transition-colors"><PhX size="22" style="color: var(--text-primary)"/></button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 md:p-8 custom-scroll">

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <template v-for="widget in visibleWidgets" :key="widget.id">
              <div class="w-full h-[420px] flex flex-col bg-white/5 rounded-2xl border border-white/5 transition-all hover:border-white/20 overflow-hidden relative group shadow-sm hover:shadow-md">

                <div class="overflow-y-auto custom-scroll flex-1 flex flex-col w-full">
                  <component
                      :is="components[widget.id]"
                      :settings="widget.config"
                      class="w-full flex-1"
                  />
                </div>

              </div>
            </template>

            <div v-if="visibleWidgets.length === 0" class="col-span-full h-64 flex flex-col items-center justify-center text-[var(--text-primary)] opacity-50">
              <PhSquaresFour size="48" weight="duotone" class="mb-4"/>
              <span>暂无启用的小组件，请在设置中开启</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

/* 滚动条样式优化：鼠标悬停时才明显 */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.1); border-radius: 4px; }
.custom-scroll:hover::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.4); }
</style>