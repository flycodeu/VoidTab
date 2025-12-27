<script setup lang="ts">
import { PhPencilSimple, PhTrash, PhFolderNotch, PhArrowRight, PhCheck } from '@phosphor-icons/vue';

defineProps<{
  show: boolean;
  styleObj: Record<string, any>;
  menuType: 'site' | 'group' | string;
  groups: any[];
  currentGroupId: string;
  currentGroupName: string;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'move', groupId: string): void;
  (e: 'delete'): void;
}>();
</script>

<template>
  <Transition name="scale">
    <div
        v-if="show"
        class="fixed z-[9999] min-w-[160px] p-1.5 rounded-xl flex flex-col gap-1 origin-top-left select-none text-sm font-medium"
        :style="styleObj"
        @click.stop
        @contextmenu.prevent
    >
      <button
          @click="emit('edit')"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
      >
        <PhPencilSimple size="16" class="opacity-70" />
        编辑{{ menuType === 'group' ? '分组' : '图标' }}
      </button>

      <div v-if="menuType === 'site'">
        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

        <div class="px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-50 font-bold flex justify-between items-center">
          <span>移动到...</span>
          <span v-if="currentGroupName" class="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            当前: {{ currentGroupName }}
          </span>
        </div>

        <div class="max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
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
              <PhFolderNotch size="14" :weight="group.id === currentGroupId ? 'fill' : 'regular'" />
              <span class="truncate max-w-[90px]">{{ group.title }}</span>
            </div>

            <PhCheck v-if="group.id === currentGroupId" size="12" weight="bold" />
            <PhArrowRight v-else size="12" weight="bold" class="opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

      <button
          @click="emit('delete')"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
      >
        <PhTrash size="16" class="group-hover:scale-110 transition-transform" />
        删除
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: currentColor;
  opacity: 0.2;
  border-radius: 4px;
}
</style>
