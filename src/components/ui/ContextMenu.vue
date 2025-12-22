<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';
import {
  PhPencilSimple, PhTrash, PhFolderNotch, PhArrowRight, PhCheck
} from '@phosphor-icons/vue';
import { useConfigStore } from '../../stores/useConfigStore';

const store = useConfigStore();

// ✨ 动态计算样式：解决浅色模式下菜单是黑色的问题
const menuStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    top: store.contextMenu.y + 'px',
    left: store.contextMenu.x + 'px',
    // 浅色模式用白色背景，深色模式用深色背景
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    color: isDark ? '#fff' : '#333', // 字体颜色适配
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
  };
});

// 获取当前组名 (用于显示)
const currentGroupName = computed(() => {
  if (!store.contextMenu.groupId) return '';
  const g = store.config.layout.find((group: any) => group.id === store.contextMenu.groupId);
  return g ? g.title : '';
});

// 移动逻辑
const moveTo = (targetGroupId: string) => {
  if (targetGroupId === store.contextMenu.groupId) return;
  // 只有 site 才能移动
  if (store.contextMenu.type === 'site') {
    store.moveSite(store.contextMenu.groupId, targetGroupId, store.contextMenu.item.id);
  }
  store.closeContextMenu();
};

// 删除逻辑 (通用)
const handleDelete = () => {
  if (confirm('确认删除？')) {
    if (store.contextMenu.type === 'site') {
      store.removeSite(store.contextMenu.groupId, store.contextMenu.item.id);
    } else if (store.contextMenu.type === 'group') {
      store.removeGroup(store.contextMenu.item.id);
    }
  }
  store.closeContextMenu();
};

// 点击外部关闭
const handleClickOutside = () => store.closeContextMenu();

onMounted(() => {
  window.addEventListener('resize', handleClickOutside);
  window.addEventListener('scroll', handleClickOutside, true);
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleClickOutside);
  window.removeEventListener('scroll', handleClickOutside, true);
  window.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <Transition name="scale">
    <div
        v-if="store.contextMenu.show"
        class="fixed z-[9999] min-w-[160px] p-1.5 rounded-xl flex flex-col gap-1 origin-top-left select-none text-sm font-medium"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
    >
      <button
          @click="$emit('edit'); store.closeContextMenu()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
      >
        <PhPencilSimple size="16" class="opacity-70"/>
        编辑{{ store.contextMenu.type === 'group' ? '分组' : '图标' }}
      </button>

      <div v-if="store.contextMenu.type === 'site'">
        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

        <div class="px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-50 font-bold flex justify-between items-center">
          <span>移动到...</span>
          <span v-if="currentGroupName" class="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">当前: {{ currentGroupName }}</span>
        </div>

        <div class="max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
          <div
              v-for="group in store.config.layout"
              :key="group.id"
              @click="moveTo(group.id)"
              class="px-3 py-2 rounded-md flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
              :class="[
              group.id === store.contextMenu.groupId
                ? 'opacity-50 cursor-default'
                : 'hover:bg-[var(--accent-color)] hover:text-white'
            ]"
          >
            <div class="flex items-center gap-2">
              <PhFolderNotch size="14" :weight="group.id === store.contextMenu.groupId ? 'fill' : 'regular'" />
              <span class="truncate max-w-[90px]">{{ group.title }}</span>
            </div>
            <PhCheck v-if="group.id === store.contextMenu.groupId" size="12" weight="bold" />
            <PhArrowRight v-else size="12" weight="bold" class="opacity-0 group-hover:opacity-100" />
          </div>
        </div>
      </div>

      <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

      <button
          @click="handleDelete"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
      >
        <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
        删除
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.scale-enter-from, .scale-leave-to { opacity: 0; transform: scale(0.95); }
.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: currentColor; opacity: 0.2; border-radius: 4px; }
</style>