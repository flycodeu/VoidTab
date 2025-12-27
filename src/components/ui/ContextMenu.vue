<script setup lang="ts">
import {onMounted, onUnmounted, computed, ref} from 'vue';
import {
  PhPencilSimple, PhTrash, PhFolderNotch, PhArrowRight, PhCheck
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {useUiStore} from '../../stores/useUiStore';

const store = useConfigStore();
const ui = useUiStore();

const emit = defineEmits<{
  (e: 'edit'): void;
}>();

// ========== UI: 自定义删除弹窗 ==========
const showDeleteModal = ref(false);
const deleteTarget = ref<
    | { type: 'site'; groupId: string; siteId: string; title?: string }
    | { type: 'group'; groupId: string; title?: string }
    | null
>(null);

const openDeleteModal = () => {
  if (!ui.contextMenu?.show) return;

  if (ui.contextMenu.type === 'site') {
    deleteTarget.value = {
      type: 'site',
      groupId: ui.contextMenu.groupId,
      siteId: ui.contextMenu.item?.id,
      title: ui.contextMenu.item?.title
    };
  } else if (ui.contextMenu.type === 'group') {
    deleteTarget.value = {
      type: 'group',
      groupId: ui.contextMenu.item?.id,
      title: ui.contextMenu.item?.title
    };
  } else {
    deleteTarget.value = null;
  }

  ui.closeContextMenu();
  showDeleteModal.value = true;
};

const confirmDelete = () => {
  if (!deleteTarget.value) {
    showDeleteModal.value = false;
    return;
  }

  if (deleteTarget.value.type === 'site') {
    store.removeSite(deleteTarget.value.groupId, deleteTarget.value.siteId);
  } else {
    store.removeGroup(deleteTarget.value.groupId);
  }

  showDeleteModal.value = false;
  deleteTarget.value = null;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  deleteTarget.value = null;
};

//动态计算样式：解决浅色模式下菜单是黑色的问题
const menuStyle = computed(() => {
  const isDark = store.config.theme.mode === 'dark';
  return {
    top: ui.contextMenu.y + 'px',
    left: ui.contextMenu.x + 'px',
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    color: isDark ? '#fff' : '#333',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
  };
});

// 获取当前组名 (用于显示)
const currentGroupName = computed(() => {
  if (!ui.contextMenu.groupId) return '';
  const g = store.config.layout.find((group: any) => group.id === ui.contextMenu.groupId);
  return g ? g.title : '';
});

// 移动逻辑
const moveTo = (targetGroupId: string) => {
  if (targetGroupId === ui.contextMenu.groupId) return;

  if (ui.contextMenu.type === 'site') {
    store.moveSite(ui.contextMenu.groupId, targetGroupId, ui.contextMenu.item.id);
  }
  ui.closeContextMenu();
};

// 点击外部关闭
const handleClickOutside = () => ui.closeContextMenu();

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showDeleteModal.value) cancelDelete();
    ui.closeContextMenu();
  }
};

onMounted(() => {
  window.addEventListener('resize', handleClickOutside);
  window.addEventListener('scroll', handleClickOutside, true);
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleClickOutside);
  window.removeEventListener('scroll', handleClickOutside, true);
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Transition name="scale">
    <div
        v-if="ui.contextMenu.show"
        class="fixed z-[9999] min-w-[160px] p-1.5 rounded-xl flex flex-col gap-1 origin-top-left select-none text-sm font-medium"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
    >
      <button
          @click="emit('edit'); ui.closeContextMenu()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 text-left w-full"
      >
        <PhPencilSimple size="16" class="opacity-70"/>
        编辑{{ ui.contextMenu.type === 'group' ? '分组' : '图标' }}
      </button>

      <div v-if="ui.contextMenu.type === 'site'">
        <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

        <div
            class="px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-50 font-bold flex justify-between items-center">
          <span>移动到...</span>
          <span v-if="currentGroupName"
                class="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            当前: {{ currentGroupName }}
          </span>
        </div>

        <div class="max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
          <div
              v-for="group in store.config.layout"
              :key="group.id"
              @click="moveTo(group.id)"
              class="group px-3 py-2 rounded-md flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
              :class="[
                group.id === ui.contextMenu.groupId
                  ? 'opacity-50 cursor-default'
                  : 'hover:bg-[var(--accent-color)] hover:text-white'
              ]"
          >
            <div class="flex items-center gap-2">
              <PhFolderNotch size="14" :weight="group.id === ui.contextMenu.groupId ? 'fill' : 'regular'"/>
              <span class="truncate max-w-[90px]">{{ group.title }}</span>
            </div>

            <PhCheck v-if="group.id === ui.contextMenu.groupId" size="12" weight="bold"/>
            <PhArrowRight v-else size="12" weight="bold" class="opacity-0 group-hover:opacity-100 transition-opacity"/>
          </div>
        </div>
      </div>

      <div class="border-t border-black/5 dark:border-white/10 my-1"></div>

      <button
          @click="openDeleteModal"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-red-500/10 text-red-500 text-left w-full group"
      >
        <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
        删除
      </button>
    </div>
  </Transition>

  <!-- ✅ 自定义删除弹窗（替换 confirm） -->
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="showDeleteModal" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="cancelDelete"></div>

        <div
            class="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center transition-all"
            style="background-color: var(--modal-bg, #1e1e1e); color: var(--modal-text, #fff); border: 1px solid rgba(255,255,255,0.1);"
        >
          <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-1">
            <PhTrash :size="32" weight="duotone"/>
          </div>

          <div>
            <h3 class="text-xl font-bold mb-2">确认删除？</h3>
            <p class="text-sm opacity-60 leading-relaxed">
              删除后无法恢复，<br/>
              确定要移除这个{{ deleteTarget?.type === 'group' ? '分组' : '图标' }}吗？
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 w-full mt-2">
            <button
                @click="cancelDelete"
                class="py-3.5 rounded-2xl font-bold transition-all bg-white/5 hover:bg-white/10 active:scale-95 text-white/80"
            >
              取消
            </button>
            <button
                @click="confirmDelete"
                class="py-3.5 rounded-2xl font-bold transition-all bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-lg shadow-red-500/30"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: currentColor;
  opacity: 0.2;
  border-radius: 4px;
}

/* 弹窗动画（与 MainGrid 同风格） */
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
