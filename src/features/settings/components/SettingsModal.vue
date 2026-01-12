<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import { useSystemPrefersDark } from '../../../shared/composables/theme/systemColorScheme';
import {
  PhGear, PhX, PhSquaresFour, PhFrameCorners, PhImage,
  PhMagicWand, PhDatabase, PhGlobe, PhCloudArrowUp,
  PhShieldCheck // ✅ 新增图标
} from '@phosphor-icons/vue';

// Import Tabs
import IconTab from './tabs/IconTab.vue';
import LayoutTab from './tabs/LayoutTab.vue';
import ThemeTab from './tabs/ThemeTab.vue';
import EffectsTab from './tabs/EffectsTab.vue';
import SearchTab from './tabs/SearchTab.vue';
import DataTab from './tabs/DataTab.vue';
import SyncTab from './tabs/SyncTab.vue';
import PrivacyTab from './tabs/PrivacyTab.vue'; // ✅ 新增引入

defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);
const store = useConfigStore();

const menuItems = [
  {id: 'icon', label: '图标', icon: PhSquaresFour},
  {id: 'layout', label: '布局', icon: PhFrameCorners},
  {id: 'theme', label: '主题', icon: PhImage},
  {id: 'effects', label: '特效', icon: PhMagicWand},
  {id: 'search', label: '搜索', icon: PhGlobe},
  {id: 'privacy', label: '隐私', icon: PhShieldCheck}, // ✅ 新增菜单项
  {id: 'data', label: '数据', icon: PhDatabase},
  {id: 'sync', label: '云端同步', icon: PhCloudArrowUp}
] as const;

type TabType = typeof menuItems[number]['id'];
const settingsTab = ref<TabType>('icon');

const { prefersDark: systemPrefersDark } = useSystemPrefersDark();
const isDark = computed(() => store.config.theme.mode === 'dark'
  ? true
  : store.config.theme.mode === 'light'
    ? false
    : systemPrefersDark.value);

const tabMap: Record<TabType, any> = {
  icon: IconTab,
  layout: LayoutTab,
  theme: ThemeTab,
  effects: EffectsTab,
  search: SearchTab,
  privacy: PrivacyTab, // ✅ 新增映射
  data: DataTab,
  sync: SyncTab
};

const ActiveTab = computed(() => tabMap[settingsTab.value]);
</script>

<template>
  <transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 md:p-12">
      <div
          @click="emit('close')"
          class="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[4px] transition-all duration-500"
      ></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] md:h-[82vh] flex flex-col md:flex-row overflow-hidden rounded-[2rem] shadow-2xl transition-all animate-scale-in border backdrop-blur-2xl backdrop-saturate-150"
          :class="[
            isDark ? 'shadow-[0_0_50px_-10px_rgba(0,0,0,0.6)]' : 'shadow-2xl'
          ]"
          style="
            background-color: var(--settings-surface);
            border-color: var(--settings-border);
            color: var(--settings-text);
          "
      >
        <div
            class="w-full md:w-64 flex flex-row md:flex-col p-2 md:p-6 overflow-x-auto md:overflow-y-auto gap-2 no-scrollbar shrink-0 z-10 border-b md:border-b-0 md:border-r"
            style="
               background-color: var(--settings-panel);
               border-color: var(--settings-border);
            "
        >
          <div class="hidden md:flex items-center gap-3 mb-8 px-2 mt-2 select-none">
            <div
                class="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-color)] to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
              <PhGear weight="fill" size="20"/>
            </div>
            <span class="font-bold text-xl tracking-tight">设置</span>
          </div>

          <button
              v-for="item in menuItems"
              :key="item.id"
              @click="settingsTab = item.id"
              class="group relative flex-shrink-0 flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap outline-none"
              :class="[
                settingsTab === item.id
                  ? 'text-white shadow-lg shadow-[var(--accent-color)]/25 scale-[1.02]'
                  : 'text-[var(--settings-text)] hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
              ]"
              :style="settingsTab === item.id ? { backgroundColor: 'var(--accent-color)' } : {}"
          >
            <component
                :is="item.icon"
                size="18"
                :weight="settingsTab === item.id ? 'fill' : 'bold'"
                class="transition-transform duration-300 group-hover:scale-110"
            />
            <span>{{ item.label }}</span>

            <div v-if="settingsTab === item.id"
                 class="absolute inset-0 rounded-xl ring-1 ring-white/20 inset-shadow"></div>
          </button>
        </div>

        <div class="flex-1 flex flex-col h-full overflow-hidden relative">
          <div
              class="flex justify-between items-center px-6 py-5 md:py-6 shrink-0 z-20 border-b backdrop-blur-sm"
              style="
                border-color: var(--settings-border);
                background-color: rgba(255,255,255,0.05);
              "
          >
            <h2 class="text-lg font-bold flex items-center gap-2">
              {{ menuItems.find(i => i.id === settingsTab)?.label }}
              <span class="text-xs font-normal opacity-40 px-2 py-0.5 rounded-full hidden sm:inline-block"
                    style="background-color: var(--settings-panel); color: var(--settings-text);">Console</span>
            </h2>

            <button
                @click="emit('close')"
                class="p-2 rounded-full transition-all duration-200 opacity-60 hover:opacity-100 hover:rotate-90 active:scale-90"
                style="color: var(--settings-text);"
                :class="'hover:bg-black/5 dark:hover:bg-white/10'"
                title="关闭 (Esc)"
            >
              <PhX size="22" weight="bold"/>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 md:px-10 md:py-8 space-y-8 custom-scroll scroll-smooth">
            <component :is="ActiveTab"/>
          </div>
        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
/* 保持原有样式 */
.scale-enter-active, .scale-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(10px);
  filter: blur(10px);
}

.animate-scale-in {
  animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.custom-scroll::-webkit-scrollbar {
  width: 5px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
  margin: 4px;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.15);
  border-radius: 10px;
  transition: background 0.2s;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
}

.inset-shadow {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
</style>