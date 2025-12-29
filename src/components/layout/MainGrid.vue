<script setup lang="ts">
import {inject, ref} from 'vue';
import {VueDraggable} from 'vue-draggable-plus';

import {useConfigStore} from '../../stores/useConfigStore';
import {useUiStore} from '../../stores/useUiStore';

import GlassCard from './GlassCard.vue';
import AddCard from './AddCard.vue';

import {useGridLayout} from '../../composables/useGridLayout';
import {useVisibleGroups} from '../../composables/useVisibleGroups';
import ConfirmDialog from '../ui/dialogs/ConfirmDialog.vue';
import {PhTrash} from '@phosphor-icons/vue';
import {useDeleteConfirm} from '../../composables/useDeleteConfirm';

const del = useDeleteConfirm();

const props = defineProps<{
  activeGroupId: string;
  isEditMode: boolean;
}>();

const store = useConfigStore();
const ui = useUiStore();

const dialog = inject('dialog') as { openAddDialog: (gid: string) => void } | undefined;
const openAddDialog = (gid: string) => dialog?.openAddDialog?.(gid);

// grid styles
const {gridStyle, itemContainerStyle} = useGridLayout(store.config.theme);

// groups filter
const {visibleGroups} = useVisibleGroups({
  groups: store.config.layout || [],
  isEditMode: () => props.isEditMode,
  activeGroupId: () => props.activeGroupId,
  dragState: ui.dragState
});

// drag logic
const onDragStart = (event: any, group: any) => {
  const item = group.items?.[event.oldIndex];
  if (item) ui.setDragState(true, group.id, item);
};

const onDragEnd = () => {
  requestAnimationFrame(() => {
    setTimeout(() => ui.setDragState(false), 200);
  });
};

const handleContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  ui.openContextMenu(e, item, 'site', groupId);
};

// delete modal state
const showDeleteModal = ref(false);
const deleteTarget = ref<{ groupId: string; siteId: string } | null>(null);

const handleDelete = (groupId: string, siteId: string, title?: string) => {
  del.open({kind: 'site', groupId, siteId, title});
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;
  store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  showDeleteModal.value = false;
  deleteTarget.value = null;
};
</script>

<template>
  <div class="w-full flex flex-col items-center pb-20">
    <div class="w-full transition-all duration-300 px-4" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">
      <template v-for="group in visibleGroups" :key="group.id">
        <div class="transition-all duration-300 mb-8 animate-fade-in">
          <!-- 编辑模式显示 group 标题 -->
          <div
              v-if="isEditMode"
              class="px-2 mb-3 text-[var(--accent-color)] font-bold tracking-wider text-sm flex items-center gap-2"
          >
            <div class="w-1 h-4 bg-[var(--accent-color)] rounded-full"></div>
            {{ group.title }}
          </div>

          <VueDraggable
              v-model="group.items"
              :animation="200"
              group="voidtab-shared-group"
              filter=".ignore-drag"
              class="grid items-start content-start min-h-[100px]"
              :class="{ 'bg-white/5 rounded-xl border border-dashed border-white/10 p-4': isEditMode }"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="gridStyle"
              :disabled="!isEditMode"

              :scroll="true"
              :scrollSensitivity="90"
              :scrollSpeed="14"
          >
            <div
                v-for="item in group.items"
                :key="item.id"
                :style="itemContainerStyle"
                class="site-tile"
                :class="{ 'arrange-mode': isEditMode }"
            >
              <div class="site-wrap">
                <GlassCard
                    class="site-card-root"
                    :item="item"
                    :isEditMode="isEditMode"
                    @delete="handleDelete(group.id, item.id, item.title)"
                    @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"
                />
              </div>
            </div>

            <!-- 添加卡片 -->
            <div :style="itemContainerStyle" class="site-tile ignore-drag" :class="{ 'arrange-mode': isEditMode }">
              <div class="site-wrap">
                <AddCard
                    class="ignore-drag"
                    :size="Number(store.config.theme.iconSize)"
                    :radius="Number(store.config.theme.radius)"
                    :showName="!!store.config.theme.showIconName"
                    :textSize="Number(store.config.theme.iconTextSize)"
                    @click="openAddDialog(group.id)"
                />
              </div>
            </div>
          </VueDraggable>
        </div>
      </template>
    </div>

    <ConfirmDialog
        :show="showDeleteModal"
        title="确认删除？"
        :message="['删除后无法恢复，', '确定要移除这个图标吗？']"
        confirmText="确认删除"
        cancelText="取消"
        :danger="true"
        @cancel="showDeleteModal = false"
        @confirm="confirmDelete"
    >
      <template #icon>
        <PhTrash :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.sortable-ghost {
  opacity: 0.4;
  background: var(--accent-color);
  border-radius: 16px;
  filter: grayscale(100%);
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ✅ 轻 hover（不夸张） */
.site-tile {
  transition: transform 120ms ease;
  will-change: transform;
}

.site-tile:hover {
  transform: translateY(-1px);
}

/* ✅ 关键：默认“完全透明”，只在 hover / 整理模式给极轻微色差 */
.site-wrap {
  border-radius: 18px;
  padding: 6px;

  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

/* hover 才出现一点点差异（非常克制） */
.site-tile:hover .site-wrap {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
}

:global(.dark) .site-tile:hover .site-wrap {
  background: rgba(0, 0, 0, 0.10);
  border-color: rgba(255, 255, 255, 0.06);
}

.arrange-mode .site-wrap {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.07);
}

:global(.dark) .arrange-mode .site-wrap {
  background: rgba(0, 0, 0, 0.12);
  border-color: rgba(255, 255, 255, 0.08);
}


:deep(.site-card-root) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}


.arrange-mode :deep([class*="bg-red"]) {
  display: none !important;
}

.arrange-mode :deep([class*="bg-rose"]) {
  display: none !important;
}

.arrange-mode :deep(button[title*="编辑"]),
.arrange-mode :deep(button[aria-label*="编辑"]),
.arrange-mode :deep(button[title*="Edit"]),
.arrange-mode :deep(button[aria-label*="Edit"]) {
  display: none !important;
}
</style>
