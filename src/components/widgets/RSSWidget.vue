<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {PhRss, PhArrowSquareOut, PhTrash, PhPlus, PhSpinner, PhWarning} from '@phosphor-icons/vue';

const props = defineProps<{ settings: any }>();
const store = useConfigStore();

const activeFeedUrl = ref('');
const loading = ref(false);
const articles = ref<any[]>([]);
const errorMsg = ref('');

// 新增源状态
const showAddInput = ref(false);
const newFeedForm = ref({name: '', url: ''});

// 🛠️ 解析 RSS XML
const parseRSS = (text: string) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const items = Array.from(xml.querySelectorAll("item, entry"));

  return items.slice(0, 15).map(item => {
    const title = item.querySelector("title")?.textContent || "无标题";
    const link = item.querySelector("link")?.textContent || item.querySelector("link")?.getAttribute("href") || "#";
    const pubDate = item.querySelector("pubDate, published")?.textContent || "";
    const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : "";
    return {title, link, date: dateStr};
  });
};

// 🌍 获取 RSS 数据
const fetchFeed = async (url: string) => {
  activeFeedUrl.value = url;
  errorMsg.value = '';

  // 优先读取缓存
  if (store.rssCache[url]) {
    articles.value = store.rssCache[url];
    return;
  }

  loading.value = true;
  articles.value = [];

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsedItems = parseRSS(text);

    store.rssCache[url] = parsedItems;
    articles.value = parsedItems;
  } catch (e) {
    console.error(e);
    errorMsg.value = "无法加载 (可能是跨域限制)";
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => {
  if (newFeedForm.value.name && newFeedForm.value.url) {
    store.addRssFeed('rss', newFeedForm.value.name, newFeedForm.value.url);
    newFeedForm.value = {name: '', url: ''};
    showAddInput.value = false;
  }
};

const handleRemove = (url: string) => {
  if (confirm('确定删除该订阅源？')) {
    store.removeRssFeed('rss', url);
    if (activeFeedUrl.value === url) {
      activeFeedUrl.value = '';
      articles.value = [];
    }
  }
};

onMounted(() => {
  if (props.settings?.feeds?.length > 0) {
    fetchFeed(props.settings.feeds[0].url);
  }
});
</script>

<template>
  <div class="h-full flex font-sans text-gray-700 bg-white rounded-2xl overflow-hidden">

    <div class="w-[140px] md:w-[160px] bg-gray-50 flex flex-col border-r border-gray-100 shrink-0">
      <div class="p-3 border-b border-gray-100 flex justify-between items-center bg-white/50">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Feeds</span>
        <button @click="showAddInput = !showAddInput"
                class="p-1.5 hover:bg-gray-200 rounded-md text-gray-400 transition-colors">
          <PhPlus size="14" weight="bold"/>
        </button>
      </div>

      <div v-if="showAddInput" class="p-2 bg-white border-b border-gray-100 space-y-2 shadow-inner">
        <input v-model="newFeedForm.name" placeholder="名称"
               class="w-full text-xs p-2 border border-gray-200 rounded bg-gray-50 focus:bg-white outline-none focus:border-orange-400 transition-colors">
        <input v-model="newFeedForm.url" placeholder="URL"
               class="w-full text-xs p-2 border border-gray-200 rounded bg-gray-50 focus:bg-white outline-none focus:border-orange-400 transition-colors">
        <button @click="handleAdd"
                class="w-full bg-orange-500 text-white text-xs py-1.5 rounded font-bold hover:bg-orange-600 transition-colors">
          添加
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
        <div
            v-for="feed in settings?.feeds"
            :key="feed.url"
            @click="fetchFeed(feed.url)"
            class="group flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg text-xs font-medium transition-all"
            :class="activeFeedUrl === feed.url ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200/50'"
        >
          <div class="flex items-center gap-2 truncate">
            <PhRss size="14" :weight="activeFeedUrl === feed.url ? 'fill' : 'regular'"/>
            <span class="truncate">{{ feed.name }}</span>
          </div>
          <button @click.stop="handleRemove(feed.url)"
                  class="hidden group-hover:block text-gray-400 hover:text-red-500 transition-colors">
            <PhTrash size="12"/>
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col h-full bg-white relative">
      <div
          class="px-5 py-3 border-b border-gray-50 flex justify-between items-center bg-white/80 backdrop-blur shrink-0 z-10">
        <h3 class="font-bold text-sm text-gray-800 truncate">
          {{ settings?.feeds?.find((f: any) => f.url === activeFeedUrl)?.name || '选择订阅源' }}
        </h3>
        <div v-if="loading"
             class="flex items-center gap-1.5 text-xs text-orange-500 font-medium bg-orange-50 px-2 py-1 rounded-full">
          <PhSpinner class="animate-spin" size="12" weight="bold"/>
          <span>更新中</span>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scroll p-4 space-y-3">
        <div v-if="errorMsg" class="flex flex-col items-center justify-center py-10 text-gray-400 space-y-2">
          <PhWarning size="32" class="opacity-50"/>
          <span class="text-xs">{{ errorMsg }}</span>
        </div>

        <div v-else-if="articles.length === 0 && !loading"
             class="flex flex-col items-center justify-center py-12 text-gray-300 space-y-3">
          <PhRss size="48" weight="duotone" class="opacity-20"/>
          <span class="text-xs">暂无文章</span>
        </div>

        <a
            v-for="(article, idx) in articles"
            :key="idx"
            :href="article.link"
            target="_blank"
            class="block p-4 rounded-xl border border-gray-100 bg-white hover:border-orange-200 hover:bg-orange-50/40 hover:shadow-sm transition-all group relative overflow-hidden"
        >
          <div
              class="absolute left-0 top-0 bottom-0 w-[3px] bg-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div class="flex justify-between items-start gap-3">
            <h4 class="text-sm font-bold text-gray-700 group-hover:text-orange-700 leading-relaxed line-clamp-2">
              {{ article.title }}
            </h4>
            <PhArrowSquareOut size="16"
                              class="text-gray-300 group-hover:text-orange-400 shrink-0 mt-0.5 transition-colors"/>
          </div>
          <div class="mt-2 flex items-center gap-2 text-[11px] text-gray-400 font-medium">
            <span>{{ article.date }}</span>
          </div>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.custom-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
}
</style>