<script setup lang="ts">
import {ref, watch} from 'vue';
import {
  PhX, PhStar, PhGithubLogo, PhArrowSquareOut,
  PhGitFork, PhSpinner, PhArrowsClockwise
} from '@phosphor-icons/vue';

const props = defineProps<{ show: boolean; initialTrends: any[] }>();
const emit = defineEmits(['close', 'refresh']);

const currentTrends = ref(props.initialTrends);
const isLocalLoading = ref(false);

const selectedLang = ref('');
const sortBy = ref('stars');
const languages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java'];

// 弹窗内的筛选逻辑
const applyFilter = async () => {
  isLocalLoading.value = true;
  let q = 'created:>2025-12-01';
  if (selectedLang.value) q += ` language:${selectedLang.value}`;

  try {
    const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=${sortBy.value}&order=desc&per_page=20`);
    const data = await res.json();
    currentTrends.value = data.items || [];
  } catch (e) {
    console.error("Filter error");
  } finally {
    isLocalLoading.value = false;
  }
};

const handleRefresh = () => {
  isLocalLoading.value = true;
  emit('refresh'); // 触发父组件更新缓存
  // 模拟同步刷新
  setTimeout(() => {
    const cached = localStorage.getItem('void_github_trends_data');
    if (cached) currentTrends.value = JSON.parse(cached);
    isLocalLoading.value = false;
  }, 1000);
};

watch([selectedLang, sortBy], () => applyFilter());
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4 lg:p-10">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-xl" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-[950px] h-[80vh] bg-[#1a1a1a] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden text-white">

        <div class="p-8 border-b border-white/10 bg-white/[0.02] shrink-0">
          <div class="flex justify-between items-center mb-8">
            <div class="flex items-center gap-4">
              <div class="p-4 bg-blue-500/20 rounded-2xl text-blue-400">
                <PhGithubLogo size="32" weight="fill"/>
              </div>
              <div>
                <h3 class="text-2xl font-bold tracking-tight">GitHub Trending</h3>
                <p class="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">发现全球最受关注的开源项目</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button @click="handleRefresh"
                      class="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-xs font-bold">
                <PhArrowsClockwise :class="{'animate-spin': isLocalLoading}" size="16"/>
                获取最新
              </button>
              <button @click="emit('close')" class="p-3 hover:bg-white/10 rounded-full transition text-white/40">
                <PhX size="24"/>
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-6">
            <div class="flex items-center gap-3">
              <label class="text-[10px] font-black text-blue-400 uppercase tracking-widest">语言类型</label>
              <select v-model="selectedLang"
                      class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-white/10 transition-all">
                <option value="" class="bg-[#1a1a1a]">所有语言</option>
                <option v-for="l in languages" :key="l" :value="l" class="bg-[#1a1a1a]">{{ l }}</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-[10px] font-black text-blue-400 uppercase tracking-widest">排序方式</label>
              <select v-model="sortBy"
                      class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-white/10 transition-all">
                <option value="stars" class="bg-[#1a1a1a]">Stars 增长</option>
                <option value="updated" class="bg-[#1a1a1a]">最近更新</option>
              </select>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-[#121212]/30 relative">
          <div v-if="isLocalLoading"
               class="absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm bg-black/10">
            <PhSpinner size="40" class="animate-spin text-blue-500"/>
          </div>

          <a v-for="(repo, index) in currentTrends" :key="repo.id"
             :href="repo.html_url" target="_blank"
             class="group flex items-start gap-6 p-6 bg-white/[0.03] hover:bg-white/[0.08] rounded-[24px] border border-white/5 hover:border-blue-500/30 transition-all">
            <div class="text-3xl font-black text-white/10 tabular-nums w-12 pt-1">{{ index + 1 }}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-2">
                <h4 class="text-xl font-bold group-hover:text-blue-400 transition-colors truncate">{{
                    repo.full_name
                  }}</h4>
                <PhArrowSquareOut size="16" class="opacity-0 group-hover:opacity-40"/>
              </div>
              <p class="text-sm text-white/40 leading-relaxed mb-6 line-clamp-2">{{
                  repo.description || '该项目暂无描述'
                }}</p>
              <div class="flex items-center gap-6 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                <div class="flex items-center gap-2">
                  <PhStar weight="fill" size="16" class="text-amber-400"/>
                  {{ repo.stargazers_count }}
                </div>
                <div class="flex items-center gap-2">
                  <PhGitFork size="16"/>
                  {{ repo.forks_count }}
                </div>
                <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span>
                  {{ repo.language || 'Unkown' }}
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
</style>