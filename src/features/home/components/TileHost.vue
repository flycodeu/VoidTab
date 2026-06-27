<script setup lang="ts">
import {computed} from 'vue';
import type {BookmarkDensity} from '../../../core/config/types.ts';
import type {
  ComponentTile,
  DeclarativeTileDefinition,
  GridPlacement,
  LayoutProfileId,
  SandboxTileDefinition,
  TileInstance,
  TileRuntimeContext,
  TileSizeBreakpoint,
  TileSizeContext,
} from '../../../core/tiles/contracts.ts';
import {provideTileRuntimeContext} from '../../../core/tiles/context.ts';
import {evaluateTileCompatibility} from '../../../core/tiles/compatibility.ts';
import {
  getGrantedTileHostFeatures,
  listMissingTileCapabilityGrants,
  listRequiredTileHostFeatures,
} from '../../../core/tiles/capabilityGrants.ts';
import {getCurrentHostCapabilities} from '../../../core/tiles/hostCapabilities.ts';
import {resolveTileDefinition} from '../../../core/tiles/registry.ts';
import {tileStyleOverrideToCssVars} from '../../../core/tiles/style.ts';
import {toLegacyTileHostItem} from '../../../core/tiles/tileHostAdapter.ts';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import WidgetCard from '../../widgets/components/WidgetCard.vue';
import DeclarativeTileHost from './DeclarativeTileHost.vue';
import GlassCard from './GlassCard.vue';
import SandboxTileHost from './SandboxTileHost.vue';

const props = defineProps<{
  /** Canonical runtime tile; child cards receive only the adapter projection. */
  tile: TileInstance;
  isEditMode: boolean;
  density?: BookmarkDensity;
  cardSpanW: number;
  cardSpanH: number;
  priority?: 'high' | 'low';
  showWidgetName: boolean;
  profile?: LayoutProfileId;
  gridCols?: number;
  gridUnit?: number;
  gridGap?: number;
  placement?: GridPlacement;
}>();

const emit = defineEmits<{
  (event: 'contextmenu', value: MouseEvent): void;
  (event: 'site-pointerdown', value: PointerEvent): void;
  (event: 'site-pointermove', value: PointerEvent): void;
  (event: 'site-pointerup', value: PointerEvent): void;
  (event: 'site-pointercancel', value: PointerEvent): void;
  (event: 'site-pointerleave', value: PointerEvent): void;
  (event: 'site-click-capture', value: MouseEvent): void;
  (event: 'recover-tile'): void;
}>();

const store = useConfigStore();
const tileType = computed(() => props.tile.tileType);
const definition = computed(() => resolveTileDefinition(tileType.value, store.config.tileInstalls));
const isWidget = computed(() => definition.value.renderer.kind === 'widget');
const isDeclarative = computed(() => definition.value.renderer.kind === 'declarative' && props.tile.tileType !== 'site');
const isSandbox = computed(() => definition.value.renderer.kind === 'sandbox' && props.tile.tileType !== 'site');
const isUnsupported = computed(() => definition.value.renderer.kind === 'unsupported');
const componentTile = computed(() => props.tile.tileType !== 'site' ? props.tile as ComponentTile : null);
const declarativeDefinition = computed<DeclarativeTileDefinition | null>(() =>
    definition.value.renderer.kind === 'declarative' ? definition.value as DeclarativeTileDefinition : null,
);
const sandboxDefinition = computed<SandboxTileDefinition | null>(() =>
    definition.value.renderer.kind === 'sandbox' ? definition.value as SandboxTileDefinition : null,
);
const sandboxRuntimeEnabled = computed(() => store.config.runtime?.sandbox?.enabled === true);
const hostCapabilities = computed(() => getCurrentHostCapabilities({sandboxRuntime: sandboxRuntimeEnabled.value}));
const tileStyleVars = computed(() => tileStyleOverrideToCssVars(props.tile.styleOverride));
const normalizePositiveInt = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.round(numeric));
};
const normalizeCoordinate = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
};
const resolveBreakpoint = (placement: GridPlacement): TileSizeBreakpoint => {
  if (placement.w <= 1 && placement.h <= 1) return 'mini';
  if (placement.w >= 3 || placement.h >= 3) return 'large';
  if (placement.w > placement.h) return 'wide';
  if (placement.h > placement.w) return 'tall';
  return 'normal';
};
const tilePlacement = computed<GridPlacement>(() => ({
  x: normalizeCoordinate(props.placement?.x),
  y: normalizeCoordinate(props.placement?.y),
  w: normalizePositiveInt(props.placement?.w ?? props.cardSpanW, 1),
  h: normalizePositiveInt(props.placement?.h ?? props.cardSpanH, 1),
}));
const renderItem = computed(() => ({
  ...toLegacyTileHostItem(props.tile),
  w: tilePlacement.value.w,
  h: tilePlacement.value.h,
}));
const tileSizeContext = computed<TileSizeContext>(() => {
  const placement = tilePlacement.value;
  const unit = Math.max(0, Math.round(Number(props.gridUnit || 0)));
  const gap = Math.max(0, Math.round(Number(props.gridGap || 0)));
  const width = unit > 0 ? (placement.w * unit) + Math.max(0, placement.w - 1) * gap : 0;
  const height = unit > 0 ? (placement.h * unit) + Math.max(0, placement.h - 1) * gap : 0;
  return {
    profile: props.profile || 'desktop',
    cols: normalizePositiveInt(props.gridCols, placement.w),
    unit,
    gap,
    placement,
    width,
    height,
    breakpoint: resolveBreakpoint(placement),
  };
});
const tileSettings = computed(() => props.tile.tileType === 'site' ? {} : props.tile.settings);
const tileRuntimeContext = computed<TileRuntimeContext>(() => ({
  instanceId: props.tile.id,
  tileType: props.tile.tileType,
  source: definition.value.source,
  settings: tileSettings.value,
  size: tileSizeContext.value,
}));
provideTileRuntimeContext(tileRuntimeContext);
const widgetNameMode = computed(() => {
  if (!props.showWidgetName || !isWidget.value) return 'none';
  return Math.max(1, Number(renderItem.value.h || 1)) === 1 ? 'overlay' : 'below';
});
const grantedHostFeatures = computed(() => {
  if (!('compatibility' in definition.value)) return [];
  if (definition.value.renderer.kind === 'sandbox') {
    return listRequiredTileHostFeatures(definition.value);
  }
  if (!componentTile.value) return [];
  return getGrantedTileHostFeatures(store.config.runtime?.tileGrants?.grants, componentTile.value.id);
});
const compatibilityStatus = computed(() => {
  if (!('compatibility' in definition.value)) return {state: 'supported' as const};
  return evaluateTileCompatibility({
    compatibility: definition.value.compatibility,
    host: hostCapabilities.value,
    grantedRequiredFeatures: grantedHostFeatures.value,
  });
});
const compatibilityBlocksRender = computed(() =>
    compatibilityStatus.value.state === 'blocked' || compatibilityStatus.value.state === 'unsupported',
);
// A sandbox tile whose package is fine but the global "Sandbox JS 本机实验" switch
// is still off. This is the most common cause of a freshly-created component not
// rendering, so we surface a one-click way to turn the runtime on.
const sandboxRuntimeMissing = computed(() =>
    definition.value.renderer.kind === 'sandbox'
    && !sandboxRuntimeEnabled.value
    && compatibilityStatus.value.state === 'unsupported',
);
const compatibilityMessage = computed(() => {
  if (sandboxRuntimeMissing.value) return 'Sandbox JS 运行时尚未启用，开启后即可运行此组件。';
  const status = compatibilityStatus.value;
  if (status.state === 'blocked' || status.state === 'unsupported') return status.reasons[0] || '组件当前不可用';
  if (status.state === 'degraded') return status.notices[0] || '组件正在降级运行';
  return '';
});
// A placed tile whose package install still exists but was disabled in 组件中心.
// Re-enabling it is the fix, so offer that instead of a dead-end "数据已保留".
const installRecord = computed(() => store.config.tileInstalls?.[tileType.value]);
const disabledInstall = computed(() =>
    isUnsupported.value
    && !!installRecord.value
    && installRecord.value.enabled === false
    && (installRecord.value.runtime === 'sandbox' || installRecord.value.runtime === 'declarative'),
);
const enableSandboxRuntime = () => store.setSandboxRuntimeEnabled(true);
const enableDisabledPackage = () => {
  if (installRecord.value) store.enableTilePackage(tileType.value);
};
const missingCapabilityGrants = computed(() => {
  if (!componentTile.value || !('compatibility' in definition.value) || definition.value.renderer.kind === 'sandbox') return [];
  return listMissingTileCapabilityGrants(definition.value, store.config.runtime?.tileGrants?.grants, componentTile.value.id);
});
const canRestoreAuthorization = computed(() =>
    compatibilityStatus.value.state === 'blocked' && missingCapabilityGrants.value.length > 0,
);
const capabilityLabels: Record<string, string> = {
  indexedStorage: '本地存储',
  syncStorage: '同步存储',
  networkProxy: '网络访问',
  clipboardWrite: '写入剪贴板',
  notifications: '系统通知',
  openExternal: '打开外链',
  contextMenus: '右键菜单',
  localFileImport: '本地文件导入',
  sandboxRuntime: 'Sandbox 运行时',
};
const missingCapabilityLabel = computed(() =>
    missingCapabilityGrants.value.map((feature) => capabilityLabels[feature] || feature).join('、'),
);
const optionalHostOrigins = computed(() => {
  if (!('capabilities' in definition.value)) return [];
  const origins = new Set<string>();
  for (const capability of definition.value.capabilities || []) {
    if (capability.type !== 'network') continue;
    for (const host of capability.hosts || []) {
      try {
        const url = new URL(host.includes('://') ? host : `https://${host}`);
        if (url.protocol === 'https:') origins.add(`${url.protocol}//${url.host}/*`);
      } catch {
        // Invalid host declarations are ignored here; package parsing and fetch gating handle rejection.
      }
    }
  }
  return [...origins];
});
const restoreAuthorization = async () => {
  if (!componentTile.value) return;
  let features = [...missingCapabilityGrants.value];
  if (hostCapabilities.value.target === 'extension' && missingCapabilityGrants.value.includes('networkProxy')) {
    const results = await Promise.all(optionalHostOrigins.value.map((origin) => store.requestOptionalHostPermission(origin)));
    const granted = results.length > 0 && results.every((result) => result.ok && result.granted);
    if (!granted) features = features.filter((feature) => feature !== 'networkProxy');
  }
  if (features.length) store.grantTileCapabilities(componentTile.value.id, features);
};
</script>

<template>
  <div
      class="tile-host w-full h-full min-w-0 min-h-0"
      :style="tileStyleVars"
      :data-tile-type="tileType"
      :data-tile-renderer="definition.renderer.kind"
      :data-tile-density="tile.styleOverride?.density"
      :data-tile-profile="tileSizeContext.profile"
      :data-tile-breakpoint="tileSizeContext.breakpoint"
  >
    <div
        v-if="compatibilityStatus.state === 'degraded'"
        class="compatibility-notice"
        role="status"
    >
      {{ compatibilityMessage }}
    </div>

    <div
        v-if="compatibilityBlocksRender"
        class="unsupported-tile w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center"
        role="status"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <strong class="text-sm truncate max-w-full">{{ definition.label }}</strong>
      <span class="text-xs opacity-70">{{ compatibilityMessage }}</span>
      <small v-if="missingCapabilityLabel && !sandboxRuntimeMissing" class="compatibility-missing">{{ missingCapabilityLabel }}</small>
      <button
          v-if="sandboxRuntimeMissing"
          type="button"
          class="unsupported-recover-btn"
          @click.stop="enableSandboxRuntime"
      >
        启用 Sandbox 运行时
      </button>
      <button
          v-else-if="canRestoreAuthorization"
          type="button"
          class="unsupported-recover-btn"
          @click.stop="restoreAuthorization"
      >
        恢复授权
      </button>
    </div>

    <div
        v-else-if="isWidget"
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
        v-else-if="isDeclarative && componentTile && declarativeDefinition"
        class="declarative-host-shell w-full h-full overflow-hidden"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <DeclarativeTileHost :tile="componentTile" :definition="declarativeDefinition"/>
    </div>

    <div
        v-else-if="isSandbox && componentTile && sandboxDefinition"
        class="sandbox-host-shell w-full h-full overflow-hidden"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <SandboxTileHost
          :tile="componentTile"
          :definition="sandboxDefinition"
          :enabled="sandboxRuntimeEnabled"
          @contextmenu="emit('contextmenu', $event)"
      />
    </div>

    <div
        v-else-if="isUnsupported"
        class="unsupported-tile w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center"
        role="status"
        @contextmenu.prevent.stop="emit('contextmenu', $event)"
    >
      <strong class="text-sm truncate max-w-full">{{ definition.label }}</strong>
      <span class="text-xs opacity-70">
        {{ disabledInstall ? '此组件已被禁用，启用后即可继续使用。' : '外部组件包尚未安装，数据已保留。' }}
      </span>
      <button
          v-if="disabledInstall"
          type="button"
          class="unsupported-recover-btn"
          @click.stop="enableDisabledPackage"
      >
        启用组件
      </button>
      <button
          v-else
          type="button"
          class="unsupported-recover-btn"
          @click.stop="emit('recover-tile')"
      >
        重新关联
      </button>
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
  position: relative;
  --tile-radius: 18px;
  --tile-icon-scale: 1;
  --tile-elevation: 1;
  --tile-accent: var(--accent-color);
  --tile-accent-color: var(--accent-color);
  --tile-surface: transparent;
}

.compatibility-notice {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 10px;
  z-index: 35;
  min-height: 28px;
  display: flex;
  align-items: center;
  padding: 6px 9px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.13);
  border: 1px solid rgba(245, 158, 11, 0.22);
  color: rgb(217 119 6);
  font-size: 10px;
  line-height: 1.25;
  font-weight: 800;
  pointer-events: none;
}

.widget-host-shell {
  border-radius: var(--tile-radius);
}

.sandbox-host-shell {
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

.compatibility-missing {
  max-width: 100%;
  color: var(--text-secondary, var(--text-primary));
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.72;
  overflow-wrap: anywhere;
}

.unsupported-recover-btn {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tile-accent-color) 42%, transparent);
  color: var(--tile-accent-color);
  background: color-mix(in srgb, var(--tile-accent-color) 12%, transparent);
  font-size: 11px;
  font-weight: 800;
}

.unsupported-recover-btn:hover,
.unsupported-recover-btn:focus-visible {
  background: color-mix(in srgb, var(--tile-accent-color) 18%, transparent);
  outline: none;
}
</style>
