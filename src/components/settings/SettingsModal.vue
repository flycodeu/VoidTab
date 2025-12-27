<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {
  PhGear, PhX, PhSquaresFour, PhFrameCorners, PhImage, PhMagicWand, PhDatabase, PhGlobe, PhPuzzlePiece, PhCloudArrowUp
} from '@phosphor-icons/vue';

import IconTab from '../layout/settings/IconTab.vue';
import LayoutTab from '../layout/settings/LayoutTab.vue';
import ThemeTab from '../layout/settings/ThemeTab.vue';
import WidgetsTab from '../layout/settings/WidgetsTab.vue';
import EffectsTab from '../layout/settings/EffectsTab.vue';
import SearchTab from '../layout/settings/SearchTab.vue';
import DataTab from '../layout/settings/DataTab.vue';
import SyncTab from '../layout/settings/SyncTab.vue';

defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
 useConfigStore();

const menuItems = [
  {id: 'icon', label: '图标', icon: PhSquaresFour},
  {id: 'layout', label: '布局', icon: PhFrameCorners},
  {id: 'theme', label: '主题', icon: PhImage},
  {id: 'widgets', label: '组件', icon: PhPuzzlePiece},
  {id: 'effects', label: '特效', icon: PhMagicWand},
  {id: 'search', label: '搜索', icon: PhGlobe},
  {id: 'data', label: '数据', icon: PhDatabase},
  {id: 'sync', label: '云端同步', icon: PhCloudArrowUp}
] as const;

type TabType = typeof menuItems[number]['id'];
const settingsTab = ref<TabType>('icon');

const tabMap: Record<TabType, any> = {
  icon: IconTab,
  layout: LayoutTab,
  theme: ThemeTab,
  widgets: WidgetsTab,
  effects: EffectsTab,
  search: SearchTab,
  data: DataTab,
  sync: SyncTab
};

const ActiveTab = computed(() => tabMap[settingsTab.value]);
</script>

<template>
  <transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
      <div @click="emit('close')" class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-all"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] md:h-[80vh] flex flex-col md:flex-row overflow-hidden rounded-3xl shadow-2xl border transition-all animate-scale-in backdrop-blur-2xl"
          style="background-color: var(--modal-bg); color: var(--modal-text); border-color: var(--modal-border);"
      >
        <!-- 左侧菜单 -->
        <div
            class="w-full md:w-64 flex flex-row md:flex-col p-2 md:p-6 border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-y-auto gap-2 no-scrollbar shrink-0"
            style="background-color: var(--modal-sidebar); border-color: var(--modal-border);"
        >
          <div class="hidden md:flex items-center gap-3 mb-6 px-2">
            <div
                class="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-white shadow-lg">
              <PhGear weight="fill" size="18"/>
            </div>
            <span class="font-bold text-lg tracking-wide">设置</span>
          </div>

          <button
              v-for="item in menuItems"
              :key="item.id"
              @click="settingsTab = item.id"
              class="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
              :class="settingsTab === item.id ? 'bg-[var(--accent-color)] text-white shadow-md' : 'hover:bg-[var(--sidebar-active)] opacity-70 hover:opacity-100'"
          >
            <component :is="item.icon" size="18" weight="bold"/>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <!-- 右侧内容 -->
        <div class="flex-1 flex flex-col h-full overflow-hidden relative bg-transparent">
          <div class="flex justify-between items-center p-4 md:p-6 border-b shrink-0"
               style="border-color: var(--modal-border);">
            <h2 class="text-xl font-bold">控制台</h2>
            <button @click="emit('close')" class="p-2 hover:bg-[var(--sidebar-active)] rounded-full transition-colors">
              <PhX size="20"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scroll">
            <!-- 当前 Tab -->
            <component :is="ActiveTab"/>
          </div>
        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 4px;
}
</style>
