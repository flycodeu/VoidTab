<script setup lang="ts">
import {computed, nextTick, ref} from 'vue';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {
  PhCloudArrowUp,
  PhDatabase,
  PhFlask,
  PhFrameCorners,
  PhGear,
  PhGlobe,
  PhImage,
  PhInfo,
  PhMagicWand,
  PhShieldCheck,
  PhSquaresFour,
  PhX
} from '@phosphor-icons/vue';

import AuthorTab from './tabs/AuthorTab.vue';
import AdvancedTab from './tabs/AdvancedTab.vue';
import DataTab from './tabs/DataTab.vue';
import EffectsTab from './tabs/EffectsTab.vue';
import IconTab from './tabs/IconTab.vue';
import LayoutTab from './tabs/LayoutTab.vue';
import PrivacyTab from './tabs/PrivacyTab.vue';
import SearchTab from './tabs/SearchTab.vue';
import SyncTab from './tabs/SyncTab.vue';
import TemplateTab from './tabs/TemplateTab.vue';
import ThemeTab from './tabs/ThemeTab.vue';
import {useFocusTrap} from '../../../shared/composables/useFocusTrap';
import {useEscapeClose} from '../../../shared/composables/useEscapeClose';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close', 'openPrivacyVault']);
const store = useConfigStore();
const dialogRef = ref<HTMLElement | null>(null);
const isDialogActive = computed(() => props.show);
useFocusTrap(dialogRef, isDialogActive);
useEscapeClose(isDialogActive, () => emit('close'));

const settingsTitle = '\u8bbe\u7f6e';
const closeTitle = '\u5173\u95ed (Esc)';

const menuItems = [
  {id: 'template', label: '\u6a21\u677f', icon: PhMagicWand},
  {id: 'icon', label: '\u56fe\u6807', icon: PhSquaresFour},
  {id: 'layout', label: '\u5e03\u5c40', icon: PhFrameCorners},
  {id: 'theme', label: '\u4e3b\u9898', icon: PhImage},
  {id: 'effects', label: '\u7279\u6548', icon: PhMagicWand},
  {id: 'search', label: '\u641c\u7d22', icon: PhGlobe},
  {id: 'privacy', label: '\u9690\u79c1', icon: PhShieldCheck},
  {id: 'data', label: '\u6570\u636e', icon: PhDatabase},
  {id: 'sync', label: '\u4e91\u7aef\u540c\u6b65', icon: PhCloudArrowUp},
  {id: 'advanced', label: '\u9ad8\u7ea7', icon: PhFlask},
  {id: 'author', label: '\u4f5c\u8005\u4ecb\u7ecd', icon: PhInfo}
] as const;

type TabType = typeof menuItems[number]['id'];
const settingsTab = ref<TabType>('template');

const tabMap: Record<TabType, any> = {
  template: TemplateTab,
  icon: IconTab,
  layout: LayoutTab,
  theme: ThemeTab,
  effects: EffectsTab,
  search: SearchTab,
  privacy: PrivacyTab,
  data: DataTab,
  sync: SyncTab,
  advanced: AdvancedTab,
  author: AuthorTab
};

function openPrivacyVault() {
  emit('openPrivacyVault');
}

const activeTab = computed(() => tabMap[settingsTab.value]);
const activeMenuLabel = computed(() => menuItems.find(i => i.id === settingsTab.value)?.label || settingsTitle);
const activeTabListeners = computed(() => settingsTab.value === 'privacy' ? {openPrivacyVault} : {});
const settingsTabId = (id: TabType) => `settings-tab-${id}`;
const settingsPanelId = (id: TabType) => `settings-panel-${id}`;

const focusTab = async (id: TabType) => {
  await nextTick();
  document.getElementById(settingsTabId(id))?.focus();
};

const selectSettingsTab = (id: TabType) => {
  settingsTab.value = id;
};

const moveSettingsTab = (from: TabType, offset: number) => {
  const index = menuItems.findIndex(item => item.id === from);
  const nextIndex = (index + offset + menuItems.length) % menuItems.length;
  const nextId = menuItems[nextIndex].id;
  selectSettingsTab(nextId);
  void focusTab(nextId);
};

const onSettingsTabKeydown = (event: KeyboardEvent, id: TabType) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveSettingsTab(id, 1);
    return;
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSettingsTab(id, -1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    const firstId = menuItems[0].id;
    selectSettingsTab(firstId);
    void focusTab(firstId);
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    const lastId = menuItems[menuItems.length - 1].id;
    selectSettingsTab(lastId);
    void focusTab(lastId);
  }
};
</script>

<template>
  <transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 md:p-12" data-modal="1">
      <div
        @click="emit('close')"
        class="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[4px] transition-all duration-500"
        aria-hidden="true"
      ></div>

      <div
        ref="dialogRef"
        class="relative w-full max-w-5xl h-[85vh] md:h-[82vh] flex flex-col md:flex-row overflow-hidden rounded-[2rem] shadow-2xl transition-all animate-scale-in border backdrop-blur-2xl backdrop-saturate-150"
        :class="[
          store.config.theme.mode === 'dark' ? 'shadow-[0_0_50px_-10px_rgba(0,0,0,0.6)]' : 'shadow-2xl'
        ]"
        style="
          background-color: var(--settings-surface);
          border-color: var(--settings-border);
          color: var(--settings-text);
        "
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabindex="-1"
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
              class="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-color)] to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20"
              aria-hidden="true"
            >
              <PhGear weight="fill" size="20"/>
            </div>
            <span class="font-bold text-xl tracking-tight">{{ settingsTitle }}</span>
          </div>

          <div
            role="tablist"
            aria-label="设置分类"
            class="flex flex-row md:flex-col gap-2"
          >
          <button
            v-for="item in menuItems"
            :key="item.id"
            @click="selectSettingsTab(item.id)"
            @keydown="onSettingsTabKeydown($event, item.id)"
            class="group relative flex-shrink-0 flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap outline-none"
            :class="[
              settingsTab === item.id
                ? 'text-white shadow-lg shadow-[var(--accent-color)]/25 scale-[1.02]'
                : 'text-[var(--settings-text)] hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
            ]"
            :style="settingsTab === item.id ? { backgroundColor: 'var(--accent-color)' } : {}"
            role="tab"
            :id="settingsTabId(item.id)"
            :aria-selected="settingsTab === item.id"
            :aria-controls="settingsPanelId(item.id)"
            :tabindex="settingsTab === item.id ? 0 : -1"
          >
            <component
              :is="item.icon"
              size="18"
              :weight="settingsTab === item.id ? 'fill' : 'bold'"
              class="transition-transform duration-300 group-hover:scale-110"
              aria-hidden="true"
            />
            <span>{{ item.label }}</span>
            <div
              v-if="settingsTab === item.id"
              class="absolute inset-0 rounded-xl ring-1 ring-white/20 inset-shadow"
            ></div>
          </button>
          </div>
        </div>

        <div class="flex-1 flex flex-col h-full overflow-hidden relative">
          <div
            class="flex justify-between items-center px-6 py-5 md:py-6 shrink-0 z-20 border-b backdrop-blur-sm"
            style="
              border-color: var(--settings-border);
              background-color: rgba(255,255,255,0.05);
            "
          >
            <h2 id="settings-dialog-title" class="text-lg font-bold flex items-center gap-2">
              {{ settingsTitle }}：{{ activeMenuLabel }}
            </h2>

            <button
              @click="emit('close')"
              class="p-2 rounded-full transition-all duration-200 opacity-60 hover:opacity-100 hover:rotate-90 active:scale-90"
              style="color: var(--settings-text);"
              :class="'hover:bg-black/5 dark:hover:bg-white/10'"
              :title="closeTitle"
              aria-label="关闭设置"
            >
              <PhX size="22" weight="bold" aria-hidden="true"/>
            </button>
          </div>

          <div
            class="flex-1 overflow-y-auto p-6 md:px-10 md:py-8 space-y-8 custom-scroll scroll-smooth"
            role="tabpanel"
            :id="settingsPanelId(settingsTab)"
            :aria-labelledby="settingsTabId(settingsTab)"
          >
            <component :is="activeTab" v-on="activeTabListeners"/>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
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
