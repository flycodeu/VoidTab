<script setup lang="ts">
import {ref, watch} from 'vue';
import {
  PhX, PhStar, PhGithubLogo, PhArrowSquareOut,
  PhGitFork, PhSpinner, PhArrowsClockwise
} from '@phosphor-icons/vue';
// 1. 引入统一存储工具
import {tempStorage} from '../../../../core/storage/tempStorage';
import {fetchJsonWithRetry} from '../../../../shared/utils/network';
import {useToast} from '../../../../shared/composables/useToast';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{ show: boolean; initialTrends: any[] }>();
const emit = defineEmits(['close', 'refresh']);
const toast = useToast();
useEscapeClose(() => props.show, () => emit('close'));

const currentTrends = ref(props.initialTrends);
const isLocalLoading = ref(false);

const selectedLang = ref('');
const sortBy = ref('stars');
const languages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java'];
type GitHubSearchResponse = {items?: any[]};

// 弹窗内的筛选逻辑
const applyFilter = async () => {
  isLocalLoading.value = true;
  let q = 'created:>2025-12-01';
  if (selectedLang.value) q += ` language:${selectedLang.value}`;

  try {
    const params = new URLSearchParams({
      q,
      sort: sortBy.value,
      order: 'desc',
      per_page: '20',
    });
    const cache = tempStorage.get('github');
    const data = await fetchJsonWithRetry<GitHubSearchResponse>(
        `https://api.github.com/search/repositories?${params.toString()}`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
          },
        },
        {
          timeoutMs: 10000,
          retries: 2,
          retryDelayMs: 600,
          maxRetryDelayMs: 5000,
          metricName: 'github.trending.filter',
          fallbackName: 'github.trending.filter.cache',
          fallbackData: () => {
            const fallbackItems = currentTrends.value.length
                ? currentTrends.value
                : cache?.data || props.initialTrends;
            return fallbackItems?.length ? {items: fallbackItems} : undefined;
          },
        }
    );
    currentTrends.value = data.items || [];
  } catch {
    toast.error('筛选 GitHub 趋势失败，请稍后重试');
  } finally {
    isLocalLoading.value = false;
  }
};

const handleRefresh = () => {
  isLocalLoading.value = true;
  emit('refresh'); // 触发父组件更新缓存
  // 模拟同步刷新，等待父组件写完缓存
  setTimeout(() => {
    // 2. 从统一存储读取最新数据
    const cache = tempStorage.get('github');
    if (cache && cache.data) {
      currentTrends.value = cache.data;
    }
    isLocalLoading.value = false;
  }, 1000);
};

watch([selectedLang, sortBy], () => applyFilter());
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4 lg:p-10">
      <div class="settings-mask absolute inset-0" @click="emit('close')"></div>

      <div class="settings-shell relative w-full max-w-[980px] h-[80vh] rounded-[32px] overflow-hidden flex flex-col">
        <div class="settings-header p-6 md:p-8 shrink-0">
          <div class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-4 min-w-0">
              <div class="settings-logo p-3.5 rounded-2xl shrink-0">
                <PhGithubLogo size="28" weight="fill"/>
              </div>
              <div class="min-w-0">
                <h3 class="text-xl md:text-2xl font-bold tracking-tight settings-text truncate">
                  GitHub Trending
                </h3>
                <p class="text-xs settings-muted font-bold uppercase tracking-widest mt-1 truncate">
                  发现全球最受关注的开源项目
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 md:gap-3">
              <button
                  @click="handleRefresh"
                  class="settings-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
              >
                <PhArrowsClockwise :class="{ 'animate-spin': isLocalLoading }" size="16"/>
                获取最新
              </button>

              <button @click="emit('close')" class="settings-close p-2.5 rounded-full">
                <PhX size="22"/>
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 md:gap-6">
            <div class="flex items-center gap-3">
              <label class="text-[10px] font-black settings-accent uppercase tracking-widest">语言类型</label>
              <select v-model="selectedLang" class="settings-select">
                <option value="">所有语言</option>
                <option v-for="l in languages" :key="l" :value="l">{{ l }}</option>
              </select>
            </div>

            <div class="flex items-center gap-3">
              <label class="text-[10px] font-black settings-accent uppercase tracking-widest">排序方式</label>
              <select v-model="sortBy" class="settings-select">
                <option value="stars">Stars 增长</option>
                <option value="updated">最近更新</option>
              </select>
            </div>
          </div>
        </div>

        <div class="settings-body flex-1 overflow-y-auto p-5 md:p-8 space-y-4 custom-scroll relative">
          <div
              v-if="isLocalLoading"
              class="absolute inset-0 z-20 flex items-center justify-center settings-loading"
          >
            <PhSpinner size="40" class="animate-spin settings-accent"/>
          </div>

          <a
              v-for="(repo, index) in currentTrends"
              :key="repo.id"
              :href="repo.html_url"
              target="_blank"
              class="repo-card group flex items-start gap-5 md:gap-6 p-5 md:p-6 rounded-[24px]"
          >
            <div class="repo-rank text-3xl font-black tabular-nums w-12 pt-1 shrink-0">
              {{ index + 1 }}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-2 min-w-0">
                <h4 class="repo-title text-lg md:text-xl font-bold truncate">
                  {{ repo.full_name }}
                </h4>
                <PhArrowSquareOut size="16" class="repo-out opacity-0 group-hover:opacity-40"/>
              </div>

              <p class="repo-desc text-sm leading-relaxed mb-5 line-clamp-2">
                {{ repo.description || '该项目暂无描述' }}
              </p>

              <div
                  class="repo-meta flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-widest">
                <div class="flex items-center gap-2">
                  <PhStar weight="fill" size="16" class="text-amber-400"/>
                  {{ repo.stargazers_count }}
                </div>

                <div class="flex items-center gap-2">
                  <PhGitFork size="16"/>
                  {{ repo.forks_count }}
                </div>

                <div class="flex items-center gap-2">
                  <span class="lang-dot w-2 h-2 rounded-full"></span>
                  {{ repo.language || 'Unknown' }}
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
/* 保持原有样式不变 */
:global(html.light) .settings-shell {
  background: rgba(245, 246, 248, 0.92);
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.10);
}

:global(html.light) .settings-header {
  background: rgba(0, 0, 0, 0.02);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:global(html.light) .settings-text {
  color: #111827;
}

:global(html.light) .settings-muted {
  color: rgba(17, 24, 39, 0.62);
}

:global(html.light) .settings-close {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(17, 24, 39, 0.55);
}

:global(html.light) .settings-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(17, 24, 39, 0.85);
}

:global(html.light) .settings-select {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(0, 0, 0, 0.08);
  color: #111827;
}

:global(html.light) .settings-select:hover {
  background: rgba(255, 255, 255, 0.92);
}

:global(html.light) .settings-select:focus {
  border-color: rgba(var(--accent-color-rgb), 0.35);
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

:global(html.light) .settings-select option {
  background: #ffffff;
  color: #111827;
}

:global(html.light) .settings-body {
  background: rgba(0, 0, 0, 0.015);
}

:global(html.light) .repo-card {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

:global(html.light) .repo-card:hover {
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(var(--accent-color-rgb), 0.22);
}

:global(html.light) .repo-rank {
  color: rgba(0, 0, 0, 0.08);
}

:global(html.light) .repo-title {
  color: #0f172a;
}

:global(html.light) .repo-desc {
  color: rgba(15, 23, 42, 0.62);
}

:global(html.light) .repo-meta {
  color: rgba(15, 23, 42, 0.50);
}

:global(html.light) .repo-out {
  color: rgba(15, 23, 42, 0.45);
}

:global(html.light) .lang-dot {
  background: rgba(var(--accent-color-rgb), 0.85);
  box-shadow: 0 0 0 6px rgba(var(--accent-color-rgb), 0.10);
}

:global(html.light) .settings-loading {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px) saturate(120%);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
}
</style>
