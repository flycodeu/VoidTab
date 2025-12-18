<script setup lang="ts">
import { PhX, PhSquaresFour, PhGithubLogo, PhCpu } from '@phosphor-icons/vue';
import WeatherWidget from '../widgets/WeatherWidget.vue';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits(['close']);
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" @click="emit('close')"></div>

      <div class="relative w-full max-w-5xl h-[80vh] md:h-[70vh] apple-glass rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-white/10"
           style="background-color: var(--glass-surface);">

        <div class="flex items-center justify-between px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--sidebar-active)] select-none">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-[var(--accent-color)] text-white shadow-lg"><PhSquaresFour size="20" weight="fill"/></div>
            <span class="font-bold text-sm tracking-widest font-tech opacity-90" style="color: var(--text-primary)">DATA DASHBOARD</span>
          </div>
          <button @click="emit('close')" class="p-2 hover:bg-white/10 rounded-full transition-colors"><PhX size="22" style="color: var(--text-primary)"/></button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 md:p-8 custom-scroll">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            <div class="h-full min-h-[300px]"><WeatherWidget /></div>
            <div class="border border-dashed border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center opacity-40 hover:opacity-80 transition-all min-h-[250px] bg-[var(--sidebar-active)]"><PhGithubLogo size="56" class="mb-4"/><span class="font-tech text-xs font-bold">GITHUB</span><span class="text-[10px] mt-2 opacity-50">Loading...</span></div>
            <div class="border border-dashed border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center opacity-40 hover:opacity-80 transition-all min-h-[250px] bg-[var(--sidebar-active)]"><PhCpu size="56" class="mb-4"/><span class="font-tech text-xs font-bold">SYSTEM</span><span class="text-[10px] mt-2 opacity-50">Analyzing...</span></div>
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
</style>