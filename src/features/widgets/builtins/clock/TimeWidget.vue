<script setup lang="ts">
import { useNow, useDateFormat } from '@vueuse/core';
import { useConfigStore } from '../../../../stores/useConfigStore.ts';

const store = useConfigStore();
const now = useNow();
const timeStr = useDateFormat(now, 'HH:mm');
const dateStr = useDateFormat(now, 'MM月DD日 dddd');
</script>

<template>
  <div v-if="store.config.theme.showTime" class="text-center select-none mb-3 z-30 transition-all">
    <h1 class="text-7xl md:text-8xl font-bold tracking-tight drop-shadow-2xl" :class="{ 'font-tech': store.config.theme.techFont }" style="font-feature-settings: 'tnum';">{{ timeStr }}</h1>
    <p class="text-base md:text-lg font-medium opacity-80 mt-1 uppercase tracking-widest">{{ dateStr }}</p>
  </div>
</template>