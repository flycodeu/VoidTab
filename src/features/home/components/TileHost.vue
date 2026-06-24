<script setup lang="ts">
import {computed} from 'vue';
import type {BookmarkDensity} from '../../../core/config/types.ts';
import type {TileInstance} from '../../../core/tiles/contracts.ts';
import {resolveTileDefinition} from '../../../core/tiles/registry.ts';
import {tileStyleOverrideToCssVars} from '../../../core/tiles/style.ts';
import {toLegacyTileHostItem} from '../../../core/tiles/tileHostAdapter.ts';
import WidgetCard from '../../widgets/components/WidgetCard.vue';
import GlassCard from './GlassCard.vue';

const props = defineProps<{
  /** Canonical runtime tile; child cards receive only the adapter projection. */
  tile: TileInstance;
  isEditMode: boolean;
  density?: BookmarkDensity;
  cardSpanW: number;
  cardSpanH: number;
  priority?: 'high' | 'low';
  showWidgetName: boolean;
}>();

const emit = defineEmits<{
  (event: 'contextmenu', value: MouseEvent): void;
  (event: 'site-pointerdown', value: PointerEvent): void;
  (event: 'site-pointermove', value: PointerEvent): void;
  (event: 'site-pointerup', value: PointerEvent): void;
  (event: 'site-pointercancel', value: PointerEvent): void;
  (event: 'site-pointerleave', value: PointerEvent): void;
  (event: 'site-click-capture', value: MouseEvent): void;
}>();

const renderItem = computed(() => toLegacyTileHostItem(props.tile));
const tileType = computed(() => props.tile.tileType);
const definition = computed(() => resolveTileDefinition(tileType.value));
const isWidget = computed(() => definition.value.renderer.kind === 'widget');
const isUnsupported = computed(() => definition.value.renderer.kind === 'unsupported');
const tileStyleVars = computed(() => tileStyleOverrideToCssVars(props.tile.styleOverride));
const widgetNameMode = computed(() => {
  if (!props.showWidgetName || !isWidget.value) return 'none';
  return Math.max(1, Number(renderItem.value.h || 1)) === 1 ? 'overlay' : 'below';
});
</script>

<template>
  <div
      class="tile-host w-full h-full min-w-0 min-h-0"
      :style="tileStyleVars"
      :data-tile-type="tileType"
      :data-tile-renderer="definition.renderer.kind"
      :data-tile-density="tile.styleOverride?.density"
  >
    <div
        v-if="isWidget"
        class="widget-host-shell w-full h-full overflow-hidden"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <WidgetCard :item="renderItem" :isEditMode="isEditMode"/>

      <div
          v-if="widgetNameMode === 'overlay'"
          class="absolute left-2 right-2 bottom-2 flex justify-center pointer-events-none z-10"
      >
        <div class="widget-name-pill max-w-full truncate">
          {{ renderItem.title || definition.label }}
        </div>
      </div>
    </div>

    <div
        v-else-if="isUnsupported"
        class="unsupported-tile w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center"
        role="status"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <strong class="text-sm truncate max-w-full">{{ definition.label }}</strong>
      <span class="text-xs opacity-70">外部组件运行时尚未启用，数据已保留。</span>
    </div>

    <div
        v-else
        class="w-full h-full flex flex-col items-center justify-start"
        @pointerdown="emit('site-pointerdown', $event)"
        @pointermove="emit('site-pointermove', $event)"
        @pointerup="emit('site-pointerup', $event)"
        @pointercancel="emit('site-pointercancel', $event)"
        @pointerleave="emit('site-pointerleave', $event)"
        @click.capture="emit('site-click-capture', $event)"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <GlassCard
          :item="renderItem"
          :isEditMode="isEditMode"
          :density="density"
          :cardSpanW="cardSpanW"
          :cardSpanH="cardSpanH"
          :priority="priority"
      />
    </div>
  </div>
</template>

<style scoped>
.widget-name-pill {
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  background: rgba(var(--overlay-rgb), 0.25);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  color: var(--text-primary);
}

.tile-host {
  --tile-radius: 18px;
  --tile-icon-scale: 1;
  --tile-elevation: 1;
  --tile-accent: var(--accent-color);
  --tile-accent-color: var(--accent-color);
  --tile-surface: transparent;
}

.widget-host-shell {
  border-radius: var(--tile-radius);
}

.unsupported-tile {
  border-radius: var(--tile-radius);
  background:
      linear-gradient(180deg, color-mix(in srgb, var(--tile-surface) 28%, transparent), transparent),
      rgba(var(--overlay-rgb), 0.12);
  border: 1px dashed rgba(var(--overlay-rgb), 0.28);
  color: var(--text-primary);
}

.unsupported-tile strong {
  color: var(--tile-accent-color);
}
</style>
