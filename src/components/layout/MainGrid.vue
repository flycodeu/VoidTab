<script setup lang="ts">
import {ref, inject, computed} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import GlassCard from '../ui/GlassCard.vue';
import {VueDraggable} from 'vue-draggable-plus';
import {PhPlus, PhSquaresFour, PhList} from '@phosphor-icons/vue';

defineProps<{ activeGroupId: string }>();
const store = useConfigStore();
const {openAddDialog} = inject('dialog') as any;

const isManageMode = ref(false);

// ✨✨✨ 核心修复：强制转为 Number，防止字符串拼接导致的布局崩溃 ✨✨✨
const gridStyle = computed(() => {
  const size = Number(store.config.theme.iconSize) || 60;
  const gap = Number(store.config.theme.gap) || 20;

  // 紧凑对齐：每个格子只比图标大 16px
  const colMinSize = size + 16;

  return {
    gap: `${gap}px`,
    // 自动填充网格
    gridTemplateColumns: `repeat(auto-fill, minmax(${colMinSize}px, 1fr))`
  };
});

// 统一的容器样式
const itemContainerStyle = computed(() => ({
  width: '100%',
  display: 'flex',
  justifyContent: 'center'
}));

const onDragStart = (event: any, group: any) => {
  const item = group.items[event.oldIndex];
  if (item) store.setDragState(true, group.id, item);
};

const onDragEnd = () => {
  setTimeout(() => store.setDragState(false), 200);
};

const handleContextMenu = (e: MouseEvent, item: any, groupId: string) => {
  store.openContextMenu(e, item, 'site', groupId);
};
</script>

<template>
  <div class="w-full flex flex-col items-center pb-20">
    <div class="w-full max-w-[1200px] flex justify-end mb-4 px-4">
      <button @click="isManageMode = !isManageMode"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-all border border-white/5 backdrop-blur-md active:scale-95">
        <component :is="isManageMode ? PhList : PhSquaresFour" size="16"/>
        {{ isManageMode ? '完成' : '整理桌面' }}
      </button>
    </div>

    <div class="w-full transition-all duration-300 px-4" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">
      <template v-for="group in store.config.layout" :key="group.id">
        <div
            v-show="isManageMode || group.id === activeGroupId || (store.dragState.isDragging && store.dragState.fromGroupId === group.id)"
            class="transition-all duration-300"
            :class="[(isManageMode || group.id === activeGroupId) ? 'mb-8 animate-fade-in' : '', (!isManageMode && group.id !== activeGroupId && store.dragState.isDragging) ? 'fixed top-[-9999px] z-[-1]' : '']">

          <div v-if="isManageMode"
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
              :class="{ 'bg-white/5 rounded-xl border border-dashed border-white/10 p-4': isManageMode }"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="gridStyle"
          >
            <div v-for="item in group.items" :key="item.id" :style="itemContainerStyle">
              <GlassCard :item="item" :isEditMode="isManageMode" @delete="store.removeSite(group.id, item.id)"
                         @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"/>
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
</style>