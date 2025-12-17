<script setup lang="ts">
import type { LinkItem } from '../../types';
import * as PhIcons from '@phosphor-icons/vue';
import { computed } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';

const props = defineProps<{ item: LinkItem }>();
const store = useConfigStore();

const IconComponent = computed(() => {
  if (!props.item || props.item.iconType === 'text') return null;
  const raw = props.item.iconValue || (props.item as any).icon || 'Globe';
  const iconName = String(raw).replace(/^Ph/, '');
  // @ts-ignore
  return PhIcons['Ph' + iconName] || PhIcons['PhGlobe'];
});

const textIcon = computed(() => {
  if (!props.item) return '';
  if (props.item.iconType === 'text') {
    const val = props.item.iconValue || props.item.title || 'A';
    return String(val).substring(0, 1);
  }
  return '';
});

const bgColor = computed(() => props.item?.bgColor || '#3b82f6');
const openUrl = () => { if (!props.item?.url) return; window.open(props.item.url.startsWith('http') ? props.item.url : 'https://' + props.item.url, '_blank'); };
</script>

<template>
  <div class="flex flex-col items-center gap-2 group cursor-pointer transition-transform hover:-translate-y-1" @click="openUrl">
    <div class="relative flex items-center justify-center shadow-lg transition-all duration-300 group-hover:shadow-2xl group-hover:brightness-110"
         :style="{
        width: store.config.theme.iconSize + 'px',
        height: store.config.theme.iconSize + 'px',
        borderRadius: store.config.theme.radius + 'px',
        backgroundColor: bgColor
      }">
      <span v-if="item?.iconType === 'text'" class="text-white font-bold select-none" :style="{ fontSize: (store.config.theme.iconSize * 0.45) + 'px' }">{{ textIcon }}</span>
      <component v-else :is="IconComponent" :size="Number('32')" :style="{ fontSize: (store.config.theme.iconSize * 0.5) + 'px' }" weight="fill" class="text-white drop-shadow-md"/>
    </div>

    <span v-if="store.config.theme.showIconName"
          class="font-bold text-center leading-tight px-1 w-full truncate transition-colors"
          :style="{
            width: (store.config.theme.iconSize + 20) + 'px',
            fontSize: store.config.theme.iconTextSize + 'px',
            color: 'var(--text-primary)'
          }">
      {{ item?.title || '未命名' }}
    </span>
  </div>
</template>