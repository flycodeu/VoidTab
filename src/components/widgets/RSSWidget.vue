<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import { PhRss, PhArrowSquareOut, PhTrash, PhPlus, PhSpinner } from '@phosphor-icons/vue';

const props = defineProps<{ settings: any }>(); // settings 包含 feeds 数组
const store = useConfigStore();

const activeFeedUrl = ref('');
const loading = ref(false);
const articles = ref<any[]>([]);
const errorMsg = ref('');

// 新增源的输入框
const showAddInput = ref(false);
const newFeedForm = ref({ name: '', url: '' });

// 🛠️ 核心：原生解析 RSS (无需第三方库)
const parseRSS = (text: string) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const items = Array.from(xml.querySelectorAll("item, entry")); // 兼容 RSS 和 Atom

  return items.slice(0, 15).map(item => { // 只取前 15 条，减少渲染压力
    const title = item.querySelector("title")?.textContent || "无标题";
    const link = item.querySelector("link")?.textContent || item.querySelector("link")?.getAttribute("href") || "#";
    // 简单处理日期
    const pubDate = item.querySelector("pubDate, published")?.textContent || "";
    const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : "";

    return { title, link, date: dateStr };
  });
};

// 🌍 获取数据
const fetchFeed = async (url: string) => {
  activeFeedUrl.value = url;
  errorMsg.value = '';

  // 1. 检查缓存 (避免重复请求)
  if (store.rssCache[url]) {
    articles.value = store.rssCache[url];
    return;
  }

  loading.value = true;
  articles.value = [];

  try {
    // ⚠️ 注意：如果是浏览器环境，这里会有 CORS 问题。
    // 如果是 Chrome 插件环境，需要在 manifest.json 添加 host_permissions
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsedItems = parseRSS(text);

    // 写入缓存
    store.rssCache[url] = parsedItems;
    articles.value = parsedItems;
  } catch (e) {
    console.error(e);
    errorMsg.value = "获取失败 (CORS 或 网络错误)";
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => {
  if (newFeedForm.value.name && newFeedForm.value.url) {
    store.addRssFeed('rss', newFeedForm.value.name, newFeedForm.value.url);
    newFeedForm.value = { name: '', url: '' };
    showAddInput.value = false;
  }
};

const handleRemove = (url: string) => {
  if(confirm('确定删除该订阅源？')) {
    store.removeRssFeed('rss', url);
    if (activeFeedUrl.value === url) {
      activeFeedUrl.value = '';
      articles.value = [];
    }
  }
};

// 初始化：默认选中第一个
onMounted(() => {
  if (props.settings?.feeds?.length > 0) {
    fetchFeed(props.settings.feeds[0].url);
  }
});
</script>

<template>
  <div class="h-full flex font-sans text-gray-700 overflow-hidden">

    <div class="w-1/3 min-w-[120px] max-w-[180px] bg-gray-50/50 border-r border-gray-100 flex flex-col">
      <div class="p-3 border-b border-gray-100 flex justify-between items-center">
        <span class="text-xs font-bold opacity-60">订阅源</span>
        <button @click="showAddInput = !showAddInput" class="p-1 hover:bg-gray-200 rounded text-gray-500">
          <PhPlus size="14" weight="bold"/>
        </button>
      </div>

      <div v-if="showAddInput" class="p-2 bg-white border-b border-gray-100 space-y-2">
        <input v-model="newFeedForm.name" placeholder="名称" class="w-full text-xs p-1 border rounded bg-gray-50 outline-none focus:border-orange-400">
        <input v-model="newFeedForm.url" placeholder="URL" class="w-full text-xs p-1 border rounded bg-gray-50 outline-none focus:border-orange-400">
        <button @click="handleAdd" class="w-full bg-orange-500 text-white text-xs py-1 rounded hover:bg-orange-600">添加</button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scroll">
        <div
            v-for="feed in settings?.feeds"
            :key="feed.url"
            @click="fetchFeed(feed.url)"
            class="group flex items-center justify-between px-3 py-2.5 cursor-pointer text-xs font-medium transition-colors border-l-2"
            :class="activeFeedUrl === feed.url ? 'bg-orange-50 text-orange-600 border-orange-500' : 'border-transparent hover:bg-gray-100 text-gray-600'"
        >
          <div class="flex items-center gap-2 truncate">
            <PhRss size="14" :weight="activeFeedUrl === feed.url ? 'fill' : 'regular'"/>
            <span class="truncate">{{ feed.name }}</span>
          </div>
          <button @click.stop="handleRemove(feed.url)" class="hidden group-hover:block text-gray-400 hover:text-red-500">
            <PhTrash size="12"/>
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col bg-white h-full overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-50 flex justify-between items-center shrink-0 h-[45px]">
        <h3 class="font-bold text-sm truncate max-w-[200px]">{{ settings?.feeds?.find((f:any) => f.url === activeFeedUrl)?.name || 'RSS 阅读器' }}</h3>
        <span v-if="loading" class="flex items-center gap-1 text-xs text-orange-500 font-medium">
          <PhSpinner class="animate-spin" size="14"/> 更新中...
        </span>
      </div>

      <div class="flex-1 overflow-y-auto custom-scroll p-4 space-y-3">

        <div v-if="errorMsg" class="text-center py-10 text-xs text-red-400">
          {{ errorMsg }}
          <div class="mt-2 opacity-60">请检查网络或是否安装了允许跨域的插件</div>
        </div>

        <div v-else-if="articles.length === 0 && !loading" class="text-center py-10 text-xs text-gray-400">
          暂无文章或未选择订阅源
        </div>

        <a
            v-for="(article, idx) in articles"
            :key="idx"
            :href="article.link"
            target="_blank"
            class="block p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all group"
        >
          <div class="flex justify-between items-start gap-2">
            <h4 class="text-xs font-bold text-gray-700 group-hover:text-orange-600 leading-relaxed line-clamp-2">
              {{ article.title }}
            </h4>
            <PhArrowSquareOut size="14" class="text-gray-300 group-hover:text-orange-400 shrink-0 mt-0.5"/>
          </div>
          <div class="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
            <span>{{ article.date }}</span>
          </div>
        </a>
      </div>
    </div>

  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
.custom-scroll:hover::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); }
</style>