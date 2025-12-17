<script setup lang="ts">
import { ref, inject } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import GlassCard from '../ui/GlassCard.vue';
import ContextMenu from '../ui/ContextMenu.vue';
import { VueDraggable } from 'vue-draggable-plus';
import { PhPlus } from '@phosphor-icons/vue';

const props = defineProps<{ activeGroupId: string }>();
const store = useConfigStore();
// 注入弹窗方法
const { openAddDialog, openEditDialog } = inject('dialog') as any;

// 右键菜单状态
const menuState = ref({ show: false, x: 0, y: 0, itemId: '', item: null });

// 处理右键点击 (核心逻辑)
const handleContextMenu = (e: MouseEvent, item: any) => {
  e.preventDefault(); // 阻止浏览器默认菜单
  // 计算菜单位置，防止溢出屏幕（简单处理）
  let x = e.clientX;
  let y = e.clientY;

  menuState.value = {
    show: true,
    x: x,
    y: y,
    itemId: item.id,
    item: item
  };
};

const handleEdit = () => {
  menuState.value.show = false;
  openEditDialog(props.activeGroupId, menuState.value.item);
};

const handleDelete = () => {
  menuState.value.show = false;
  if (confirm('确认删除此图标？')) {
    store.removeSite(props.activeGroupId, menuState.value.itemId);
  }
};
</script>

<template>
  <div class="w-full flex justify-center pb-20" @click="menuState.show = false" @contextmenu="menuState.show = false">

    <div class="w-full transition-all duration-300" :style="{ maxWidth: store.config.theme.gridMaxWidth + 'px' }">
      <template v-for="group in store.config.layout" :key="group.id">
        <div v-if="group.id === activeGroupId" class="animate-fade-in">

          <VueDraggable
              v-model="group.items"
              :animation="200"
              class="grid place-items-start transition-all duration-300"
              :style="{
              gap: store.config.theme.gap + 'px',
              gridTemplateColumns: `repeat(auto-fill, minmax(calc(${store.config.theme.iconSize}px + 20px), 1fr))`
            }"
          >
            <div
                v-for="item in group.items"
                :key="item.id"
                class="relative group w-full flex justify-center"
                @contextmenu.stop="(e) => handleContextMenu(e, item)"
            >
              <GlassCard :item="item" />
            </div>

            <div @click="openAddDialog(activeGroupId)"
                 class="flex flex-col items-center gap-2 cursor-pointer group hover:-translate-y-1 transition-transform w-full">

              <div class="add-card flex items-center justify-center transition-all group-hover:shadow-lg group-hover:brightness-110"
                   :style="{
                        width: store.config.theme.iconSize + 'px',
                        height: store.config.theme.iconSize + 'px',
                        borderRadius: store.config.theme.radius + 'px'
                      }">
                <PhPlus size="32" weight="light" />
              </div>

              <span v-if="store.config.theme.showIconName"
                    class="font-bold text-center leading-tight opacity-50 group-hover:opacity-100 transition-opacity"
                    :style="{ fontSize: store.config.theme.iconTextSize + 'px', color: 'var(--text-primary)' }">
                   添加
                 </span>
            </div>

          </VueDraggable>
        </div>
      </template>
    </div>

    <ContextMenu
        :show="menuState.show"
        :x="menuState.x"
        :y="menuState.y"
        @close="menuState.show = false"
        @edit="handleEdit"
        @delete="handleDelete"
    />
  </div>
</template>