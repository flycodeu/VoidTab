<script setup lang="ts">
import { useConfigStore } from '../../stores/useConfigStore';
import { PhMonitor, PhPlus, PhGear } from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';

const store = useConfigStore();
defineProps<{ activeGroupId: string, isFocusMode: boolean }>();
const emit = defineEmits(['update:activeGroupId', 'openSettings', 'openGroupDialog', 'openContextMenu']);
</script>

<template>
  <div v-if="!isFocusMode" class="absolute left-0 top-0 h-full z-40 pointer-events-none flex flex-col justify-center">

    <transition name="slide-fade">
      <aside class="hidden md:flex pointer-events-auto w-[90px] h-[96%] ml-4 rounded-[24px] apple-glass flex-col items-center py-6 shadow-2xl transition-all duration-300">
        <div class="mb-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"><PhMonitor weight="fill" size="24" /></div>
        <div class="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto no-scrollbar">
          <button v-for="group in store.config.layout" :key="group.id" @click="emit('update:activeGroupId', group.id)" @contextmenu.stop="(e) => emit('openContextMenu', e, group)" class="relative w-full aspect-square rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group/btn border-2 border-transparent" :class="[activeGroupId === group.id ? 'bg-[var(--sidebar-active)] text-[var(--accent-color)]' : 'hover:bg-[var(--sidebar-active)] opacity-60 hover:opacity-100', { 'effect-breathe': store.config.theme.breathingLight && activeGroupId === group.id }]">
            <component :is="(PhIcons as any)['Ph' + group.icon]" size="26" weight="duotone" class="transition-transform group-hover/btn:scale-110"/><span class="text-[10px] font-bold tracking-wide truncate max-w-full px-1">{{ group.title }}</span><div v-if="activeGroupId === group.id" class="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-[var(--accent-color)] rounded-full"></div>
          </button>
          <button @click="emit('openGroupDialog')" class="w-full aspect-square rounded-2xl border-2 border-dashed border-current opacity-20 hover:opacity-60 flex items-center justify-center mt-2"><PhPlus size="24" /></button>
        </div>
        <button @click="emit('openSettings')" class="mt-4 p-3 rounded-xl hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100 transition-all"><PhGear :size="26" weight="duotone" /></button>
      </aside>
    </transition>

    <transition name="slide-up">
      <nav class="md:hidden pointer-events-auto fixed bottom-0 left-0 w-full h-20 apple-glass z-50 flex items-center justify-between px-2 pb-safe border-t border-[var(--glass-border)] shadow-[0_-10px_20px_rgba(0,0,0,0.1)]">
        <div class="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar px-2 h-full">
          <button v-for="group in store.config.layout" :key="group.id" @click="emit('update:activeGroupId', group.id)" class="flex flex-col items-center justify-center gap-1 min-w-[60px] h-[50px] rounded-xl transition-all" :class="activeGroupId === group.id ? 'text-[var(--accent-color)]' : 'opacity-60 grayscale'">
            <component :is="(PhIcons as any)['Ph' + group.icon]" size="24" weight="duotone" :class="activeGroupId === group.id ? 'scale-110' : ''" class="transition-transform"/><span class="text-[10px] font-bold truncate max-w-full">{{ group.title }}</span>
          </button>
          <button @click="emit('openGroupDialog')" class="flex flex-col items-center justify-center min-w-[50px] h-[50px] rounded-xl opacity-40"><PhPlus size="24" /></button>
        </div>
        <div class="w-[1px] h-8 bg-current opacity-10 mx-1"></div>
        <button @click="emit('openSettings')" class="p-3 text-[var(--text-primary)] hover:text-[var(--accent-color)]"><PhGear size="26" weight="duotone"/></button>
      </nav>
    </transition>
  </div>
</template>

<style scoped>
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 20px); }
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateX(-20px); opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
</style>