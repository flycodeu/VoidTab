<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import * as PhIcons from '@phosphor-icons/vue';
import {PhGlobe, PhTrash, PhPencilSimple} from '@phosphor-icons/vue';

const store = useConfigStore();
const props = defineProps<{
  item: {
    id: string;
    title: string;
    url: string;
    iconType?: 'auto' | 'text' | 'icon';
    iconValue?: string;
    bgColor?: string;
  };
  isEditMode?: boolean;
}>();
const emit = defineEmits(['delete']);

const autoIconUrl = computed(() => {
  if (!props.item.url) return '';
  try {
    let u = props.item.url;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${new URL(u).hostname}&size=128`;
  } catch {
    return '';
  }
});
const PhosphorIcon = computed(() => {
  if (props.item.iconType === 'icon' && props.item.iconValue) return (PhIcons as any)['Ph' + props.item.iconValue.replace(/^Ph/, '')] || PhGlobe;
  return PhGlobe;
});
</script>

<template>
  <a :href="item.url" target="_blank" @click="isEditMode && $event.preventDefault()"
     class="group relative flex flex-col items-center gap-2 p-1 rounded-xl transition-all duration-300"
     :class="[isEditMode ? 'cursor-grab active:cursor-grabbing animate-shake' : 'hover:-translate-y-1 cursor-pointer']">

    <div
        class="site-icon-container flex items-center justify-center text-white shadow-lg overflow-hidden relative transition-all duration-300"
        :style="{
        backgroundColor: item.bgColor || '#3b82f6',
        width: Number(store.config.theme.iconSize) + 'px',
        height: Number(store.config.theme.iconSize) + 'px',
        borderRadius: store.config.theme.radius + 'px'
      }">
      <img v-if="item.iconType === 'auto' || !item.iconType" :src="autoIconUrl"
           class="w-full h-full object-cover bg-white" onerror="this.style.display='none'"/>
      <PhGlobe v-if="(item.iconType === 'auto' || !item.iconType) && !autoIconUrl"
               :size="Number(store.config.theme.iconSize) * 0.5" weight="duotone" class="absolute"/>
      <span v-else-if="item.iconType === 'text'" class="font-bold"
            :style="{ fontSize: (Number(store.config.theme.iconSize) * 0.45) + 'px' }">{{
          item.iconValue ? item.iconValue[0] : item.title[0]
        }}</span>
      <component v-else :is="PhosphorIcon" :size="Number(store.config.theme.iconSize) * 0.5" weight="fill"/>
      <div v-if="isEditMode"
           class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
        <PhPencilSimple size="24" class="text-white drop-shadow-md"/>
      </div>
    </div>

    <span v-if="store.config.theme.showIconName"
          class="font-medium opacity-80 group-hover:opacity-100 transition-opacity truncate text-center leading-tight"
          :style="{ width: (Number(store.config.theme.iconSize) + 16) + 'px', fontSize: store.config.theme.iconTextSize + 'px', color: 'var(--text-primary)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }">
      {{ item.title }}
    </span>
    <button v-if="isEditMode" @click.prevent.stop="$emit('delete')"
            class="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 hover:scale-110 transition-all z-20">
      <PhTrash size="12" weight="bold"/>
    </button>
  </a>
</template>

<style scoped>
@keyframes shake {
  0% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(1deg);
  }
  50% {
    transform: rotate(0deg);
  }
  75% {
    transform: rotate(-1deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.animate-shake {
  animation: shake 0.3s infinite ease-in-out;
}
</style>