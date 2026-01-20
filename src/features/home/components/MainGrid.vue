<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref, computed, CSSProperties} from "vue";
import {VueDraggable} from "vue-draggable-plus";

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
import {PhTrash, PhX} from "@phosphor-icons/vue";

// Composables
import {useVisibleGroups} from "../composables/useVisibleGroups.ts";

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
}>();

const store = useConfigStore();
const ui = useUiStore();
const statsStore = useStateStore();

const dialog = inject("dialog") as { openAddDialog: (gid: string) => void } | undefined;
const openAddDialog = (gid: string) => dialog?.openAddDialog?.(gid);

const {visibleGroups} = useVisibleGroups({
  groups: () => store.config.layout || [],
  isEditMode: () => props.isEditMode,
  activeGroupId: () => props.activeGroupId,
  dragState: ui.dragState,
});

const activeGroupData = computed(() => {
  return (store.config.layout as any[]).find((g) => g.id === props.activeGroupId) as LayoutGroup | undefined;
});

const currentSortKey = computed<GroupSortKey>(() => (activeGroupData.value?.sortKey || "custom") as GroupSortKey);

/** ----------------------------------------------------------------
 * 严格网格系统 (Strict Grid System)
 * ---------------------------------------------------------------- */
const isMobile = ref(false);
let mq: MediaQueryList | null = null;
const MOBILE_COLS = 4;

const gridHostEl = ref<HTMLElement | null>(null);
const gridCols = ref(8);
let ro: ResizeObserver | null = null;

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

function recalcGrid() {
  const el = gridHostEl.value;
  if (!el) return;

  const width = el.clientWidth;
  if (width <= 0) return;

  const gap = Number(store.config.theme.gap || 20);

  if (isMobile.value) {
    gridCols.value = MOBILE_COLS;
    return;
  }

  const MAX_COLS_DESKTOP = 14;
  const minCellWidth = cellBaseSize.value + 10;

  let cols = Math.floor((width + gap) / (minCellWidth + gap));
  cols = Math.max(4, Math.min(cols, MAX_COLS_DESKTOP));

  gridCols.value = cols;
}

const onMqChange = () => {
  isMobile.value = !!mq?.matches;
  recalcGrid();
};

onMounted(() => {
  mq = window.matchMedia("(max-width: 767px)");
  onMqChange();
  mq.addEventListener?.("change", onMqChange);

  ro = new ResizeObserver(() => requestAnimationFrame(() => recalcGrid()));
  if (gridHostEl.value) ro.observe(gridHostEl.value);
});

onBeforeUnmount(() => {
  mq?.removeEventListener?.("change", onMqChange);
  ro?.disconnect();
  ro = null;
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

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const MAX_W = 4;
const MAX_H = 4;

const getItemStyle = (item: any) => {
  const isWidget = item.kind === "widget";

  // Site：根据主题选择占格（widget 不动）
  if (!isWidget) {
    const mode = store.config.theme.siteLayoutMode || 'icon';

    if (mode === 'card') {
      const w = clamp(Number(store.config.theme.siteCard?.w || 3), 1, MAX_W);
      //const h = clamp(Number(store.config.theme.siteCard?.h || 1), 1, MAX_H);
      const spanW = isMobile.value ? Math.min(w, MOBILE_COLS) : Math.min(w, gridCols.value);

      return {
        gridColumn: `span ${spanW}`,
        gridRow: `span 1`,
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

  const spanW = isMobile.value ? Math.min(w, MOBILE_COLS) : Math.min(w, gridCols.value);

  return {
    gridColumn: `span ${spanW}`,
    gridRow: `span ${h}`,
    width: "100%",
    height: "100%",
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

const handleBlankContextMenu = (e: MouseEvent, groupId: string) => {
  ui.openContextMenu(e, null, "blank", groupId);
};
const handleItemContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  const type = item.kind === "widget" ? "widget" : "site";
  ui.openContextMenu(e, item, type, groupId);
};

const deleteDialogOpen = ref(false);
const deleteTarget = ref<{ groupId: string; siteId: string } | null>(null);

const askDelete = (groupId: string, siteId: string) => {
  deleteTarget.value = {groupId, siteId};
  deleteDialogOpen.value = true;
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;
  store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  deleteDialogOpen.value = false;
  deleteTarget.value = null;
};
</script>

<template>
  <div
      class="w-full flex flex-col items-center md:pb-20"
      :style="{ paddingBottom: `calc(env(safe-area-inset-bottom) + 96px)` }"
  >
    <div
        class="w-full transition-all duration-300 px-2 md:px-8 overflow-x-hidden"
        :style="{ maxWidth: isMobile ? '100%' : store.config.theme.gridMaxWidth + 'px' }"
        ref="gridHostEl"
    >
      <GroupHeaderBar
          v-if="!isEditMode && activeGroupData"
          :group-name="activeGroupData.title"
          :count="activeGroupData.items?.length || 0"
          :sort-key="currentSortKey"
          @update:sortKey="(key) => store.updateGroupSort(activeGroupId, key)"
          :key="activeGroupId"
      />

      <template v-for="group in (visibleGroups as any)" :key="group.id">
        <div class="transition-all duration-300 mb-8 animate-fade-in w-full">
          <!-- 编辑模式分组标题：主题色 + 主题面板变量 -->
          <div
              v-if="isEditMode"
              class="group-edit-title px-2 mb-3 font-bold tracking-wider text-sm flex items-center gap-2 select-none"
          >
            <div class="w-1 h-4 rounded-full group-edit-bar"></div>
            {{ group.title }}
          </div>

          <VueDraggable
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
          >
            <div
                v-for="item in modelValueOf(group)"
                :key="item.id"
                :style="getItemStyle(item)"
                class="site-tile relative"
                :class="[{ 'arrange-mode': isEditMode }, densityItemClass]"
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

                <div v-else class="w-full h-full flex flex-col items-center justify-start">
                  <GlassCard
                      :item="item"
                      :isEditMode="isEditMode"
                      :density="store.config.theme.density"
                      @contextmenu.prevent.stop="(e:any) => handleItemContextMenu(e, item, group.id)"
                  />
                </div>

                <!-- 删除按钮：主题适配 + neon/hover -->
                <button
                    v-if="isEditMode"
                    class="delete-btn ignore-drag"
                    title="删除"
                    @click.stop="askDelete(group.id, item.id)"
                >
                  <PhX size="12" weight="bold"/>
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
              />
            </div>
          </VueDraggable>
        </div>
      </template>
    </div>

    <ConfirmDialog
        :show="deleteDialogOpen"
        title="确认删除？"
        :message="['删除后无法恢复，', '确定要移除这个图标吗？']"
        confirmText="确认删除"
        cancelText="取消"
        :danger="true"
        @cancel="deleteDialogOpen = false"
        @confirm="confirmDelete"
    >
      <template #icon>
        <PhTrash :size="32" weight="duotone"/>
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
  transition: transform 120ms ease;
  will-change: transform;
  isolation: isolate;
}

.site-tile:hover {
  transform: translateY(-2px);
  z-index: 10;
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
