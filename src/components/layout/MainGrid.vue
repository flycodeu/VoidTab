<script setup lang="ts">
import {computed, inject, ref} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import GlassCard from '../layout/GlassCard.vue';
import {VueDraggable} from 'vue-draggable-plus';
import {PhPlus, PhTrash} from '@phosphor-icons/vue';

// 接收 App.vue 传来的 isEditMode
defineProps<{
  activeGroupId: string;
  isEditMode: boolean;
}>();

const store = useConfigStore();
const {openAddDialog} = inject('dialog') as any;

// 网格布局计算
const gridStyle = computed(() => {
  const size = Number(store.config.theme.iconSize) || 60;
  const gap = Number(store.config.theme.gap) || 20;
  const colMinSize = size + 16;

  return {
    gap: `${gap}px`,
    gridTemplateColumns: `repeat(auto-fill, minmax(${colMinSize}px, 1fr))`
  };
});

const itemContainerStyle = computed(() => ({
  width: '100%',
  display: 'flex',
  justifyContent: 'center'
}));

// 拖拽逻辑
const onDragStart = (event: any, group: any) => {
  const item = group.items[event.oldIndex];
  if (item) store.setDragState(true, group.id, item);
};

const onDragEnd = () => {
  setTimeout(() => store.setDragState(false), 200);
};

// 右键菜单
const handleContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  store.openContextMenu(e, item, 'site', groupId);
};

//  自定义删除弹窗逻辑
const showDeleteModal = ref(false);
const deleteTarget = ref<{ groupId: string, siteId: string } | null>(null);

const handleDelete = (groupId: string, siteId: string) => {
  // 1. 记录要删除的对象
  deleteTarget.value = {groupId, siteId};
  // 2. 打开自定义弹窗 (不再使用 confirm)
  showDeleteModal.value = true;
};

const confirmDelete = () => {
  if (deleteTarget.value) {
    store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
    // 关闭弹窗
    showDeleteModal.value = false;
    deleteTarget.value = null;
  }
};
</script>

<template>
  <div class="w-full flex flex-col items-center pb-20">

    <div class="w-full transition-all duration-300 px-4" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">
      <template v-for="group in store.config.layout" :key="group.id">
        <div
            v-show="isEditMode || group.id === activeGroupId || (store.dragState.isDragging && store.dragState.fromGroupId === group.id)"
            class="transition-all duration-300"
            :class="[(isEditMode || group.id === activeGroupId) ? 'mb-8 animate-fade-in' : '', (!isEditMode && group.id !== activeGroupId && store.dragState.isDragging) ? 'fixed top-[-9999px] z-[-1]' : '']">

          <div v-if="isEditMode"
               class="px-2 mb-3 text-[var(--accent-color)] font-bold tracking-wider text-sm flex items-center gap-2">
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
          >
            <div v-for="item in group.items" :key="item.id" :style="itemContainerStyle">
              <GlassCard
                  :item="item"
                  :isEditMode="isEditMode"
                  @delete="handleDelete(group.id, item.id)"
                  @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"
              />
            </div>

            <div class="ignore-drag" :style="itemContainerStyle" @click="openAddDialog(group.id)">
              <div
                  class="flex flex-col items-center gap-2 cursor-pointer group hover:-translate-y-1 transition-transform p-1 rounded-xl">
                <div
                    class="add-card flex items-center justify-center transition-all group-hover:shadow-lg group-hover:brightness-110"
                    :style="{ width: store.config.theme.iconSize + 'px', height: store.config.theme.iconSize + 'px', borderRadius: store.config.theme.radius + 'px' }">
                  <PhPlus :size="Number(store.config.theme.iconSize) * 0.5" weight="light"
                          class="text-gray-400 group-hover:text-[var(--accent-color)] transition-colors"/>
                </div>
                <span v-if="store.config.theme.showIconName"
                      class="font-bold text-center leading-tight opacity-50 group-hover:opacity-100 transition-opacity truncate"
                      :style="{ width: (Number(store.config.theme.iconSize) + 16) + 'px', fontSize: store.config.theme.iconTextSize + 'px', color: 'var(--text-primary)' }">添加</span>
              </div>
            </div>
          </VueDraggable>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <Transition name="modal-scale">
        <div v-if="showDeleteModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
               @click="showDeleteModal = false"></div>

          <div
              class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
              style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);">

            <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-1">
              <PhTrash :size="32" weight="duotone"/>
            </div>

            <div>
              <h3 class="text-xl font-bold mb-2">确认删除?</h3>
              <p class="text-sm opacity-60 leading-relaxed">删除后无法恢复，<br>确定要移除这个图标吗？</p>
            </div>

            <div class="grid grid-cols-2 gap-3 w-full mt-2">
              <button @click="showDeleteModal = false"
                      class="py-3.5 rounded-2xl font-bold transition-all bg-white/5 hover:bg-white/10 active:scale-95 text-white/80">
                取消
              </button>
              <button @click="confirmDelete"
                      class="py-3.5 rounded-2xl font-bold transition-all bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-lg shadow-red-500/30">
                确认删除
              </button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>

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

/* 弹窗动画 */
.modal-scale-enter-active,
.modal-scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-scale-enter-from,
.modal-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>