<script setup lang="ts">
import {computed} from 'vue';
import type {SiteItem} from '../../../core/config/types.ts';
import {getWidgetMeta} from '../../../core/registry/widgets.ts';
import {useTileSizeContext} from '../../../core/tiles/context.ts';
import WidgetErrorBoundary from './WidgetErrorBoundary.vue';
import WidgetState from './WidgetState.vue';

const props = defineProps<{
  item: SiteItem;
  isEditMode: boolean;
}>();

/**   从 registry 获取组件（不再维护一份 widgetMap） */
const currentWidget = computed(() => {
  return getWidgetMeta(props.item.widgetType)?.component || null;
});
const tileSize = useTileSizeContext(() => ({
  w: Number(props.item.w || 1),
  h: Number(props.item.h || 1),
}));
const tileSizeVars = computed(() => ({
  '--runtime-tile-cols': String(tileSize.value.cols),
  '--runtime-tile-w': String(tileSize.value.placement.w),
  '--runtime-tile-h': String(tileSize.value.placement.h),
  '--runtime-tile-px-w': `${tileSize.value.width}px`,
  '--runtime-tile-px-h': `${tileSize.value.height}px`,
}));

const typeLabel = computed(() => props.item.widgetType?.toUpperCase() || 'WIDGET');
const widgetResetKey = computed(() => [
  props.item.id,
  props.item.widgetType,
  tileSize.value.profile,
  tileSize.value.placement.w,
  tileSize.value.placement.h,
].join(':'));
</script>
<template>
  <div
      class="widget-card w-full h-full relative overflow-hidden group min-w-0 min-h-0 select-none"
      :style="tileSizeVars"
      :data-tile-size-profile="tileSize.profile"
      :data-tile-size-breakpoint="tileSize.breakpoint"
      :data-tile-size-w="tileSize.placement.w"
      :data-tile-size-h="tileSize.placement.h"
  >
    <!--   唯一的玻璃层：默认不 blur，hover/edit 才 blur -->
    <div
        class="absolute inset-0 bg-white/5 border border-white/10 z-0 transition-opacity transition-[backdrop-filter]"
        :class="isEditMode
        ? 'opacity-100 backdrop-blur-md'
        : 'opacity-0 backdrop-blur-0 group-hover:opacity-100 group-hover:backdrop-blur-md'"
    />

    <div class="relative z-10 w-full h-full min-w-0 min-h-0 overflow-hidden">
      <WidgetErrorBoundary
          v-if="currentWidget"
          :reset-key="widgetResetKey"
          :title="`${item.title || typeLabel} 渲染失败`"
      >
        <Suspense>
          <component
              :is="currentWidget"
              :item="item"
              :is-edit-mode="isEditMode"
          />

          <template #fallback>
            <WidgetState type="loading" compact/>
          </template>
        </Suspense>
      </WidgetErrorBoundary>

      <WidgetState
          v-else
          type="empty"
          :title="typeLabel"
          description="该组件类型尚未注册或已被移除。"
          compact
      />
    </div>

    <div
        v-if="isEditMode"
        class="absolute inset-0 z-20 pointer-events-none border-2 widget-edit-ring"
    />
  </div>
</template>

<style scoped>
.widget-card {
  container-type: size;
  border-radius: var(--tile-radius, 18px);
  transform: scale(var(--tile-icon-scale, 1));
  transform-origin: center;
  border: 1px solid color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 18%, var(--widget-border));
  background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 16%, transparent), transparent 42%),
      linear-gradient(135deg, color-mix(in srgb, var(--tile-surface) 28%, transparent), transparent),
      var(--widget-surface);
  box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 calc(var(--tile-elevation, 1) * 8px) calc(var(--tile-elevation, 1) * 18px) rgba(15, 23, 42, 0.14);
}

.widget-edit-ring {
  border-radius: var(--tile-radius, 18px);
  border-color: var(--tile-accent-color, var(--accent-color));
  opacity: 0.36;
}
</style>
