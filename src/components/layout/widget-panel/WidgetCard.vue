<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue';
import type {SiteItem} from '../../../core/config/types';

const props = defineProps<{
  item: SiteItem;
  isEditMode: boolean;
}>();


const ClockWidget = defineAsyncComponent(() => import('../widgets/ClockWidget.vue'));
const WeatherWidget = defineAsyncComponent(() => import('../widgets/WeatherWidget.vue'));
const CalendarWidget = defineAsyncComponent(() => import('../widgets/CalendarWidget.vue'));

const typeLabel = computed(() => props.item.widgetType?.toUpperCase() || 'WIDGET');
</script>

<template>
  <div class="widget-card w-full h-full relative overflow-hidden group rounded-[18px] select-none">

    <div class="absolute inset-0 bg-white/5 backdrop-blur-md border border-white/10 transition-colors z-0"
         :class="isEditMode ? 'bg-white/10' : 'group-hover:bg-white/10'">
    </div>

    <div class="relative z-10 w-full h-full text-white/90">

      <ClockWidget v-if="item.widgetType === 'clock'" :item="item" />

      <WeatherWidget v-else-if="item.widgetType === 'weather'" :item="item" />

      <CalendarWidget v-else-if="item.widgetType === 'calendar'" :item="item"/>

      <div v-else class="w-full h-full flex flex-col items-center justify-center">
        <div class="text-sm font-bold opacity-70 mb-1">{{ typeLabel }}</div>
        <div class="text-[10px] opacity-40 border border-white/20 px-2 py-1 rounded">
          未实现
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.widget-card {
  container-type: size;
}
</style>