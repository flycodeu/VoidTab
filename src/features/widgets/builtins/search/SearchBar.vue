<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useHistoryStore} from '../../../../stores/useHistoryStore';
import {onClickOutside} from '@vueuse/core';
import {
  PhTrash, PhMagnifyingGlass, PhArrowRight,
  PhSparkle, PhAppWindow, PhArrowSquareOut,
  PhClockCounterClockwise
} from '@phosphor-icons/vue';
import * as PhIcons from '@phosphor-icons/vue';
import AiChatPanel from "../../../ai/components/AiChatPanel.vue";
import HistoryModal from './HistoryModal.vue';

const store = useConfigStore();
const historyStore = useHistoryStore();

const searchText = ref('');
const showEngineMenu = ref(false);
const searchContainer = ref(null);

// 控制状态
const showSuggestions = ref(false);
const showAiModal = ref(false);
const showHistoryModal = ref(false);
const aiQuery = ref('');
const selectedIndex = ref(-1); // -1:输入框, 0:AI/跳转, 1+:本地结果

const emit = defineEmits(['openSettings']);

// 点击外部关闭
onClickOutside(searchContainer, () => {
  showEngineMenu.value = false;
  showSuggestions.value = false;
  selectedIndex.value = -1;
});

// --- 1. 引擎图标逻辑 ---
const currentEngineIcon = computed(() => {
  const engine = store.config.searchEngines.find((e: any) => e.id === store.config.currentEngineId);
  return engine ? (PhIcons as any)['Ph' + engine.icon] || PhIcons.PhMagnifyingGlass : PhIcons.PhMagnifyingGlass;
});

// --- 2. 智能建议 (AI / 跳转) ---
const smartAction = computed(() => {
  const text = searchText.value.trim();
  if (!text) return null;

  // 简单判断是否为网址或特定关键词
  const isUrl = /^(https?:\/\/|www\.)|(\.com|\.cn|\.net|\.org)$/i.test(text);
  const isSiteKeyword = ['github', 'bilibili', 'google', 'baidu', 'youtube', 'bilibili'].includes(text.toLowerCase());

  if (isUrl || isSiteKeyword) {
    let url = text;
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    if (isSiteKeyword && !text.includes('.')) url = `https://${text}.com`;

    return {
      type: 'goto',
      label: `前往 ${url}`,
      sub: '按 Enter 直接跳转',
      url,
      icon: PhArrowSquareOut,
      color: 'text-blue-500'
    };
  }

  return {
    type: 'ai',
    label: `AI 解答: ${text}`,
    sub: '按 Enter 询问 AI 助手',
    query: text,
    icon: PhSparkle,
    color: 'text-purple-500'
  };
});

// --- 3. 本地搜索 ---
const localResults = computed(() => {
  if (!searchText.value) return [];
  const query = searchText.value.toLowerCase();
  const list: any[] = [];

  store.config.layout.forEach((group: any) => {
    group.items.forEach((item: any) => {
      // 过滤掉 widget，只保留 site
      if (item.kind !== 'widget' && (item.title?.toLowerCase().includes(query) || item.url?.toLowerCase().includes(query))) {
        list.push({...item, groupName: group.title});
      }
    });
  });
  return list.slice(0, 6); // 最多显示6条
});

watch(searchText, (val) => {
  showSuggestions.value = !!val;
  selectedIndex.value = -1;
});

// --- 4. 键盘交互 ---
const handleKeydown = (e: KeyboardEvent) => {
  if (!showSuggestions.value) {
    if (e.key === 'Enter') handleSearch();
    return;
  }

  const totalItems = (smartAction.value ? 1 : 0) + localResults.value.length;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex.value = selectedIndex.value < totalItems - 1 ? selectedIndex.value + 1 : -1;
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex.value = selectedIndex.value > -1 ? selectedIndex.value - 1 : totalItems - 1;
      break;
    case 'Enter':
      e.preventDefault();
      executeAction(selectedIndex.value);
      break;
    case 'Escape':
      showSuggestions.value = false;
      break;
  }
};

const executeAction = (index: number) => {
  // -1: 默认引擎搜索
  if (index === -1) {
    handleSearch();
    return;
  }

  // 0: Smart Action
  if (index === 0 && smartAction.value) {
    if (smartAction.value.type === 'goto') {
      historyStore.addLog('goto', smartAction.value.url); // ✅ 记录跳转
      window.open(smartAction.value.url, '_blank');
    } else {
      historyStore.addLog('ai', smartAction.value.query); // ✅ 记录提问
      aiQuery.value = smartAction.value.query || '';
      showAiModal.value = true;
    }
    closePanel();
    return;
  }

  // 1+: Local Results
  if (index > 0) {
    const item = localResults.value[index - 1];
    if (item) {
      historyStore.addLog('goto', item.url); // ✅ 记录本地跳转
      window.open(item.url, '_blank');
    }
    closePanel();
  }
};

const closePanel = () => {
  showSuggestions.value = false;
  searchText.value = '';
  selectedIndex.value = -1;
};

// --- 5. 普通搜索逻辑 (修复记录丢失) ---
const handleSearch = () => {
  if (!searchText.value) return;
  const currentEngine = store.config.searchEngines.find((e: any) => e.id === store.config.currentEngineId);

  // ✅ 核心修复：添加搜索记录
  historyStore.addLog('search', searchText.value, {engineId: currentEngine?.id});

  if (currentEngine) {
    window.open(currentEngine.url + encodeURIComponent(searchText.value), '_blank');
    searchText.value = '';
    showSuggestions.value = false;
  }
};
</script>

<template>
  <div ref="searchContainer" class="relative w-[90%] md:w-full md:max-w-[680px] px-0 group z-30 mb-4 transition-all">

    <div
        class="flex items-center rounded-full px-2 py-2 transition-all border border-white/20 shadow-lg hover:shadow-2xl hover:bg-white/20 relative z-20"
        :class="[
        'bg-white/10 dark:bg-black/20 backdrop-blur-xl',
        { 'effect-neon': store.config.theme.neonGlow },
        showSuggestions ? 'rounded-b-none border-b-transparent bg-white/90 dark:bg-[#1e1e1e]/95' : ''
      ]"
    >

      <div class="relative shrink-0">
        <button @click.stop="showEngineMenu = !showEngineMenu"
                class="p-3 rounded-full hover:bg-white/20 transition-colors text-[var(--accent-color)] flex items-center justify-center">
          <component :is="currentEngineIcon" size="24" weight="bold"/>
        </button>

        <transition name="scale">
          <div v-if="showEngineMenu"
               class="absolute top-14 left-0 w-48 backdrop-blur-xl border rounded-2xl p-2 shadow-2xl flex flex-col gap-1 z-50"
               style="background-color: var(--glass-bg); color: var(--glass-text); border-color: var(--glass-border);">
            <div v-for="eng in store.config.searchEngines" :key="eng.id"
                 class="flex items-center justify-between p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer group/item transition-colors"
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
            <div class="h-[1px] bg-black/10 dark:bg-white/10 my-1"></div>
            <button @click="emit('openSettings')"
                    class="text-xs font-bold opacity-60 hover:opacity-100 text-center py-2 transition-opacity">添加引擎...
            </button>
          </div>
        </transition>
      </div>

      <div class="h-6 w-[1px] bg-current opacity-20 mx-2 shrink-0"></div>

      <input
          v-model="searchText"
          @keydown="handleKeydown"
          type="text"
          placeholder="开始搜索..."
          class="flex-1 min-w-0 h-10 bg-transparent text-lg font-medium px-2 outline-none placeholder-gray-500 dark:placeholder-gray-400 text-[var(--text-primary)]"
          autofocus
      />

      <div class="flex items-center gap-1">
        <button v-if="store.config.theme.enableHistory"
                @click="showHistoryModal = true"
                class="group/hist p-2.5 rounded-full hover:bg-white/10 text-[var(--text-primary)] opacity-60 hover:opacity-100 transition relative"
                title="查看历史记录">
          <PhClockCounterClockwise size="20" weight="bold"/>
          <span
              class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-[10px] rounded opacity-0 group-hover/hist:opacity-100 transition pointer-events-none whitespace-nowrap">历史记录</span>
        </button>

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

    <transition name="slide">
      <div v-if="showSuggestions"
           class="absolute top-full left-0 w-full mt-0 pt-2
                  bg-white/90 dark:bg-[#1e1e1e]/95 backdrop-blur-xl
                  border border-white/20 border-t-0 rounded-b-3xl shadow-2xl
                  overflow-hidden z-10 flex flex-col text-[var(--text-primary)]">

        <div v-if="smartAction"
             @click="executeAction(0)"
             class="px-4 py-3 mx-2 mt-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border border-transparent"
             :class="selectedIndex === 0 ? 'bg-black/5 dark:bg-white/10 border-black/5' : 'hover:bg-black/5 dark:hover:bg-white/5'">

          <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-white/50 dark:bg-black/20 shrink-0">
            <component :is="smartAction.icon" size="22" weight="duotone" :class="smartAction.color"/>
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold truncate">{{ smartAction.label }}</div>
            <div class="text-xs opacity-50 truncate">{{ smartAction.sub }}</div>
          </div>

          <PhArrowRight v-if="selectedIndex === 0" size="16" class="opacity-50 animate-pulse"/>
        </div>

        <div v-if="smartAction && localResults.length > 0" class="h-[1px] bg-black/5 dark:bg-white/5 mx-4 my-2"></div>

        <div v-if="localResults.length > 0" class="pb-2">
          <div class="text-[10px] font-bold opacity-40 px-6 mb-1 uppercase tracking-wider">Local Results</div>

          <div class="flex flex-col gap-1 px-2">
            <div v-for="(item, idx) in localResults" :key="item.id"
                 @click="executeAction(idx + 1)"
                 class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border-l-2 border-transparent"
                 :class="selectedIndex === (idx + 1) ? 'bg-black/5 dark:bg-white/10 border-[var(--accent-color)]' : 'hover:bg-black/5 dark:hover:bg-white/5'">

              <div
                  class="w-6 h-6 rounded bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                <img v-if="item.icon && item.icon.startsWith('http')" :src="item.icon"
                     class="w-full h-full object-cover"/>
                <PhAppWindow v-else size="14" class="opacity-70"/>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ item.title }}</div>
                <div class="text-[10px] opacity-40 truncate">{{ item.groupName }} · {{ item.url }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-4 py-2 bg-black/5 dark:bg-black/20 text-[10px] text-center opacity-40">
          使用 ↑ ↓ 选择，Enter 确认
        </div>
      </div>
    </transition>

    <AiChatPanel :is-open="showAiModal" :initial-query="aiQuery" @close="showAiModal = false"/>
    <HistoryModal :show="showHistoryModal" @close="showHistoryModal = false"/>

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

.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease-out;
}

.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.effect-neon {
  box-shadow: 0 0 10px var(--accent-color), inset 0 0 5px rgba(255, 255, 255, 0.1);
  border-color: var(--accent-color);
}
</style>