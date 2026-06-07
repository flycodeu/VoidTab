<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref, computed, CSSProperties, watch} from "vue";
import {VueDraggable} from "vue-draggable-plus";
import {useDebounceFn} from "@vueuse/core";

// Stores
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useUiStore} from "../../../stores/ui/useUiStore.ts";
import {useStateStore} from "../../../stores/useStateStore.ts";

// Components
import GlassCard from "./GlassCard.vue";
import WidgetCard from "../../widgets/components/WidgetCard.vue";
import AddCard from "./AddCard.vue";
import GroupHeaderBar from "../../widgets/components/widget-panel/GroupHeaderBar.vue";
import ConfirmDialog from "../../../shared/ui/dialogs/ConfirmDialog.vue";
import EmptyState from "../../../shared/ui/EmptyState.vue";
import {PhPlus, PhSquaresFour, PhTrash, PhX} from "@phosphor-icons/vue";

// Composables
import {useVisibleGroups} from "../composables/useVisibleGroups.ts";
import {useToast} from "../../../shared/composables/useToast.ts";
import {queueSiteIconPreload, type SiteIconPreloadHandle} from "../../../shared/utils/iconPreloader.ts";

// Types
import type {GroupSortKey} from "../../../core/config/types.ts";
import {getWidgetLabel} from "../../../core/registry/widgets.ts";

type LayoutItem = any;
type LayoutGroup = {
  id: string;
  title: string;
  items: LayoutItem[];
  sortKey?: GroupSortKey;
};

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
const gridCols = ref(8);
let ro: ResizeObserver | null = null;
let onWindowResize: (() => void) | null = null;

const widgetLabelH = computed(() => {
  if (!store.config.theme.showWidgetName && !store.config.theme.showIconName) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});

const cellBaseSize = computed(() => Number(store.config.theme.iconSize || 72));

const gridRowHeight = computed(() => cellBaseSize.value + widgetLabelH.value + 8);

const getWidgetTitle = (item: any) => {
  const raw = (item.title || "").trim();
  if (raw) return raw;
  return getWidgetLabel(item.widgetType);
};

const getItemTitle = (item: any) => {
  if (!item) return "未命名项目";
  if (item.kind === "widget") return getWidgetTitle(item);
  return (item.title || "").trim() || "未命名网站";
};

const getItemKindLabel = (item: any) => item?.kind === "widget" ? "组件" : "网站";

const isGroupEmpty = (group: LayoutGroup) => !Array.isArray(group.items) || group.items.length === 0;

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

  const gap = Number(store.config.theme.gap || 20);

  if (isMobile.value) {
    gridCols.value = mobileCols.value;
    return;
  }

  const MAX_COLS_DESKTOP = 14;
  const minDesktopCols = width < 560 ? 3 : 4;
  const siteMinCellWidth = cellBaseSize.value + 24;

  let siteCols = Math.floor((width + gap) / (siteMinCellWidth + gap));
  siteCols = Math.max(minDesktopCols, Math.min(siteCols, MAX_COLS_DESKTOP));

  gridCols.value = siteCols;
}

const recalcGridDebounced = useDebounceFn(() => recalcGrid(), 150, {maxWait: 300});

const onMqChange = () => {
  isMobile.value = !!mq?.matches;
  recalcGrid();
};

onMounted(() => {
  mq = window.matchMedia("(max-width: 767px)");
  onWindowResize = () => {
    viewportW.value = window.innerWidth;
    recalcGridDebounced();
  };
  window.addEventListener("resize", onWindowResize, {passive: true});
  onMqChange();
  mq.addEventListener?.("change", onMqChange);

  ro = new ResizeObserver(() => recalcGridDebounced());
  if (gridHostEl.value) ro.observe(gridHostEl.value);
});

onBeforeUnmount(() => {
  iconPreloadDisposed = true;
  cancelIconPreloadBatches();
  mq?.removeEventListener?.("change", onMqChange);
  ro?.disconnect();
  if (onWindowResize) window.removeEventListener("resize", onWindowResize);
  resetLongPressState();
  suppressNextSiteClick = null;
  ro = null;
  onWindowResize = null;
});

watch(
    () => [store.config.theme.iconSize, store.config.theme.gap, store.config.theme.siteLayoutMode, store.config.theme.gridMaxWidth],
    () => recalcGridDebounced()
);

const gridShellStyle = computed<CSSProperties>(() => {
  const safeDesktopWidth = Math.max(420, viewportW.value - 48);
  const maxWidth = isMobile.value ? "100%" : `${Math.min(Number(store.config.theme.gridMaxWidth || 1600), safeDesktopWidth)}px`;
  return {maxWidth};
});

/** 网格容器样式 */
const densityStyle = computed<CSSProperties>(() => {
  const gap = Number(store.config.theme.gap || 20);

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols.value}, 1fr)`,
    gridAutoRows: `${gridRowHeight.value}px`,
    gap: `${gap}px`,
    width: '100%',
    minWidth: 0,
    justifyItems: 'center',
    alignItems: 'start',
    gridAutoFlow: 'dense',
    paddingBottom: '40px',
  };
});
const densityItemClass = computed(() => `density-mode-${store.config.theme.density || "normal"}`);

const PRELOAD_CURRENT_GROUP_LIMIT = 48;
const PRELOAD_NEIGHBOR_GROUP_LIMIT = 36;
let primaryIconPreload: SiteIconPreloadHandle | null = null;
let secondaryIconPreload: SiteIconPreloadHandle | null = null;
let iconPreloadDisposed = false;

const isAutoIconSiteItem = (item: LayoutItem) => {
  if (!item || item.kind === "widget") return false;
  const iconType = item.iconType || "auto";
  return iconType === "auto" && typeof item.url === "string" && item.url.trim().length > 0;
};

const collectAutoIconUrls = (groups: LayoutGroup[], limit: number) => {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group.items || []) {
      if (!isAutoIconSiteItem(item)) continue;
      const url = String(item.url || "").trim();
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

  const currentGroup = activeGroupData.value;
  const currentUrls = collectAutoIconUrls(currentGroup ? [currentGroup] : [], PRELOAD_CURRENT_GROUP_LIMIT);
  if (currentUrls.length) {
    primaryIconPreload = queueSiteIconPreload(currentUrls, runtime, {
      concurrency: isMobile.value ? 3 : 5,
      fastFirst: true,
      fastTimeoutMs: 650,
      timeoutMs: 1400,
      browserWarm: true,
      browserWarmLimit: 3,
      backgroundUpgrade: false,
      idleTimeoutMs: 250,
    });
  }

  const neighborUrls = collectAutoIconUrls(getNeighborGroups(), PRELOAD_NEIGHBOR_GROUP_LIMIT);
  if (neighborUrls.length) {
    secondaryIconPreload = queueSiteIconPreload(neighborUrls, runtime, {
      concurrency: 2,
      fastFirst: true,
      fastTimeoutMs: 850,
      timeoutMs: 1800,
      browserWarm: true,
      browserWarmLimit: 2,
      backgroundUpgrade: false,
      idleTimeoutMs: 1600,
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
      return `${group.id}:${group.items?.length || 0}:${sample}`;
    }).join("|"),
  ].join("::");
});

watch(iconPreloadSignature, () => scheduleIconPreloadBatches(), {immediate: true, flush: "post"});

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const MAX_W = 4;
const MAX_H = 4;

const getItemStyle = (item: any) => {
  const isWidget = item.kind === "widget";
  const mode = store.config.theme.siteLayoutMode || 'icon';

  // Site：根据主题选择占格（widget 不动）
  if (!isWidget) {
    if (mode === 'card') {
      const w = clamp(Number(props.siteCardW || store.config.theme.siteCard?.w || 3), 1, MAX_W);
      const h = clamp(Number(props.siteCardH || store.config.theme.siteCard?.h || 1), 1, MAX_H);
      const spanW = isMobile.value ? Math.min(w, mobileCols.value) : Math.min(w, gridCols.value);
      const spanH = Math.min(h, MAX_H);

      return {
        gridColumn: `span ${spanW}`,
        gridRow: `span ${spanH}`,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
      };
    }

    // icon 模式：保持原样 1×1
    return {
      gridColumn: `span 1`,
      gridRow: `span 1`,
      width: "100%",
      height: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
    };
  }

  // Widget：保持原来的逻辑
  const wRaw = Number(item.w || 2);
  const hRaw = Number(item.h || 2);
  const w = clamp(wRaw, 1, MAX_W);
  const h = clamp(hRaw, 1, MAX_H);

  const spanW = isMobile.value ? Math.min(w, mobileCols.value) : Math.min(w, gridCols.value);

  return {
    gridColumn: `span ${spanW}`,
    gridRow: `span ${h}`,
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
  };
};

const widgetNameMode = (item: any) => {
  if (!store.config.theme.showWidgetName) return "none";
  if (item.kind !== "widget") return "none";
  const h = Math.max(1, Number(item.h || 1));
  if (h === 1) return "overlay";
  return "below";
};

/** ----------------------------------------------------------------
 * 排序与拖拽
 * ---------------------------------------------------------------- */
const getSortKey = (group: LayoutGroup): GroupSortKey => (group.sortKey || "custom") as GroupSortKey;

const getDisplayItems = (group: LayoutGroup): LayoutItem[] => {
  const key = getSortKey(group);
  if (key === "custom") return group.items;

  const items = [...group.items];
  if (key === "name") {
    return items.sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-CN"));
  }
  if (key === "lastVisited") {
    return items.sort((a, b) => {
      const timeA = statsStore.getLastVisited(a.id);
      const timeB = statsStore.getLastVisited(b.id);
      if (timeB !== timeA) return timeB - timeA;
      return (a.title || "").localeCompare(b.title || "", "zh-CN");
    });
  }
  return items;
};

const canFreeReorder = (group: LayoutGroup) => !props.isEditMode && getSortKey(group) === "custom";

const modelValueOf = (group: LayoutGroup) => (props.isEditMode ? group.items : getDisplayItems(group));

const updateModelValue = (group: LayoutGroup, val: LayoutItem[]) => {
  if (props.isEditMode) {
    group.items = val;
    store.saveConfig();
    return;
  }
  if (getSortKey(group) === "custom") {
    group.items = val;
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
  if (!item || item.kind === "widget") return;
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
  const type = item.kind === "widget" ? "widget" : "site";
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

const cloneLayoutItem = (item: LayoutItem) => {
  if (typeof structuredClone === "function") return structuredClone(item);
  return JSON.parse(JSON.stringify(item));
};

const cancelDelete = () => {
  deleteDialogOpen.value = false;
  deleteTarget.value = null;
};

const askDelete = (groupId: string, itemId: string) => {
  const group = findGroupById(groupId);
  const item = group?.items.find((entry) => entry.id === itemId);
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

  if (group.items.some((item) => item.id === snapshot.item.id)) {
    toast.info(`「${snapshot.title}」已经在分组中。`);
    ui.announce(`${snapshot.title}已经在分组中`);
    return;
  }

  const index = Math.max(0, Math.min(snapshot.index, group.items.length));
  group.items.splice(index, 0, cloneLayoutItem(snapshot.item));
  void store.saveConfig();

  toast.success(`已恢复「${snapshot.title}」。`);
  ui.announce(`已恢复${snapshot.kindLabel}${snapshot.title}`);
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;

  const {groupId, itemId} = deleteTarget.value;
  const group = findGroupById(groupId);
  const index = group?.items.findIndex((item) => item.id === itemId) ?? -1;
  const item = index >= 0 ? group?.items[index] : null;

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
              :count="group.items?.length || 0"
              :sort-key="getSortKey(group)"
              @update:sortKey="(key) => store.updateGroupSort(group.id, key)"
              :key="`header-${group.id}`"
          />

          <!-- 编辑模式分组标题：主题色 + 主题面板变量 -->
          <div
              v-if="isEditMode"
              class="group-edit-title px-2 mb-3 font-bold tracking-wider text-sm flex items-center gap-2 select-none"
          >
            <div class="w-1 h-4 rounded-full group-edit-bar"></div>
            {{ group.title }}
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
              :class="[{ 'edit-grid-shell': isEditMode }]"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="densityStyle"
              :disabled="!isEditMode && !canFreeReorder(group)"
              @contextmenu.prevent.self="handleBlankContextMenu($event, group.id)"
              role="list"
              :aria-label="`${group.title}内容网格`"
          >
            <div
                v-for="item in modelValueOf(group)"
                :key="item.id"
                :style="getItemStyle(item)"
                class="site-tile relative"
                :class="[{ 'arrange-mode': isEditMode }, densityItemClass]"
                role="listitem"
            >
              <div
                  class="site-wrap relative w-full h-full min-w-0 min-h-0"
                  :class="isEditMode ? 'overflow-visible' : 'overflow-visible rounded-[18px]'"
              >
                <div v-if="item.kind === 'widget'" class="w-full h-full overflow-hidden rounded-[18px]">
                  <WidgetCard
                      :item="item"
                      :isEditMode="isEditMode"
                      @contextmenu.prevent.stop="(e:any) => handleItemContextMenu(e, item, group.id)"
                  />

                  <!-- overlay 名称：用主题变量，不再写死黑底白字 -->
                  <div
                      v-if="widgetNameMode(item) === 'overlay'"
                      class="absolute left-2 right-2 bottom-2 flex justify-center pointer-events-none z-10"
                  >
                    <div class="widget-name-pill max-w-full truncate">
                      {{ getWidgetTitle(item) }}
                    </div>
                  </div>
                </div>

                <div
                    v-else
                    class="w-full h-full flex flex-col items-center justify-start"
                    @pointerdown="(e:any) => handleSitePointerDown(e, item, group.id)"
                    @pointermove="(e:any) => handleSitePointerMove(e)"
                    @pointerup="(e:any) => handleSitePointerEnd(e)"
                    @pointercancel="(e:any) => handleSitePointerEnd(e)"
                    @pointerleave="(e:any) => handleSitePointerEnd(e)"
                    @click.capture="(e:any) => handleSiteClickCapture(e, item)"
                >
                  <GlassCard
                      :item="item"
                      :isEditMode="isEditMode"
                      :density="store.config.theme.density"
                      :cardSpanW="Number(props.siteCardW || store.config.theme.siteCard?.w || 3)"
                      :cardSpanH="Number(props.siteCardH || store.config.theme.siteCard?.h || 1)"
                      :priority="group.id === activeGroupId ? 'high' : 'low'"
                      @contextmenu.prevent.stop="(e:any) => handleItemContextMenu(e, item, group.id)"
                  />
                </div>

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

.site-tile:hover {
  transform: translateY(-3px) scale(1.035);
  z-index: 10;
}

.site-tile.arrange-mode:hover {
  transform: translateY(-2px) scale(1.01);
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
