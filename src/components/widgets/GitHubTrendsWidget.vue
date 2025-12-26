<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {PhStar, PhSpinner, PhWarning, PhGithubLogo} from '@phosphor-icons/vue';

interface Repo {
  id: number;
  name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  language: string;
  languageColor?: string;
}

const trends = ref<Repo[]>([]);
const isLoading = ref(true);
const errorMsg = ref('');

const languageColors: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Vue: '#41b883', Python: '#3572A5',
  Java: '#b07219', Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051'
};

const fetchTrends = async () => {
  try {
    isLoading.value = true;
    errorMsg.value = '';
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateStr = date.toISOString().split('T')[0];

    const res = await fetch(`https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc&per_page=10`);
    if (!res.ok) throw new Error('API Rate Limit');

    const data = await res.json();
    trends.value = data.items.map((item: any) => ({
      id: item.id,
      name: item.full_name,
      html_url: item.html_url,
      description: item.description || 'No description provided.',
      stargazers_count: item.stargazers_count,
      language: item.language || 'Code',
      languageColor: languageColors[item.language] || '#8b949e'
    }));
  } catch (e) {
    errorMsg.value = 'GitHub API 请求受限';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => fetchTrends());

const formatNumber = (num: number) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();
</script>

<template>
  <div class="h-full flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-200/60 shadow-sm">
    <div class="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
      <div class="p-1 rounded-md bg-white border border-gray-200 text-gray-700 shadow-sm">
        <PhGithubLogo size="18" weight="fill"/>
      </div>
      <span class="text-xs font-bold font-tech tracking-wider text-gray-500">TRENDING</span>
    </div>

    <div class="flex-1 overflow-y-auto custom-scroll p-3 relative">
      <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-white z-10">
        <PhSpinner size="24" class="animate-spin text-blue-500"/>
        <span class="text-[10px] font-bold text-gray-400 tracking-widest">LOADING</span>
      </div>

      <div v-else-if="errorMsg" class="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <PhWarning size="28" class="text-orange-400 mb-2 opacity-80"/>
        <p class="text-xs text-gray-500 mb-3">{{ errorMsg }}</p>
        <button @click="fetchTrends"
                class="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs font-bold transition-colors text-gray-600">
          刷新
        </button>
      </div>

      <div v-else class="space-y-2">
        <a v-for="repo in trends" :key="repo.id"
           :href="repo.html_url" target="_blank"
           class="block p-3 rounded-xl bg-white border border-transparent hover:border-gray-200 hover:bg-gray-50 hover:shadow-sm transition-all group"
        >
          <div class="flex justify-between items-start gap-3">
            <h3 class="text-sm font-bold text-gray-800 group-hover:text-blue-600 truncate w-full transition-colors">
              {{ repo.name }}
            </h3>

            <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 border border-gray-200 shrink-0">
              <PhStar weight="fill" size="12" class="text-amber-400"/>
              <span class="text-xs font-bold font-mono text-gray-600">{{ formatNumber(repo.stargazers_count) }}</span>
            </div>
          </div>

          <p class="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2 min-h-[2.4em]">
            {{ repo.description }}
          </p>

          <div class="flex items-center gap-3 mt-3 text-[10px] text-gray-400 font-medium tracking-wide">
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full ring-1 ring-gray-200" :style="{ background: repo.languageColor }"></div>
              {{ repo.language }}
            </div>
          </div>
        </a>
      </div>
    </div>
  </div>
</template>