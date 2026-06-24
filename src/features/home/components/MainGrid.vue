<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref, computed, CSSProperties, watch} from "vue";
import {VueDraggable} from "vue-draggable-plus";
import {useDebounceFn} from "@vueuse/core";

// Stores
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useUiStore} from "../../../stores/ui/useUiStore.ts";
import {useStateStore} from "../../../stores/useStateStore.ts";

// Components
import TileHost from "./TileHost.vue";
import AddCard from "./AddCard.vue";
import GroupHeaderBar from "../../widgets/components/widget-panel/GroupHeaderBar.vue";
import ConfirmDialog from "../../../shared/ui/dialogs/ConfirmDialog.vue";
import EmptyState from "../../../shared/ui/EmptyState.vue";
import {PhPlus, PhSquaresFour, PhTrash, PhX} from "@phosphor-icons/vue";

// Composables
import {useVisibleGroups} from "../composables/useVisibleGroups.ts";
import {useToast} from "../../../shared/composables/useToast.ts";
import {queueSiteIconPreload, type SiteIconPreloadHandle} from "../../../shared/utils/iconPreloader.ts";
import {isExtensionContext} from "../../../shared/utils/icon.ts";
import {cloneConfigSnapshot} from "../../../shared/utils/configSnapshot.ts";

// Types
import type {GroupSortKey} from "../../../core/config/types.ts";
import type {GridPlacement, LayoutProfileId, TileLayouts, WorkspaceLayoutProfile} from "../../../core/tiles/contracts.ts";
import {cloneDefaultWorkspaceLayout, getGridMetrics, MAX_TILE_SPAN, resolveLayoutProfileId, type GridMetrics} from "../../../core/tiles/gridMetrics.ts";
import {findFirstAvailablePlacement, solveCanvasLayout} from "../../../core/tiles/layoutSolver.ts";
import {
  cloneRuntimeTile,
  findTile,
  getTileDesktopSize,
  getTileFallbackTitle,
  getTileLayouts,
  getTileTitle,
  getTileUrl,
  getWorkspaceTileCount,
  getWorkspaceTiles,
  isComponentTile,
  isSiteTile,
  setTileLayouts,
  setTileSize,
  setWorkspaceTiles,
  type RuntimeTile,
  type RuntimeWorkspace,
} from "../../../core/tiles/tileAccess.ts";

type LayoutItem = RuntimeTile;
type LayoutGroup = RuntimeWorkspace;

const props = defineProps<{
  activeGroupId: string;
  isEditMode: boolean;
  siteCardW: number;
  siteCardH: number;
}>();

const emit = defineEmits<{
  (e: "openSettings"): void;
  (e: "openGroupDialog"): void;
  (e: "openWidgets"): void;
}>();

const store = useConfigStore();
const ui = useUiStore();
const statsStore = useStateStore();
const toast = useToast();

const dialog = inject("dialog") as { openAddDialog: (gid: string) => void } | undefined;
const openAddDialog = (gid: string) => dialog?.openAddDialog?.(gid);

const {visibleGroups} = useVisibleGroups({
  groups: () => store.config.layout || [],
  isEditMode: () => props.isEditMode,
  activeGroupId: () => props.activeGroupId,
  showAllGroups: () => !!store.config.theme.showAllGroupsInMain,
  dragState: ui.dragState,
});

const visibleLayoutGroups = computed(() => visibleGroups.value as LayoutGroup[]);
const hasVisibleGroups = computed(() => visibleLayoutGroups.value.length > 0);

const activeGroupData = computed(() => {
  return (store.config.layout as any[]).find((g) => g.id === props.activeGroupId) as LayoutGroup | undefined;
});

/** ----------------------------------------------------------------
 * 严格网格系统 (Strict Grid System)
 * ---------------------------------------------------------------- */
const isMobile = ref(false);
let mq: MediaQueryList | null = null;
const MOBILE_COLS = 4;
const MOBILE_COLS_NARROW = 3;
const NARROW_MOBILE_WIDTH = 430;
const viewportW = ref(typeof window !== "undefined" ? window.innerWidth : 1280);
const mobileCols = computed(() => viewportW.value < NARROW_MOBILE_WIDTH ? MOBILE_COLS_NARROW : MOBILE_COLS);

const gridHostEl = ref<HTMLElement | null>(null);
const availableGridWidth = ref(1280);
let ro: ResizeObserver | null = null;
let onWindowResize: (() => void) | null = null;
let pendingGridMeasureFrame: number | null = null;

const activeLayoutProfile = computed<LayoutProfileId>(() =>
    resolveLayoutProfileId(availableGridWidth.value, isMobile.value)
);

const legacyProfileOverride = computed<Partial<WorkspaceLayoutProfile>>(() => {
  const iconSize = Number(store.config.theme.iconSize || 60);
  const labelSpace = store.config.theme.showIconName || store.config.theme.showWidgetName ? 32 : 12;
  return {
    unit: Math.max(72, Math.min(160, Math.round(iconSize + labelSpace))),
    gap: Math.max(0, Math.min(48, Math.round(Number(store.config.theme.gap || 20)))),
  };
});

const getGroupMetrics = (group: LayoutGroup): GridMetrics => getGridMetrics(
    availableGridWidth.value,
    activeLayoutProfile.value,
    group.workspaceLayout,
    activeLayoutProfile.value === 'mobile' ? mobileCols.value : undefined,
    group.workspaceLayout ? undefined : legacyProfileOverride.value,
);

const getWidgetTitle = (item: LayoutItem) => getTileFallbackTitle(item, '未命名组件');

const getItemTitle = (item: any) => {
  if (!item) return "未命名项目";
  if (isComponentTile(item)) return getWidgetTitle(item);
  return getTileTitle(item).trim() || "未命名网站";
};

const getItemKindLabel = (item: any) => isComponentTile(item) ? "组件" : "网站";

const isGroupEmpty = (group: LayoutGroup) => getWorkspaceTileCount(group) === 0;

const handleEmptyGroupAction = (groupId: string) => {
  openAddDialog(groupId);
  ui.announce("已打开添加网站窗口");
};

function recalcGrid() {
  const el = gridHostEl.value;
  if (!el) return;

  const shellWidth = el.clientWidth;
  if (shellWidth <= 0) return;

  const style = window.getComputedStyle(el);
  const padX = (parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0")) || 0;
  const width = Math.max(0, shellWidth - padX);
  if (width <= 0) return;

  availableGridWidth.value = width;
}

const recalcGridDebounced = useDebounceFn(() => recalcGrid(), 150, {maxWait: 300});

/**
 * Container width changes caused by focus/sidebar transitions must update in the
 * next frame, not after the normal resize debounce. Otherwise a fixed grid is
 * briefly centered with stale column metrics and appears to jump.
 */
const scheduleImmediateGridMeasure = () => {
  if (pendingGridMeasureFrame !== null) return;
  pendingGridMeasureFrame = window.requestAnimationFrame(() => {
    pendingGridMeasureFrame = null;
    recalcGrid();
  });
};

const onMqChange = () => {
  isMobile.value = !!mq?.matches;
  recalcGrid();
};

onMounted(() => {
  mq = window.matchMedia("(max-width: 767px)");
  onWindowResize = () => {
    viewportW.value = window.innerWidth;
    scheduleImmediateGridMeasure();
  };
  window.addEventListener("resize", onWindowResize, {passive: true});
  onMqChange();
  mq.addEventListener?.("change", onMqChange);

  ro = new ResizeObserver(() => scheduleImmediateGridMeasure());
  if (gridHostEl.value) ro.observe(gridHostEl.value);
});

onBeforeUnmount(() => {
  iconPreloadDisposed = true;
  cancelIconPreloadBatches();
  if (steadyIconPreloadTimer !== null) {
    window.clearTimeout(steadyIconPreloadTimer);
    steadyIconPreloadTimer = null;
  }
  mq?.removeEventListener?.("change", onMqChange);
  ro?.disconnect();
  if (onWindowResize) window.removeEventListener("resize", onWindowResize);
  if (pendingGridMeasureFrame !== null) window.cancelAnimationFrame(pendingGridMeasureFrame);
  resetLongPressState();
  suppressNextSiteClick = null;
  ro = null;
  onWindowResize = null;
  pendingGridMeasureFrame = null;
  stopCanvasGesture(false);
});

watch(
    () => [store.config.theme.iconSize, store.config.theme.gap, store.config.theme.showIconName, store.config.theme.showWidgetName, store.config.theme.gridMaxWidth],
    () => recalcGridDebounced()
);

const gridShellStyle = computed<CSSProperties>(() => {
  const safeDesktopWidth = Math.max(420, viewportW.value - 48);
  const maxWidth = isMobile.value ? "100%" : `${Math.min(Number(store.config.theme.gridMaxWidth || 1600), safeDesktopWidth)}px`;
  return {maxWidth};
});

/** 固定单元网格：列数随容器变化，单元本身保持确定。 */
const gridStyleOf = (group: LayoutGroup): CSSProperties => {
  const metrics = getGroupMetrics(group);
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${metrics.cols}, ${metrics.unit}px)`,
    gridAutoRows: `${metrics.unit}px`,
    gap: `${metrics.gap}px`,
    width: '100%',
    minWidth: 0,
    justifyContent: 'center',
    justifyItems: 'stretch',
    alignItems: 'start',
    gridAutoFlow: isCanvasLayout(group) ? 'row' : 'dense',
    paddingBottom: '40px',
    '--grid-unit': `${metrics.unit}px`,
    '--grid-gap': `${metrics.gap}px`,
  };
};
const densityItemClass = computed(() => `density-mode-${store.config.theme.density || "normal"}`);

const PRELOAD_CURRENT_GROUP_LIMIT = 48;
const PRELOAD_NEIGHBOR_GROUP_LIMIT = 36;
const PRELOAD_STARTUP_WINDOW_MS = 5000;
const PRELOAD_STARTUP_CURRENT_GROUP_LIMIT = 18;
let primaryIconPreload: SiteIconPreloadHandle | null = null;
let secondaryIconPreload: SiteIconPreloadHandle | null = null;
let iconPreloadDisposed = false;
let steadyIconPreloadTimer: number | null = null;
const mainGridCreatedAt = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
const gridNow = () => globalThis.performance?.now ? globalThis.performance.now() : Date.now();
const isStartupPreloadWindow = () => gridNow() - mainGridCreatedAt < PRELOAD_STARTUP_WINDOW_MS;

const isAutoIconSiteItem = (item: LayoutItem) => {
  if (!item || !isSiteTile(item)) return false;
  const iconType = item.iconType || "auto";
  return iconType === "auto" && typeof item.url === "string" && item.url.trim().length > 0;
};

const collectAutoIconUrls = (groups: LayoutGroup[], limit: number) => {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of getWorkspaceTiles(group)) {
      if (!isAutoIconSiteItem(item)) continue;
      const url = getTileUrl(item).trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= limit) return urls;
    }
  }

  return urls;
};

const getNeighborGroups = () => {
  const groups = store.config.layout as LayoutGroup[];
  const activeIndex = groups.findIndex((group) => group.id === props.activeGroupId);
  if (activeIndex < 0) return [];

  return [groups[activeIndex - 1], groups[activeIndex + 1]].filter(Boolean) as LayoutGroup[];
};

const cancelIconPreloadBatches = () => {
  primaryIconPreload?.cancel();
  secondaryIconPreload?.cancel();
  primaryIconPreload = null;
  secondaryIconPreload = null;
};

const scheduleIconPreloadBatches = useDebounceFn(() => {
  if (iconPreloadDisposed) return;
  cancelIconPreloadBatches();

  const runtime = store.config.runtime;
  if (!runtime) return;

  const inExtension = isExtensionContext();
  const startup = isStartupPreloadWindow();
  if (startup && steadyIconPreloadTimer === null && typeof window !== "undefined") {
    steadyIconPreloadTimer = window.setTimeout(() => {
      steadyIconPreloadTimer = null;
      if (!iconPreloadDisposed) scheduleIconPreloadBatches();
    }, PRELOAD_STARTUP_WINDOW_MS + 350);
  } else if (!startup && steadyIconPreloadTimer !== null) {
    window.clearTimeout(steadyIconPreloadTimer);
    steadyIconPreloadTimer = null;
  }

  const currentGroup = activeGroupData.value;
  const currentLimit = inExtension
      ? (startup ? PRELOAD_STARTUP_CURRENT_GROUP_LIMIT : PRELOAD_CURRENT_GROUP_LIMIT)
      : (startup ? 8 : 12);
  const currentUrls = collectAutoIconUrls(currentGroup ? [currentGroup] : [], currentLimit);
  if (currentUrls.length) {
    primaryIconPreload = queueSiteIconPreload(currentUrls, runtime, {
      concurrency: startup ? (isMobile.value ? 1 : 2) : (isMobile.value ? 2 : (inExtension ? 5 : 2)),
      fastFirst: true,
      fastTimeoutMs: 900,
      timeoutMs: 1400,
      browserWarm: true,
      browserWarmLimit: startup ? 1 : (inExtension ? 3 : 2),
      backgroundUpgrade: false,
      idleTimeoutMs: startup ? 1200 : 250,
    });
  }

  const neighborUrls = startup ? [] : collectAutoIconUrls(getNeighborGroups(), inExtension ? PRELOAD_NEIGHBOR_GROUP_LIMIT : 4);
  if (neighborUrls.length) {
    secondaryIconPreload = queueSiteIconPreload(neighborUrls, runtime, {
      concurrency: inExtension ? 2 : 1,
      fastFirst: true,
      fastTimeoutMs: 1000,
      timeoutMs: 1800,
      browserWarm: true,
      browserWarmLimit: inExtension ? 2 : 1,
      backgroundUpgrade: false,
      idleTimeoutMs: inExtension ? 1600 : 5000,
    });
  }
}, 250, {maxWait: 1000});

const iconPreloadSignature = computed(() => {
  const groups = store.config.layout as LayoutGroup[];
  return [
    props.activeGroupId,
    store.config.runtime?.siteIcons?.version || 0,
    groups.map((group) => {
      const sample = collectAutoIconUrls([group], 12).join(",");
      return `${group.id}:${getWorkspaceTileCount(group)}:${sample}`;
    }).join("|"),
  ].join("::");
});

watch(iconPreloadSignature, () => scheduleIconPreloadBatches(), {immediate: true, flush: "post"});

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const clampSpan = (value: unknown, fallback: number, max = MAX_TILE_SPAN) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(Math.round(numeric), 1, max);
};

const clampCoordinate = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(Math.round(numeric), 0, 10000);
};

const isCanvasLayout = (group: LayoutGroup) => group.workspaceLayout?.mode === 'canvas';

const getFlowItemSize = (item: LayoutItem, metrics: GridMetrics) => {
  if (!isComponentTile(item)) {
    if ((store.config.theme.siteLayoutMode || 'icon') !== 'card') return {w: 1, h: 1};
    return {
      w: clampSpan(props.siteCardW || store.config.theme.siteCard?.w || 3, 1, metrics.cols),
      h: clampSpan(props.siteCardH || store.config.theme.siteCard?.h || 1, 1),
    };
  }
  const size = getTileDesktopSize(item);
  return {
    w: clampSpan(size.w, 2, metrics.cols),
    h: clampSpan(size.h, 2),
  };
};

const getCanvasItemSize = (item: LayoutItem, metrics: GridMetrics) => {
  const desktopSize = getTileDesktopSize(item);
  const hasStoredLayout = !!getTileLayouts(item)?.desktop;
  const legacySiteCard = !isComponentTile(item)
      && !hasStoredLayout
      && (store.config.theme.siteLayoutMode || 'icon') === 'card';
  return {
    w: legacySiteCard
        ? clampSpan(props.siteCardW || store.config.theme.siteCard?.w || 3, 1, metrics.cols)
        : clampSpan(desktopSize.w, isComponentTile(item) ? 2 : 1, metrics.cols),
    h: legacySiteCard
        ? clampSpan(props.siteCardH || store.config.theme.siteCard?.h || 1, 1)
        : clampSpan(desktopSize.h, isComponentTile(item) ? 2 : 1),
  };
};

const isPlacementWithinMetrics = (placement: GridPlacement, metrics: GridMetrics) =>
    placement.x >= 0
    && placement.y >= 0
    && placement.w >= 1
    && placement.h >= 1
    && placement.x + placement.w <= metrics.cols;

const getStoredPlacement = (item: LayoutItem, profile: LayoutProfileId) =>
    getTileLayouts(item)?.[profile] || getTileLayouts(item)?.desktop;

const collectCanvasPlacements = (group: LayoutGroup, metrics = getGroupMetrics(group)) => {
  const placements: Record<string, GridPlacement> = {};
  for (const item of getWorkspaceTiles(group)) {
    const stored = getStoredPlacement(item, metrics.profile);
    const size = getCanvasItemSize(item, metrics);
    const candidate = stored
      ? {
          x: clampCoordinate(stored.x),
          y: clampCoordinate(stored.y),
          w: clampSpan(stored.w, size.w, metrics.cols),
          h: clampSpan(stored.h, size.h),
        }
        : undefined;
    if (candidate && isPlacementWithinMetrics(candidate, metrics)
        && !Object.values(placements).some((other) => candidate.x < other.x + other.w
            && candidate.x + candidate.w > other.x
            && candidate.y < other.y + other.h
            && candidate.y + candidate.h > other.y)) {
      placements[item.id] = candidate;
      continue;
    }
    const placement = findFirstAvailablePlacement(placements, metrics.cols, size);
    if (placement) placements[item.id] = placement;
  }
  return placements;
};

const getItemStyle = (group: LayoutGroup, item: LayoutItem): CSSProperties => {
  const metrics = getGroupMetrics(group);
  const canvas = isCanvasLayout(group);
  const size = canvas ? getCanvasItemSize(item, metrics) : getFlowItemSize(item, metrics);
  if (canvas) {
    const placement = collectCanvasPlacements(group, metrics)[item.id] || {x: 0, y: 0, ...size};
    return {
      gridColumnStart: placement.x + 1,
      gridColumnEnd: `span ${placement.w}`,
      gridRowStart: placement.y + 1,
      gridRowEnd: `span ${placement.h}`,
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0,
    };
  }
  return {
    gridColumn: `span ${size.w}`,
    gridRow: `span ${size.h}`,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
  };
};

const applyCanvasPlacements = (
    group: LayoutGroup,
    profile: LayoutProfileId,
    placements: Record<string, GridPlacement>,
) => {
  for (const item of getWorkspaceTiles(group)) {
    const placement = placements[item.id];
    if (!placement) continue;
    const existing = getTileLayouts(item);
    const layouts: TileLayouts = {
      desktop: existing?.desktop || {...placement},
      ...(existing?.tablet ? {tablet: existing.tablet} : {}),
      ...(existing?.mobile ? {mobile: existing.mobile} : {}),
      [profile]: {...placement},
    };
    setTileLayouts(item, layouts);
    setTileSize(item, placement.w, placement.h);
  }
};

const initializeCanvasLayout = (group: LayoutGroup, metrics = getGroupMetrics(group)) => {
  const placements = collectCanvasPlacements(group, metrics);
  applyCanvasPlacements(group, metrics.profile, placements);
  return placements;
};

const toggleCanvasLayout = (group: LayoutGroup) => {
  const current = group.workspaceLayout || cloneDefaultWorkspaceLayout();
  const nextMode = current.mode === 'canvas' ? 'flow' : 'canvas';
  group.workspaceLayout = {...current, mode: nextMode};
  if (nextMode === 'canvas') {
    group.sortKey = 'custom';
    initializeCanvasLayout(group);
    toast.success(`「${group.title}」已切换为自由布局。`);
    ui.announce(`${group.title}已切换为自由布局`);
  } else {
    toast.info(`「${group.title}」已切换为自动排列。`);
    ui.announce(`${group.title}已切换为自动排列`);
  }
  void store.saveConfig();
};

const compactCanvasLayout = (group: LayoutGroup) => {
  if (!isCanvasLayout(group)) return;
  const metrics = getGroupMetrics(group);
  const before = collectCanvasPlacements(group, metrics);
  const result = solveCanvasLayout({cols: metrics.cols, placements: before}, {
    type: 'compact',
    profile: metrics.profile,
  });
  applyCanvasPlacements(group, metrics.profile, result.placements);
  recordCanvasHistory({
    groupId: group.id,
    profile: metrics.profile,
    before: clonePlacementMap(before),
    after: clonePlacementMap(result.placements),
  });
  void store.saveConfig();
  toast.success('已整理当前布局。');
  ui.announce('已整理当前布局');
};

type CanvasGesture = {
  group: LayoutGroup;
  itemId: string;
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  initial: GridPlacement;
  originalPlacements: Record<string, GridPlacement>;
  metrics: GridMetrics;
  changed: boolean;
};

type CanvasHistoryEntry = {
  groupId: string;
  profile: LayoutProfileId;
  before: Record<string, GridPlacement>;
  after: Record<string, GridPlacement>;
};

let canvasGesture: CanvasGesture | null = null;
const canvasHistory = ref<CanvasHistoryEntry[]>([]);
const canvasRedoHistory = ref<CanvasHistoryEntry[]>([]);
const MAX_CANVAS_HISTORY = 40;

const clonePlacementMap = (placements: Record<string, GridPlacement>) => Object.fromEntries(
    Object.entries(placements).map(([id, placement]) => [id, {...placement}]),
) as Record<string, GridPlacement>;

const samePlacementMap = (left: Record<string, GridPlacement>, right: Record<string, GridPlacement>) => {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...ids].every((id) => {
    const a = left[id];
    const b = right[id];
    return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  });
};

const recordCanvasHistory = (entry: CanvasHistoryEntry) => {
  if (samePlacementMap(entry.before, entry.after)) return;
  canvasHistory.value.push(entry);
  if (canvasHistory.value.length > MAX_CANVAS_HISTORY) canvasHistory.value.shift();
  canvasRedoHistory.value = [];
};

const applyCanvasHistory = (entry: CanvasHistoryEntry, direction: 'undo' | 'redo') => {
  const group = (store.config.layout as LayoutGroup[]).find((candidate) => candidate.id === entry.groupId);
  if (!group || !isCanvasLayout(group)) return false;
  applyCanvasPlacements(group, entry.profile, direction === 'undo' ? entry.before : entry.after);
  void store.saveConfig();
  return true;
};

const undoCanvasLayout = (group: LayoutGroup) => {
  for (let index = canvasHistory.value.length - 1; index >= 0; index -= 1) {
    const entry = canvasHistory.value[index];
    if (entry.groupId !== group.id) continue;
    canvasHistory.value.splice(index, 1);
    if (applyCanvasHistory(entry, 'undo')) {
      canvasRedoHistory.value.push(entry);
      toast.info('已撤销上一次布局操作。');
      ui.announce('已撤销上一次布局操作');
    }
    return;
  }
};

const redoCanvasLayout = (group: LayoutGroup) => {
  for (let index = canvasRedoHistory.value.length - 1; index >= 0; index -= 1) {
    const entry = canvasRedoHistory.value[index];
    if (entry.groupId !== group.id) continue;
    canvasRedoHistory.value.splice(index, 1);
    if (applyCanvasHistory(entry, 'redo')) {
      canvasHistory.value.push(entry);
      toast.info('已恢复布局操作。');
      ui.announce('已恢复布局操作');
    }
    return;
  }
};

const canUndoCanvasLayout = (group: LayoutGroup) => canvasHistory.value.some((entry) => entry.groupId === group.id);
const canRedoCanvasLayout = (group: LayoutGroup) => canvasRedoHistory.value.some((entry) => entry.groupId === group.id);

const stopCanvasGesture = (save = false) => {
  if (!canvasGesture) return;
  const gesture = canvasGesture;
  window.removeEventListener('pointermove', handleCanvasPointerMove);
  window.removeEventListener('pointerup', handleCanvasPointerUp);
  window.removeEventListener('pointercancel', handleCanvasPointerUp);
  canvasGesture = null;
  ui.setDragState(false);
  if (save && gesture.changed) {
    const after = collectCanvasPlacements(gesture.group, gesture.metrics);
    recordCanvasHistory({
      groupId: gesture.group.id,
      profile: gesture.metrics.profile,
      before: clonePlacementMap(gesture.originalPlacements),
      after: clonePlacementMap(after),
    });
    void store.saveConfig();
  }
};

const handleCanvasPointerMove = (event: PointerEvent) => {
  const gesture = canvasGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const step = gesture.metrics.unit + gesture.metrics.gap;
  const deltaX = Math.round((event.clientX - gesture.startX) / step);
  const deltaY = Math.round((event.clientY - gesture.startY) / step);
  if (deltaX === 0 && deltaY === 0) return;

  const command = gesture.mode === 'move'
      ? {
        type: 'move' as const,
        profile: gesture.metrics.profile,
        tileId: gesture.itemId,
        x: gesture.initial.x + deltaX,
        y: gesture.initial.y + deltaY,
      }
      : {
        type: 'resize' as const,
        profile: gesture.metrics.profile,
        tileId: gesture.itemId,
        w: gesture.initial.w + deltaX,
        h: gesture.initial.h + deltaY,
        anchor: 'nw' as const,
      };
  const result = solveCanvasLayout({
    cols: gesture.metrics.cols,
    placements: gesture.originalPlacements,
  }, command);
  if (result.rejected) return;
  applyCanvasPlacements(gesture.group, gesture.metrics.profile, result.placements);
  gesture.changed = result.changedTileIds.length > 0;
};

const handleCanvasPointerUp = (event: PointerEvent) => {
  if (!canvasGesture || event.pointerId !== canvasGesture.pointerId) return;
  stopCanvasGesture(true);
};

const startCanvasGesture = (
    event: PointerEvent,
    group: LayoutGroup,
    item: LayoutItem,
    mode: 'move' | 'resize',
) => {
  if (!props.isEditMode || !isCanvasLayout(group) || event.button !== 0) return;
  const target = event.target as Element | null;
  if (mode === 'move' && target?.closest('.delete-btn, .canvas-resize-handle')) return;
  stopCanvasGesture(false);
  const metrics = getGroupMetrics(group);
  const originalPlacements = initializeCanvasLayout(group, metrics);
  const initial = originalPlacements[item.id];
  if (!initial) return;
  event.preventDefault();
  event.stopPropagation();
  canvasGesture = {
    group,
    itemId: item.id,
    mode,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    initial,
    originalPlacements,
    metrics,
    changed: false,
  };
  ui.setDragState(true, group.id, item);
  window.addEventListener('pointermove', handleCanvasPointerMove, {passive: false});
  window.addEventListener('pointerup', handleCanvasPointerUp, {passive: true});
  window.addEventListener('pointercancel', handleCanvasPointerUp, {passive: true});
};

const canvasLayoutPresence = computed(() => (store.config.layout as LayoutGroup[])
    .map((group) => `${group.id}:${group.workspaceLayout?.mode || 'flow'}:${getWorkspaceTiles(group).map((item) => `${item.id}:${getTileLayouts(item)?.desktop ? '1' : '0'}`).join(',')}`)
    .join('|'));

watch(canvasLayoutPresence, () => {
  let changed = false;
  for (const group of store.config.layout as LayoutGroup[]) {
    if (!isCanvasLayout(group) || getWorkspaceTiles(group).every((item) => getTileLayouts(item)?.desktop)) continue;
    initializeCanvasLayout(group);
    changed = true;
  }
  if (changed) void store.saveConfig();
}, {flush: 'post'});

/** ----------------------------------------------------------------
 * 排序与拖拽
 * ---------------------------------------------------------------- */
const getSortKey = (group: LayoutGroup): GroupSortKey => (group.sortKey || "custom") as GroupSortKey;

const getDisplayItems = (group: LayoutGroup): LayoutItem[] => {
  const tiles = getWorkspaceTiles(group);
  if (isCanvasLayout(group)) return tiles;
  const key = getSortKey(group);
  if (key === "custom") return tiles;

  const items = [...tiles];
  if (key === "name") {
    return items.sort((a, b) => getTileTitle(a).localeCompare(getTileTitle(b), "zh-CN"));
  }
  if (key === "lastVisited") {
    return items.sort((a, b) => {
      const timeA = statsStore.getLastVisited(a.id);
      const timeB = statsStore.getLastVisited(b.id);
      if (timeB !== timeA) return timeB - timeA;
      return getTileTitle(a).localeCompare(getTileTitle(b), "zh-CN");
    });
  }
  return items;
};

const canFreeReorder = (group: LayoutGroup) => !isCanvasLayout(group) && !props.isEditMode && getSortKey(group) === "custom";

const modelValueOf = (group: LayoutGroup) => (props.isEditMode ? getWorkspaceTiles(group) : getDisplayItems(group));

const updateModelValue = (group: LayoutGroup, val: LayoutItem[]) => {
  if (isCanvasLayout(group)) return;
  if (props.isEditMode) {
    setWorkspaceTiles(group, val);
    store.saveConfig();
    return;
  }
  if (getSortKey(group) === "custom") {
    setWorkspaceTiles(group, val);
    store.saveConfig();
  }
};

const viewOnlyGroup = (gid: string) => ({
  name: `voidtab-view-only-${gid}`,
  pull: false,
  put: false,
});

const onDragStart = (event: any, group: LayoutGroup) => {
  const arr = modelValueOf(group);
  const item = arr?.[event.oldIndex];
  if (item) ui.setDragState(true, group.id, item);
};

const onDragEnd = () => {
  requestAnimationFrame(() => {
    setTimeout(() => ui.setDragState(false), 200);
  });
};

const TOUCH_LONG_PRESS_MS = 450;
const TOUCH_MOVE_TOLERANCE = 10;
let longPressTimer: number | null = null;
let longPressState: { pointerId: number; startX: number; startY: number; item: any; groupId: string } | null = null;
let longPressTriggered = false;
let suppressNativeContextMenuUntil = 0;
let suppressNextSiteClick: { siteId: string; until: number } | null = null;

const resetLongPressState = () => {
  if (longPressTimer != null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressState = null;
  longPressTriggered = false;
};

const shouldEnableLongPress = (e: PointerEvent) => {
  if (props.isEditMode || ui.dragState.isDragging) return false;
  if (e.pointerType === "touch" || e.pointerType === "pen") return true;
  return !!window.matchMedia?.("(pointer: coarse)")?.matches;
};

const handleSitePointerDown = (e: PointerEvent, item: any, groupId: string) => {
  if (!item || isComponentTile(item)) return;
  if (!shouldEnableLongPress(e)) return;

  resetLongPressState();
  longPressState = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    item,
    groupId,
  };

  longPressTimer = window.setTimeout(() => {
    if (!longPressState) return;
    longPressTriggered = true;
    suppressNativeContextMenuUntil = Date.now() + 700;
    suppressNextSiteClick = {siteId: String(item.id || ""), until: Date.now() + 900};
    ui.openContextMenuAt(longPressState.startX, longPressState.startY, item, "site", groupId);
  }, TOUCH_LONG_PRESS_MS);
};

const handleSitePointerMove = (e: PointerEvent) => {
  if (!longPressState || longPressTriggered) return;
  if (e.pointerId !== longPressState.pointerId) return;

  const dx = Math.abs(e.clientX - longPressState.startX);
  const dy = Math.abs(e.clientY - longPressState.startY);
  if (dx > TOUCH_MOVE_TOLERANCE || dy > TOUCH_MOVE_TOLERANCE) {
    resetLongPressState();
  }
};

const handleSitePointerEnd = (e: PointerEvent) => {
  if (!longPressState || e.pointerId !== longPressState.pointerId) return;
  const fired = longPressTriggered;
  resetLongPressState();
  if (fired) {
    e.preventDefault();
    e.stopPropagation();
  }
};

const handleSiteClickCapture = (e: MouseEvent, item: any) => {
  if (!suppressNextSiteClick) return;
  if (Date.now() > suppressNextSiteClick.until) {
    suppressNextSiteClick = null;
    return;
  }
  if (suppressNextSiteClick.siteId !== String(item?.id || "")) return;
  e.preventDefault();
  e.stopPropagation();
  suppressNextSiteClick = null;
};

const handleBlankContextMenu = (e: MouseEvent, groupId: string) => {
  ui.openContextMenu(e, null, "blank", groupId);
};
const handleItemContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  if (Date.now() < suppressNativeContextMenuUntil) return;
  const type = isComponentTile(item) ? "widget" : "site";
  ui.openContextMenu(e, item, type, groupId);
};

type DeleteTarget = { groupId: string; itemId: string };
type DeletedItemSnapshot = {
  groupId: string;
  index: number;
  item: LayoutItem;
  title: string;
  kindLabel: string;
};

const deleteDialogOpen = ref(false);
const deleteTarget = ref<DeleteTarget | null>(null);

const findGroupById = (groupId: string) => {
  return (store.config.layout as LayoutGroup[]).find((group) => group.id === groupId);
};

const cloneLayoutItem = (item: LayoutItem) => cloneRuntimeTile(cloneConfigSnapshot(item));

const cancelDelete = () => {
  deleteDialogOpen.value = false;
  deleteTarget.value = null;
};

const askDelete = (groupId: string, itemId: string) => {
  const group = findGroupById(groupId);
  const item = findTile(group, itemId);
  if (!item) {
    toast.warning("这个项目已经不在当前分组中。");
    ui.announce("这个项目已经不在当前分组中");
    return;
  }

  deleteTarget.value = {groupId, itemId};
  deleteDialogOpen.value = true;
};

const restoreDeletedItem = (snapshot: DeletedItemSnapshot) => {
  const group = findGroupById(snapshot.groupId);
  if (!group) {
    toast.error("原分组不存在，无法撤销这次移除。");
    ui.announce("原分组不存在，无法撤销这次移除");
    return;
  }

  if (getWorkspaceTiles(group).some((item) => item.id === snapshot.item.id)) {
    toast.info(`「${snapshot.title}」已经在分组中。`);
    ui.announce(`${snapshot.title}已经在分组中`);
    return;
  }

  const tiles = getWorkspaceTiles(group);
  const index = Math.max(0, Math.min(snapshot.index, tiles.length));
  tiles.splice(index, 0, cloneLayoutItem(snapshot.item));
  void store.saveConfig();

  toast.success(`已恢复「${snapshot.title}」。`);
  ui.announce(`已恢复${snapshot.kindLabel}${snapshot.title}`);
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;

  const {groupId, itemId} = deleteTarget.value;
  const group = findGroupById(groupId);
  const tiles = group ? getWorkspaceTiles(group) : [];
  const index = tiles.findIndex((item) => item.id === itemId);
  const item = index >= 0 ? tiles[index] : null;

  if (!group || !item) {
    cancelDelete();
    toast.warning("这个项目已经被移除，列表已更新。");
    ui.announce("这个项目已经被移除，列表已更新");
    return;
  }

  const snapshot: DeletedItemSnapshot = {
    groupId,
    index,
    item: cloneLayoutItem(item),
    title: getItemTitle(item),
    kindLabel: getItemKindLabel(item),
  };

  store.removeSite(groupId, itemId);
  void store.saveConfig();
  cancelDelete();

  toast.warning(`已移除「${snapshot.title}」。`, {
    duration: 6000,
    action: {
      label: "撤销",
      handler: () => restoreDeletedItem(snapshot),
    },
  });
  ui.announce(`已移除${snapshot.kindLabel}${snapshot.title}，可在通知中选择撤销`);
};
</script>

<template>
  <div
      class="w-full flex flex-col items-center md:pb-20"
      :style="{ paddingBottom: `calc(env(safe-area-inset-bottom) + 96px)` }"
  >
    <div
        class="w-full transition-all duration-300 px-2 md:px-8 overflow-x-hidden"
        :style="gridShellStyle"
        ref="gridHostEl"
    >
      <EmptyState
          v-if="!hasVisibleGroups"
          :icon="PhSquaresFour"
          title="还没有分组"
          description="新建一个分组后，就可以把常用网站和组件放在这里。"
          actionLabel="新建分组"
          secondaryActionLabel="打开设置"
          ariaLabel="空白主页"
          @action="emit('openGroupDialog')"
          @secondaryAction="emit('openSettings')"
      />

      <template v-for="group in visibleLayoutGroups" :key="group.id">
        <div
            class="group-section transition-all duration-300 mb-10 animate-fade-in w-full scroll-mt-24"
            role="region"
            :aria-label="`${group.title}分组`"
            :aria-current="group.id === activeGroupId ? 'page' : undefined"
            data-group-section="1"
            :data-group-section-id="group.id"
        >
          <GroupHeaderBar
              v-if="!isEditMode"
              :group-name="group.title"
              :count="getWorkspaceTileCount(group)"
              :sort-key="isCanvasLayout(group) ? 'custom' : getSortKey(group)"
              @update:sortKey="(key) => store.updateGroupSort(group.id, key)"
              :key="`header-${group.id}`"
          />

          <!-- 编辑模式分组标题：主题色 + 主题面板变量 -->
          <div
              v-if="isEditMode"
              class="group-edit-title px-2 mb-3 font-bold tracking-wider text-sm flex items-center gap-2 select-none"
          >
            <div class="w-1 h-4 rounded-full group-edit-bar"></div>
            <span>{{ group.title }}</span>
            <div class="ml-auto flex items-center gap-2">
              <button
                  type="button"
                  class="layout-mode-chip ignore-drag"
                  :class="{ 'is-canvas': isCanvasLayout(group) }"
                  :aria-pressed="isCanvasLayout(group)"
                  @click.stop="toggleCanvasLayout(group)"
              >
                {{ isCanvasLayout(group) ? '自由布局' : '自动排列' }}
              </button>
              <button
                  v-if="isCanvasLayout(group)"
                  type="button"
                  class="layout-compact-btn ignore-drag"
                  @click.stop="compactCanvasLayout(group)"
              >
                整理
              </button>
              <button
                  v-if="isCanvasLayout(group)"
                  type="button"
                  class="layout-compact-btn ignore-drag"
                  :disabled="!canUndoCanvasLayout(group)"
                  @click.stop="undoCanvasLayout(group)"
              >
                撤销
              </button>
              <button
                  v-if="isCanvasLayout(group)"
                  type="button"
                  class="layout-compact-btn ignore-drag"
                  :disabled="!canRedoCanvasLayout(group)"
                  @click.stop="redoCanvasLayout(group)"
              >
                重做
              </button>
            </div>
          </div>

          <EmptyState
              v-if="isGroupEmpty(group)"
              :icon="PhSquaresFour"
              :actionIcon="PhPlus"
              title="这个分组还没有内容"
              description="添加常用网站或组件后，它们会显示在这个分组里。"
              actionLabel="添加网站"
              secondaryActionLabel="打开组件库"
              :ariaLabel="`${group.title}分组为空`"
              @action="handleEmptyGroupAction(group.id)"
              @secondaryAction="emit('openWidgets')"
          />

          <VueDraggable
              v-else
              :key="(isEditMode ? 'edit-' : 'view-') + group.id + '-' + (group.sortKey || 'custom')"
              :modelValue="modelValueOf(group)"
              @update:modelValue="(val:any) => updateModelValue(group, val)"
              :animation="200"
              :group="isEditMode ? 'voidtab-shared-group' : viewOnlyGroup(group.id)"
              filter=".ignore-drag"
              class="w-full min-h-[120px]"
              :class="[{ 'edit-grid-shell': isEditMode, 'canvas-grid-shell': isCanvasLayout(group) }]"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="gridStyleOf(group)"
              :disabled="isCanvasLayout(group) || (!isEditMode && !canFreeReorder(group))"
              @contextmenu.prevent.self="handleBlankContextMenu($event, group.id)"
              role="list"
              :aria-label="`${group.title}内容网格`"
          >
            <div
                v-for="item in modelValueOf(group)"
                :key="item.id"
                :style="getItemStyle(group, item)"
                class="site-tile relative"
                :class="[{ 'arrange-mode': isEditMode, 'canvas-tile': isCanvasLayout(group), 'canvas-arrange-mode': isCanvasLayout(group) && isEditMode }, densityItemClass]"
                role="listitem"
                @pointerdown.capture="(e:any) => startCanvasGesture(e, group, item, 'move')"
            >
              <div
                  class="site-wrap relative w-full h-full min-w-0 min-h-0"
                  :class="isEditMode ? 'overflow-visible' : 'overflow-visible rounded-[18px]'"
              >
                <TileHost
                    :tile="item"
                    :isEditMode="isEditMode"
                    :density="store.config.theme.density"
                    :cardSpanW="isCanvasLayout(group) ? getCanvasItemSize(item, getGroupMetrics(group)).w : Number(props.siteCardW || store.config.theme.siteCard?.w || 3)"
                    :cardSpanH="isCanvasLayout(group) ? getCanvasItemSize(item, getGroupMetrics(group)).h : Number(props.siteCardH || store.config.theme.siteCard?.h || 1)"
                    :priority="group.id === activeGroupId ? 'high' : 'low'"
                    :showWidgetName="!!store.config.theme.showWidgetName"
                    @contextmenu="(e:any) => handleItemContextMenu(e, item, group.id)"
                    @site-pointerdown="(e:any) => handleSitePointerDown(e, item, group.id)"
                    @site-pointermove="(e:any) => handleSitePointerMove(e)"
                    @site-pointerup="(e:any) => handleSitePointerEnd(e)"
                    @site-pointercancel="(e:any) => handleSitePointerEnd(e)"
                    @site-pointerleave="(e:any) => handleSitePointerEnd(e)"
                    @site-click-capture="(e:any) => handleSiteClickCapture(e, item)"
                />

                <!-- 删除按钮：主题适配 + neon/hover -->
                <button
                    v-if="isEditMode"
                    class="delete-btn ignore-drag"
                    :title="`移除${getItemKindLabel(item)}：${getItemTitle(item)}`"
                    :aria-label="`移除${getItemKindLabel(item)}：${getItemTitle(item)}`"
                    @click.stop="askDelete(group.id, item.id)"
                >
                  <PhX size="12" weight="bold" aria-hidden="true"/>
                </button>

                <button
                    v-if="isEditMode && isCanvasLayout(group)"
                    type="button"
                    class="canvas-resize-handle ignore-drag"
                    title="拖动调整卡片尺寸"
                    aria-label="拖动调整卡片尺寸"
                    @pointerdown.stop="(e:any) => startCanvasGesture(e, group, item, 'resize')"
                >
                  <span aria-hidden="true">↘</span>
                </button>
              </div>
            </div>

            <!-- 新增卡片 -->
            <div :style="{ gridColumn: 'span 1', gridRow: 'span 1' }"
                 class="site-tile ignore-drag flex flex-col items-center justify-start">
              <AddCard
                  class="ignore-drag"
                  :size="Number(store.config.theme.iconSize)"
                  :radius="Number(store.config.theme.radius)"
                  :showName="!!store.config.theme.showIconName"
                  :textSize="Number(store.config.theme.iconTextSize)"
                  @click="openAddDialog(group.id)"
                  role="button"
                  tabindex="0"
                  :aria-label="`向${group.title}分组添加网站`"
                  @keydown.enter.prevent="openAddDialog(group.id)"
                  @keydown.space.prevent="openAddDialog(group.id)"
              />
            </div>
          </VueDraggable>
        </div>
      </template>
    </div>

    <ConfirmDialog
        :show="deleteDialogOpen"
        title="移除这个项目？"
        :message="['确认后会先从当前分组移除，', '你可以在通知中点击撤销恢复。']"
        confirmText="移除"
        cancelText="取消"
        :danger="true"
        @cancel="cancelDelete"
        @confirm="confirmDelete"
    >
      <template #icon>
        <PhTrash :size="32" weight="duotone" aria-hidden="true"/>
      </template>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
/* ---------------------------------
 * 拖拽 ghost：主题色
 * --------------------------------- */
.sortable-ghost {
  opacity: 0.35;
  background: rgba(var(--accent-color-rgb), 0.22);
  border: 1px solid rgba(var(--accent-color-rgb), 0.35);
  border-radius: 16px;
  filter: grayscale(20%);
}

/* ---------------------------------
 * 编辑模式：网格容器（替代 bg-white/5 这类写死）
 * --------------------------------- */
.edit-grid-shell {
  background: rgba(var(--accent-color-rgb), 0.06);
  border: 1px dashed rgba(var(--accent-color-rgb), 0.22);
  border-radius: 18px;
  padding: 16px;
}

/* neon 模式时编辑容器轻微发光 */
:global(.theme-neon) .edit-grid-shell {
  box-shadow: 0 0 22px rgba(var(--accent-color-rgb), 0.10);
  border-color: rgba(var(--accent-color-rgb), 0.28);
}

/* ---------------------------------
 * 编辑模式：分组标题
 * --------------------------------- */
.group-edit-title {
  color: var(--accent-color);
}

.group-edit-bar {
  background: var(--accent-color);
}

/* ---------------------------------
 * 进入动画
 * --------------------------------- */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------------------------------
 * 网格 item hover
 * --------------------------------- */
.site-tile {
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
  isolation: isolate;
}

.canvas-grid-shell {
  position: relative;
  background-image:
      linear-gradient(rgba(var(--accent-color-rgb), 0.075) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--accent-color-rgb), 0.075) 1px, transparent 1px);
  background-size: calc(var(--grid-unit) + var(--grid-gap)) calc(var(--grid-unit) + var(--grid-gap));
  background-position: 16px 16px;
}

.layout-mode-chip,
.layout-compact-btn {
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.22);
  color: var(--text-primary);
  background: rgba(var(--overlay-rgb), 0.16);
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.layout-mode-chip:hover,
.layout-compact-btn:hover {
  border-color: rgba(var(--accent-color-rgb), 0.55);
  background: rgba(var(--accent-color-rgb), 0.14);
  transform: translateY(-1px);
}

.layout-mode-chip.is-canvas {
  color: var(--accent-color);
  border-color: rgba(var(--accent-color-rgb), 0.55);
  background: rgba(var(--accent-color-rgb), 0.18);
}

.layout-compact-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  transform: none;
}

.site-tile:hover {
  transform: translateY(-3px) scale(1.035);
  z-index: 10;
}

.site-tile.arrange-mode:hover {
  transform: translateY(-2px) scale(1.01);
}

.canvas-arrange-mode {
  touch-action: none;
  cursor: grab;
}

.canvas-arrange-mode:active {
  cursor: grabbing;
}

.canvas-resize-handle {
  position: absolute;
  right: -7px;
  bottom: -7px;
  z-index: 51;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.5);
  color: var(--text-primary);
  background: rgba(var(--overlay-rgb), 0.54);
  box-shadow: 0 7px 18px rgba(15, 23, 42, 0.18);
  cursor: nwse-resize;
  font-size: 14px;
  line-height: 1;
  touch-action: none;
}

.canvas-resize-handle:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.18);
}

/* ---------------------------------
 * Widget overlay 名称 pill：主题适配（替代 bg-black/35 + text-white）
 * --------------------------------- */
.widget-name-pill {
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;

  /* 用 overlay 系统（light 是白雾，dark 是黑雾） */
  background: rgba(var(--overlay-rgb), 0.25);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);

  color: var(--text-primary);
}

/* ---------------------------------
 * 删除按钮：主题适配 + hover 走危险色
 * --------------------------------- */
.delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 50;

  width: 24px;
  height: 24px;
  border-radius: 999px;

  display: flex;
  align-items: center;
  justify-content: center;

  /* 默认：中性面板色 */
  background: rgba(127, 127, 127, 0.22);
  border: 1px solid rgba(127, 127, 127, 0.28);
  color: var(--text-primary);

  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.92); /* red-500 */
  border-color: rgba(239, 68, 68, 0.92);
  transform: scale(1.1);
  box-shadow: 0 10px 22px rgba(239, 68, 68, 0.22);
}

/* neon 模式下：删除按钮 hover 更亮一点 */
:global(.theme-neon) .delete-btn:hover {
  box-shadow: 0 10px 22px rgba(239, 68, 68, 0.24),
  0 0 16px rgba(239, 68, 68, 0.22);
}
</style>
