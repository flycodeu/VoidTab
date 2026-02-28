<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import type {SiteItem} from '../../../../core/config/types.ts';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {idbGetBlob} from '../../../../core/storage/photoIdb';
import SiteListModal from './SiteListModal.vue';
import {PhGear, PhFolderNotch, PhArrowUpRight} from '@phosphor-icons/vue';
import {resolveAndCacheSiteIcon} from '../../../../shared/utils/siteIconCache.ts';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const store = useConfigStore();
const showModal = ref(false);

const widgetId = computed(() => String(props.item.id));

// --- 1. 甯冨眬鎰熺煡 (淇绫诲瀷涓㈠け闂) ---
const layout = computed(() => {
  const w = props.item?.w ?? 2;
  const h = props.item?.h ?? 2;
  return {
    isMini: w === 1 && h === 1,          // 1x1
    isSlim: w === 1 && h >= 2,           // 1x2 (绔栨潯)
    isWide: w >= 2 && h === 1,           // 2x1 (妯潯)
    isStandard: w === 2 && h === 2,      // 2x2 (鏍囧噯)
    isLarge: w >= 2 && h > 2             // 2x4 (澶у睆)
  };
});

// --- 2. 鏁版嵁缁戝畾 ---
const runtime = store.config.runtime;
if (!runtime.siteList) runtime.siteList = {groups: {}, widgets: {}};
if (!runtime.siteList.widgets[widgetId.value]) {
  const firstGrp = Object.keys(runtime.siteList.groups)[0];
  runtime.siteList.widgets[widgetId.value] = {groupId: firstGrp || '', defaultSiteId: undefined};
}

const widgetRef = computed(() => runtime.siteList.widgets[widgetId.value]);
const activeGroup = computed(() => runtime.siteList.groups[widgetRef.value.groupId]);

const defaultSite = computed(() => {
  const sid = widgetRef.value.defaultSiteId;
  if (!sid || !activeGroup.value) return null;
  return activeGroup.value.items.find(i => i.id === sid) || null;
});

// 鏄剧ず閰嶇疆
const view = computed(() => activeGroup.value?.viewConfig || {showIcon: true, showTitle: true, showDesc: true});

// --- 3. 瑙嗚椋庢牸寮曟搸 (鍏ㄩ€忔槑 & 鎮诞鏂囧瓧) ---
const styleEngine = computed(() => {
  const style = activeGroup.value?.style || 'glass';

  const map: Record<string, any> = {
    glass: {
      // 榛樿鍏ㄩ€忔槑锛孒over 鏃舵樉绀烘瀬娣＄殑鐧借壊
      wrapper: 'hover:bg-white/10 transition-colors duration-300',
      // 鍥炬爣鑷甫闃村奖鍜屽井寮辫竟妗嗭紝澧炲姞绔嬩綋鎰?
      iconBox: 'shadow-2xl shadow-black/20 ring-1 ring-white/10 bg-white/5 backdrop-blur-sm',
      // 鏂囧瓧甯﹀己闃村奖锛屼繚璇佸湪浠讳綍澹佺焊涓婂彲瑙?
      textMain: 'text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]',
      textSub: 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
      folderBg: 'bg-black/20 border border-white/10 backdrop-blur-md',
      folderItem: 'bg-white/10 text-white'
    },
    dark: {
      wrapper: 'bg-black/40 border border-white/5 backdrop-blur-md',
      iconBox: 'bg-[#151515] border border-[#333] text-gray-200',
      textMain: 'text-gray-200 font-bold drop-shadow-md',
      textSub: 'text-gray-400',
      folderBg: 'bg-black/50 border border-white/10',
      folderItem: 'bg-white/10 text-gray-300'
    },
    neon: {
      wrapper: 'hover:bg-purple-900/20 border border-transparent hover:border-purple-500/30',
      iconBox: 'bg-black/80 border border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]',
      textMain: 'text-purple-100 font-bold drop-shadow-[0_0_5px_rgba(168,85,247,1)]',
      textSub: 'text-purple-200',
      folderBg: 'bg-purple-900/20 border border-purple-500/20',
      folderItem: 'bg-purple-500/20 text-purple-300'
    },
    cyber: {
      wrapper: 'bg-zinc-900/80 border border-cyan-500/30',
      iconBox: 'bg-cyan-950/80 border border-cyan-400 text-cyan-400 rounded-sm',
      textMain: 'text-cyan-100 font-mono drop-shadow-md',
      textSub: 'text-cyan-400 font-mono text-[9px]',
      folderBg: 'bg-black/80 border border-cyan-900',
      folderItem: 'bg-cyan-900/40 text-cyan-400 rounded-sm'
    },
    minimal: {
      wrapper: 'hover:bg-white/5',
      iconBox: 'bg-transparent text-white/90 border-0',
      textMain: 'text-white font-medium drop-shadow-md',
      textSub: 'text-white/60 drop-shadow-sm',
      folderBg: 'bg-white/5 border border-white/5',
      folderItem: 'bg-white/10'
    },
    gradient: {
      wrapper: 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 backdrop-blur-md',
      iconBox: 'bg-gradient-to-br from-white/20 to-white/5 border border-white/20 text-white shadow-xl',
      textMain: 'text-white font-bold drop-shadow-md',
      textSub: 'text-blue-100',
      folderBg: 'bg-black/10 border border-white/10',
      folderItem: 'bg-white/20 text-white'
    }
  };
  return map[style] || map.glass;
});

// --- 鍥炬爣鍔犺浇 ---
const iconUrl = ref('');
const blobCache = ref<Record<string, string>>({});
const ownedObjectUrls = new Set<string>();

const rememberObjectUrl = (url: string) => {
  if (url.startsWith('blob:')) ownedObjectUrls.add(url);
};

const getIconSrc = async (item: any) => {
  if (item.iconType === 'text') return null;
  if (item.iconType === 'image') return item.iconValue;
  if (item.iconType === 'upload') {
    if (blobCache.value[item.iconValue]) return blobCache.value[item.iconValue];
    const blob = await idbGetBlob(item.iconValue);
    if (blob) {
      const url = URL.createObjectURL(blob);
      blobCache.value[item.iconValue] = url;
      rememberObjectUrl(url);
      return url;
    }
  }
  if (item.iconType === 'auto' && item.url) {
    const key = `auto:${item.url}`;
    if (blobCache.value[key]) return blobCache.value[key];
    const resolved = await resolveAndCacheSiteIcon(item.url, store.config.runtime);
    if (resolved?.url) {
      blobCache.value[key] = resolved.url;
      if (resolved.objectUrl) rememberObjectUrl(resolved.url);
      return resolved.url;
    }
  }
  return null;
};

watch(() => defaultSite.value, async (site) => {
  if (site) iconUrl.value = await getIconSrc(site) || '';
  else iconUrl.value = '';
}, {immediate: true, deep: true});

// 鏂囦欢澶归瑙?
const folderIcons = ref<{ type: 'img' | 'text', val: string }[]>([]);
watch(() => activeGroup.value?.items, async (items) => {
  if (!items) {
    folderIcons.value = [];
    return;
  }
  const limited = items.slice(0, 9);
  const promises = limited.map(async i => {
    if (i.iconType === 'text') return {type: 'text', val: i.iconValue};
    const src = await getIconSrc(i);
    return src ? {type: 'img', val: src} : {type: 'text', val: '?'};
  });
  folderIcons.value = (await Promise.all(promises)) as any;
}, {immediate: true, deep: true});

const handleClick = (e: MouseEvent) => {
  if (props.isEditMode || e.shiftKey) {
    showModal.value = true;
    return;
  }
  if (defaultSite.value) window.open(defaultSite.value.url, '_blank');
  else showModal.value = true;
};

onUnmounted(() => {
  for (const url of ownedObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // noop
    }
  }
  ownedObjectUrls.clear();
});
</script>

<template>
  <div class="w-full h-full relative group rounded-[22px] transition-all duration-300"
       :class="styleEngine.wrapper"
       @click.stop="handleClick">

    <div v-if="defaultSite"
         class="w-full h-full relative flex items-center justify-center p-0 overflow-hidden rounded-[22px]">

      <div v-if="view.showIcon"
           class="flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105 z-10"
           :class="[
             iconUrl ? 'bg-transparent border-0 ring-0 shadow-none backdrop-blur-0 p-0' : styleEngine.iconBox,
             activeGroup?.style === 'cyber' ? 'rounded-md' : 'rounded-[20px]',
             // 灏哄閫傞厤閫昏緫
             layout.isMini ? 'w-[85%] h-[85%] text-2xl' :
             layout.isSlim ? 'w-[70%] aspect-square text-3xl mb-6' :
             layout.isWide ? 'h-[75%] aspect-square text-4xl mr-auto ml-4' :
             layout.isStandard ? 'w-[65%] aspect-square text-5xl mb-6' :
             layout.isLarge ? 'h-[60%] aspect-square text-6xl mb-8' : ''
           ]">

        <img v-if="iconUrl" :src="iconUrl" class="w-full h-full object-cover"/>
        <span v-else class="font-bold uppercase tracking-wider flex items-center justify-center h-full w-full">
          {{ defaultSite.iconValue }}
        </span>

        <div v-if="defaultSite.enableFx"
             class="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_currentColor] z-20"></div>
      </div>

      <div v-if="(view.showTitle || view.showDesc) && !layout.isMini"
           class="absolute bottom-0 left-0 right-0 z-20 p-3 flex flex-col justify-end text-center pointer-events-none"
           :class="layout.isWide ? 'items-start text-left pl-[45%] justify-center h-full bottom-auto' : 'bg-gradient-to-t from-black/60 via-black/20 to-transparent pt-8'">

        <div v-if="view.showTitle" class="truncate leading-tight px-1"
             :class="[styleEngine.textMain, layout.isLarge ? 'text-lg' : 'text-sm']">
          {{ defaultSite.title }}
        </div>

        <div v-if="view.showDesc" class="truncate max-w-full px-1 mt-0.5"
             :class="[styleEngine.textSub, layout.isLarge ? 'text-xs' : 'text-[10px]']">
          {{ defaultSite.desc }}
        </div>
      </div>

      <div
          class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition duration-300 scale-90 group-hover:scale-100 z-30">
        <PhArrowUpRight weight="bold" class="text-white drop-shadow-md" size="16"/>
      </div>
    </div>

    <div v-else class="w-full h-full relative p-3 flex flex-col cursor-pointer">
      <div class="flex-1 w-full rounded-2xl p-2 grid gap-2 content-start overflow-hidden transition-colors"
           :class="[
               styleEngine.folderBg,
               layout.isMini ? 'grid-cols-2' : 'grid-cols-3'
            ]">
        <div v-for="(icon, idx) in folderIcons" :key="idx"
             class="aspect-square flex items-center justify-center overflow-hidden transition-transform hover:scale-105"
             :class="[
                 icon.type === 'img' ? 'bg-transparent border-0 ring-0 shadow-none p-0' : styleEngine.folderItem,
                 activeGroup?.style === 'cyber' ? 'rounded-sm' : 'rounded-xl'
               ]">
          <img v-if="icon.type === 'img'" :src="icon.val" class="w-full h-full object-cover"/>
          <span v-else class="text-[10px] font-bold scale-90 opacity-80">{{ icon.val }}</span>
        </div>

        <div v-if="folderIcons.length === 0"
             class="col-span-3 h-full flex flex-col items-center justify-center opacity-30 gap-1">
          <PhFolderNotch size="28" :class="styleEngine.textMain"/>
          <span class="text-[10px]" :class="styleEngine.textSub">EMPTY</span>
        </div>
      </div>

      <div class="mt-2 flex justify-between items-center px-1 h-4">
        <span class="text-xs font-bold truncate max-w-[70%]" :class="styleEngine.textMain">{{
            activeGroup?.name
          }}</span>
        <span class="text-[10px] font-mono opacity-80" :class="styleEngine.textMain">{{
            activeGroup?.items.length
          }}</span>
      </div>
    </div>

    <button @click.stop="showModal = true"
            class="absolute top-2 right-2 p-2 rounded-full opacity-0 group-hover:opacity-100 bg-black/40 text-white hover:bg-black/70 hover:scale-110 transition-all duration-200 z-50 backdrop-blur-md shadow-lg border border-white/10"
            title="璁剧疆">
      <PhGear weight="fill" size="16"/>
    </button>

    <Teleport to="body">
      <SiteListModal :show="showModal" :widget-id="widgetId" @close="showModal = false"/>
    </Teleport>
  </div>
</template>
