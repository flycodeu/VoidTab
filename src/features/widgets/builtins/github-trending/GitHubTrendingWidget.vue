<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import {PhStar, PhSpinner, PhGithubLogo, PhClockClockwise} from '@phosphor-icons/vue';
import GithubTrendModal from './GithubTrendModal.vue';

const props = defineProps<{ item: SiteItem }>();
const trends = ref<any[]>([]);
const isLoading = ref(true);
const showModal = ref(false);

const CACHE_KEY = 'void_github_trends_data';
const TIMESTAMP_KEY = 'void_github_trends_ts';
const EXPIRE_TIME = 2 * 60 * 60 * 1000; // 2小时

// 获取数据逻辑：优先缓存，过期刷新
const fetchTrends = async (force = false) => {
  const now = Date.now();
  const cachedData = localStorage.getItem(CACHE_KEY);
  const lastTs = localStorage.getItem(TIMESTAMP_KEY);

  // 判定是否使用缓存
  if (!force && cachedData && lastTs && (now - parseInt(lastTs) < EXPIRE_TIME)) {
    trends.value = JSON.parse(cachedData);
    isLoading.value = false;
    return;
  }

  try {
    isLoading.value = true;
    // 默认查询最近一月的 Star 增长趋势
    const res = await fetch(`https://api.github.com/search/repositories?q=created:>2025-12-01&sort=stars&order=desc&per_page=15`);
    const data = await res.json();
    const items = data.items || [];

    trends.value = items;
    // 写入缓存
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
    localStorage.setItem(TIMESTAMP_KEY, now.toString());
  } catch (e) {
    console.error("GitHub API Error");
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => fetchTrends());

const layout = computed(() => {
  const w = props.item?.w ?? 2;
  const h = props.item?.h ?? 2;
  return {
    isMini: w === 1 && h === 1,
    isLarge: w >= 2 && h >= 2
  };
});
</script>

<template>
  <div
      class="w-full h-full relative flex flex-col bg-[#121212] rounded-[22px] text-white overflow-hidden cursor-pointer border border-white/10 hover:border-blue-500/40 transition-all group shadow-2xl"
      @click="showModal = true"
  >
    <div v-if="!layout.isMini"
         class="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/5">
      <div class="flex items-center gap-2">
        <PhGithubLogo size="16" weight="fill" class="text-blue-400"/>
        <span class="text-[10px] font-bold tracking-widest text-white/60 uppercase">Trending</span>
      </div>
      <PhClockClockwise v-if="isLoading" size="12" class="animate-spin text-white/30"/>
    </div>

    <div class="flex-1 p-3 overflow-hidden flex flex-col justify-center">
      <div v-if="isLoading && trends.length === 0" class="flex justify-center">
        <PhSpinner size="20" class="animate-spin text-blue-500"/>
      </div>

      <div v-else-if="layout.isMini" class="flex items-center justify-center">
        <PhGithubLogo size="28" class="text-white/20 group-hover:text-white/60 transition-all"/>
      </div>

      <div v-else class="space-y-2">
        <div v-for="repo in trends.slice(0, layout.isLarge ? 3 : 1)" :key="repo.id"
             class="p-2 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center group/item hover:bg-white/10 transition-colors">
          <span
              class="text-xs font-bold truncate max-w-[120px] text-white/90 group-hover/item:text-blue-400 transition-colors">
            {{ repo.name }}
          </span>
          <div class="flex items-center gap-1 text-[10px] font-mono text-amber-400 shrink-0">
            <PhStar weight="fill" size="10"/>
            {{ repo.stargazers_count > 1000 ? (repo.stargazers_count / 1000).toFixed(1) + 'k' : repo.stargazers_count }}
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <GithubTrendModal
          v-if="showModal"
          :show="showModal"
          :initialTrends="trends"
          @close="showModal = false"
          @refresh="() => fetchTrends(true)"
      />
    </Teleport>
  </div>
</template>