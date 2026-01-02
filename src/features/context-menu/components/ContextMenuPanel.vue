<script setup lang="ts">
import {
  PhPencilSimple,
  PhTrash,
  PhFolderNotch,
  PhArrowRight,
  PhCheck,
  PhPlus,
  PhAppWindow,
} from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  styleObj: Record<string, any>;
  menuType: 'site' | 'group' | 'blank' | 'widget' | string;
  groups: any[];
  currentGroupId: string;
  currentGroupName: string;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'move', groupId: string): void;
  (e: 'delete'): void;
  (e: 'resize', w: number, h: number): void;
  (e: 'addSite'): void;
  (e: 'addWidget'): void;
}>();
</script>

<template>
  <Transition name="scale">
    <div
        v-if="show"
        class="context-menu-panel-root fixed z-[99999] min-w-[170px] p-1.5 rounded-xl flex flex-col gap-1
             origin-top-left select-none text-sm font-medium"
        :style="styleObj"
        @click.stop
        @contextmenu.prevent
    >
      <template v-if="menuType === 'blank'">
        <button
            @click="emit('addSite')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
        >
          <PhPlus size="16" class="opacity-70"/>
          添加图标
        </button>

        <button
            @click="emit('addWidget')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
        >
          <PhAppWindow size="16" class="opacity-70"/>
          添加组件
        </button>

        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

        <button
            @click="emit('edit')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full opacity-60"
        >
          <PhPencilSimple size="16"/>
          编辑模式
        </button>
      </template>

      <template v-else-if="menuType === 'site' || menuType === 'widget'">
        <button
            @click="emit('edit')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
        >
          <PhPencilSimple size="16" class="opacity-70"/>
          编辑{{ menuType === 'widget' ? '组件' : '图标' }}
        </button>

        <div class="border-t border-black/5 dark:border-white/10 mt-1 pt-2 px-2 pb-1">
          <div class="text-[10px] opacity-40 mb-1.5 font-bold tracking-wider">布局尺寸</div>
          <div class="grid grid-cols-4 gap-1">
            <button @click="emit('resize', 1, 1)" class="size-btn" title="1x1">
              <div class="w-1.5 h-1.5 bg-current rounded-[1px]"></div>
            </button>
            <button @click="emit('resize', 2, 1)" class="size-btn" title="2x1">
              <div class="w-3 h-1.5 bg-current rounded-[1px]"></div>
            </button>
            <button @click="emit('resize', 1, 2)" class="size-btn" title="1x2">
              <div class="w-1.5 h-3 bg-current rounded-[1px]"></div>
            </button>
            <button @click="emit('resize', 2, 2)" class="size-btn" title="2x2">
              <div class="w-3 h-3 bg-current rounded-[1px]"></div>
            </button>
            <button @click="emit('resize', 4, 2)" class="col-span-4 size-btn h-6" title="4x2 (Wide)">
              <div class="w-6 h-3 bg-current rounded-[1px]"></div>
            </button>
          </div>
        </div>

        <div v-if="menuType === 'site'">
          <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

          <div
              class="px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-50 font-bold flex justify-between items-center">
            <span>移动到...</span>
            <span v-if="currentGroupName" class="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
              当前: {{ currentGroupName }}
            </span>
          </div>

          <div class="max-h-[150px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
            <div
                v-for="group in groups"
                :key="group.id"
                @click="emit('move', group.id)"
                class="group px-3 py-2 rounded-md flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                :class="[
                group.id === currentGroupId
                  ? 'opacity-50 cursor-default'
                  : 'hover:bg-[var(--accent-color)] hover:text-white'
              ]"
            >
              <div class="flex items-center gap-2">
                <PhFolderNotch size="14" :weight="group.id === currentGroupId ? 'fill' : 'regular'"/>
                <span class="truncate max-w-[90px]">{{ group.title }}</span>
              </div>
              <PhCheck v-if="group.id === currentGroupId" size="12" weight="bold"/>
              <PhArrowRight
                  v-else
                  size="12"
                  weight="bold"
                  class="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        </div>

        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

        <button
            @click="emit('delete')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
        >
          <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
          删除
        </button>
      </template>

      <template v-else-if="menuType === 'group'">
        <button
            @click="emit('edit')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
        >
          <PhPencilSimple size="16" class="opacity-70"/>
          编辑分组
        </button>
        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>
        <button
            @click="emit('delete')"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
        >
          <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
          删除分组
        </button>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.custom-scrollbar {
  overscroll-behavior: contain;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.4);
  border-radius: 4px;
  cursor: pointer;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.6);
}

:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
}

:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.size-btn {
  @apply bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20
  rounded h-6 flex items-center justify-center text-current opacity-70 hover:opacity-100 transition-all;
}
</style>
