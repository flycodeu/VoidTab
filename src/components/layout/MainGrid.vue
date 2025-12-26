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

// 计算网格列宽：图标大小 + 40px (留给文字和内边距的空间)
// 这样可以保证单元格永远够宽，不会换行
const gridColSize = computed(() => store.config.theme.iconSize + 40);

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
      <button
          @click="isManageMode = !isManageMode"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-all border border-white/5 backdrop-blur-md active:scale-95"
      >
        <component :is="isManageMode ? PhList : PhSquaresFour" size="16"/>
        {{ isManageMode ? '完成' : '整理桌面' }}
      </button>
    </div>

    <div class="w-full transition-all duration-300" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">
      <template v-for="group in store.config.layout" :key="group.id">
        <div
            v-show="isManageMode || group.id === activeGroupId || (store.dragState.isDragging && store.dragState.fromGroupId === group.id)"
            class="transition-all duration-300"
            :class="[
              (isManageMode || group.id === activeGroupId) ? 'mb-8 animate-fade-in' : '',
              (!isManageMode && group.id !== activeGroupId && store.dragState.isDragging) ? 'fixed top-[-9999px] left-[-9999px] opacity-0 pointer-events-none w-0 h-0 overflow-hidden z-[-1]' : ''
            ]"
        >
          <div v-if="isManageMode"
               class="px-4 mb-3 text-[var(--accent-color)] font-bold tracking-wider text-sm flex items-center gap-2">
            <div class="w-1 h-4 bg-[var(--accent-color)] rounded-full"></div>
            {{ group.title }}
          </div>

          <VueDraggable
              v-model="group.items"
              :animation="200"
              group="voidtab-shared-group"
              filter=".ignore-drag"
              class="grid justify-items-center items-start content-start px-4 min-h-[100px]"
              :class="{ 'bg-white/5 rounded-xl border border-dashed border-white/10 p-4': isManageMode }"
              ghost-class="sortable-ghost"
              @start="(e) => onDragStart(e, group)"
              @end="onDragEnd"
              :style="{
                gap: store.config.theme.gap + 'px',
                gridTemplateColumns: `repeat(auto-fill, minmax(${gridColSize}px, 1fr))`
              }"
          >

            <div
                v-for="item in group.items"
                :key="item.id"
                class="w-full flex justify-center"
            >
              <GlassCard
                  :item="item"
                  :isEditMode="isManageMode"
                  @delete="store.removeSite(group.id, item.id)"
                  @contextmenu.prevent.stop="(e:any) => handleContextMenu(e, item, group.id)"
              />
            </div>

            <div
                class="ignore-drag w-full flex justify-center"
                @click="openAddDialog(group.id)"
            >
              <div
                  class="flex flex-col items-center gap-2 cursor-pointer group hover:-translate-y-1 transition-transform p-2 rounded-xl">
                <div
                    class="add-card flex items-center justify-center transition-all group-hover:shadow-lg group-hover:brightness-110"
                    :style="{
                       width: store.config.theme.iconSize + 'px',
                       height: store.config.theme.iconSize + 'px',
                       borderRadius: store.config.theme.radius + 'px'
                     }">
                  <PhPlus :size="store.config.theme.iconSize * 0.5" weight="light"
                          class="text-gray-400 group-hover:text-[var(--accent-color)] transition-colors"/>
                </div>

                <span v-if="store.config.theme.showIconName"
                      class="font-bold text-center leading-tight opacity-50 group-hover:opacity-100 transition-opacity truncate"
                      :style="{
                        width: (store.config.theme.iconSize + 20) + 'px',
                        fontSize: store.config.theme.iconTextSize + 'px',
                        color: 'var(--text-primary)'
                      }">添加</span>
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