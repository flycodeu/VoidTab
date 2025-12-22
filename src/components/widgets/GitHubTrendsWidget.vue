<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { PhStar, PhSpinner, PhWarning, PhGithubLogo } from '@phosphor-icons/vue';

// 定义数据接口
interface Repo {
  id: number;
  name: string;      // 对应 full_name 或 name
  html_url: string;  // 项目链接
  description: string;
  stargazers_count: number;
  language: string;
  languageColor?: string; // 可选：语言颜色
}

const trends = ref<Repo[]>([]);
const isLoading = ref(true);
const errorMsg = ref('');

// 颜色映射 (简单的语言颜色)
const languageColors: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Vue: '#41b883', Python: '#3572A5',
  Java: '#b07219', Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051'
};

const fetchTrends = async () => {
  try {
    isLoading.value = true;
    errorMsg.value = '';

    // 使用 GitHub 官方 Search API 获取近期热门 (比第三方爬虫更稳定)
    // 逻辑：搜索过去 7 天创建或更新的仓库，按 stars 排序
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateStr = date.toISOString().split('T')[0];

    const res = await fetch(`https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc&per_page=10`);

    if (!res.ok) throw new Error('API 请求受限或失败');

    const data = await res.json();
    trends.value = data.items.map((item: any) => ({
      id: item.id,
      name: item.full_name, // 使用 full_name (如 vuejs/core) 更专业
      html_url: item.html_url,
      description: item.description || '暂无简介',
      stargazers_count: item.stargazers_count,
      language: item.language || 'Unknown',
      languageColor: languageColors[item.language] || '#8b949e'
    }));

  } catch (e: any) {
    console.error(e);
    errorMsg.value = '无法连接 GitHub API';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchTrends();
});

const formatNumber = (num: number) => {
  return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();
};
</script>

<template>
  <div class="h-full flex flex-col apple-glass rounded-2xl overflow-hidden bg-[var(--sidebar-active)] border border-[var(--glass-border)]">

    <div class="flex items-center gap-2 px-5 py-4 border-b border-[var(--glass-border)] bg-black/5">
      <PhGithubLogo size="20" weight="fill" class="text-[var(--text-primary)]" />
      <span class="text-xs font-bold font-tech tracking-widest opacity-80">GITHUB TRENDING</span>
    </div>

    <div class="flex-1 overflow-y-auto custom-scroll p-2 relative">

      <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center space-y-2">
        <PhSpinner size="24" class="animate-spin text-[var(--accent-color)]"/>
        <span class="text-[10px] opacity-50 font-tech">FETCHING DATA...</span>
      </div>

      <div v-else-if="errorMsg" class="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <PhWarning size="32" class="text-red-400 mb-2 opacity-80"/>
        <p class="text-xs font-bold opacity-60 mb-2">{{ errorMsg }}</p>
        <button @click="fetchTrends" class="px-3 py-1.5 bg-[var(--sidebar-active)] hover:bg-[var(--accent-color)] hover:text-white rounded-lg text-[10px] font-bold transition-colors border border-[var(--glass-border)]">
          重试
        </button>
      </div>

      <div v-else class="space-y-2">
        <a v-for="repo in trends" :key="repo.id"
           :href="repo.html_url" target="_blank"
           class="block p-3 rounded-xl hover:bg-[var(--glass-highlight)] transition-all group border border-transparent hover:border-[var(--glass-border)]">

          <div class="flex justify-between items-start gap-2">
            <h3 class="text-sm font-bold text-[var(--accent-color)] group-hover:underline truncate w-full">
              {{ repo.name }}
            </h3>
            <div class="flex items-center gap-1 text-[10px] opacity-60 bg-black/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              <PhStar weight="fill" size="10" class="text-yellow-500"/>
              <span class="font-mono">{{ formatNumber(repo.stargazers_count) }}</span>
            </div>
          </div>

          <p class="text-[11px] opacity-60 mt-1 line-clamp-2 leading-relaxed h-[32px]">
            {{ repo.description }}
          </p>

          <div class="flex items-center gap-3 mt-2 text-[10px] opacity-50 font-medium">
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 rounded-full" :style="{ background: repo.languageColor }"></div>
              {{ repo.language }}
            </div>
          </div>
        </a>
      </div>

    </div>
  </div>
</template>