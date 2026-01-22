<script setup lang="ts">
import {ref, computed} from 'vue';
import {widgetRegistry} from '../../../core/registry/widgets.ts';
import {
  PhX,
  PhMagnifyingGlass,
  PhLayout,
  PhClock,
  PhCloudSun,
  PhToolbox,
  PhGameController,
  PhPlus, PhCoffee
} from '@phosphor-icons/vue';

defineProps<{ show: boolean }>();
const emit = defineEmits(['close', 'select']);

const searchQuery = ref('');
const activeCategory = ref('all');

/** 分类配置 */
const categories = [
  {id: 'all', label: '全部', icon: PhLayout},
  {id: 'time', label: '时间日期', icon: PhClock},
  {id: 'system', label: '系统监控', icon: PhCloudSun},
  {id: 'tool', label: '效率工具', icon: PhToolbox},
  {id: 'game', label: '摸鱼游戏', icon: PhGameController},
  { id: 'life', label: '生活日常', icon: PhCoffee },
];

/** 过滤逻辑 */
const filteredWidgets = computed(() => {
  const search = searchQuery.value.trim().toLowerCase();

  return widgetRegistry.filter((w) => {
    // 分类筛选
    const matchCat = activeCategory.value === 'all' || w.category === activeCategory.value;

    // 搜索筛选
    const matchSearch = !search ||
        w.label.toLowerCase().includes(search) ||
        w.description.toLowerCase().includes(search);

    return matchCat && matchSearch;
  });
});

const select = (type: string) => {
  emit('select', type);
  emit('close');
};
</script>
<template>
  <Transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          @click="$emit('close')"
      ></div>

      <div
          data-modal="1"
          class="relative w-full max-w-5xl h-[80vh] flex flex-col md:flex-row bg-[var(--settings-surface)] border border-[var(--settings-border)] rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300"
          @click.stop
      >
        <!-- 左侧分类 -->
        <div
            class="w-full md:w-60 bg-[var(--settings-panel)] border-b md:border-b-0 md:border-r border-[var(--settings-border)] flex flex-col p-4 min-h-0"
        >
          <div class="text-sm font-bold text-[var(--settings-text-secondary)] uppercase tracking-wider mb-4 px-2 pt-2">
            Widget Store
          </div>

          <!-- ✅ 加 data-wheel-allow，让全局 wheel 不拦截 -->
          <div
              data-wheel-allow="true"
              class="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto custom-scroll"
          >
            <button
                v-for="cat in categories"
                :key="cat.id"
                @click="activeCategory = cat.id"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium group relative overflow-hidden"
                :class="[
                activeCategory === cat.id
                  ? 'bg-[var(--accent-color)] text-white shadow-md'
                  : 'text-[var(--settings-text-secondary)] hover:bg-[var(--settings-input-bg)] hover:text-[var(--settings-text)]'
              ]"
            >
              <component :is="cat.icon" :size="18" :weight="activeCategory === cat.id ? 'fill' : 'regular'" />
              <span class="relative z-10">{{ cat.label }}</span>
            </button>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--settings-surface)]">
          <!-- 头部（固定） -->
          <div class="h-16 border-b border-[var(--settings-border)] flex items-center justify-between px-6 gap-4 shrink-0">
            <div class="relative flex-1 max-w-md group">
              <PhMagnifyingGlass
                  :size="18"
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--settings-text-secondary)] group-focus-within:text-[var(--accent-color)] transition-colors"
              />
              <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="搜索组件..."
                  class="w-full bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] rounded-xl py-2 pl-10 pr-4 text-sm text-[var(--settings-text)] placeholder-[var(--settings-text-secondary)] focus:outline-none focus:border-[var(--accent-color)] transition-all"
              />
            </div>

            <button
                @click="$emit('close')"
                class="p-2 rounded-lg text-[var(--settings-text-secondary)] hover:bg-[var(--settings-input-bg)] hover:text-[var(--settings-text)] transition-colors"
            >
              <PhX :size="20" />
            </button>
          </div>

          <!-- ✅ 这里也加 data-wheel-allow -->
          <div
              data-wheel-allow="true"
              class="flex-1 min-h-0 overflow-y-auto p-6 custom-scroll"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                  v-for="widget in filteredWidgets"
                  :key="widget.type"
                  @click="select(widget.type)"
                  class="group relative flex flex-col p-4 rounded-2xl border border-[var(--settings-border)] bg-[var(--settings-panel)] hover:border-[var(--accent-color)] transition-all text-left overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1"
              >
                <div class="flex items-start justify-between mb-3">
                  <div
                      class="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br transition-transform duration-300 group-hover:scale-110"
                      :class="widget.color"
                  >
                    <component :is="widget.icon" :size="24" weight="fill" />
                  </div>

                  <div
                      class="px-2 py-0.5 rounded-md bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] text-[10px] font-mono font-bold text-[var(--settings-text-secondary)] group-hover:text-[var(--accent-color)] group-hover:border-[var(--accent-color)]/30 transition-colors"
                  >
                    {{ widget.defaultW }}x{{ widget.defaultH }}
                  </div>
                </div>

                <h4 class="text-[var(--settings-text)] font-bold text-sm mb-1 group-hover:text-[var(--accent-color)] transition-colors">
                  {{ widget.label }}
                </h4>
                <p class="text-[11px] text-[var(--settings-text-secondary)] leading-relaxed line-clamp-2 h-8">
                  {{ widget.description }}
                </p>

                <div class="mt-4 flex items-center justify-end">
                  <div
                      class="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg shadow-[var(--accent-color)]/20"
                  >
                    <PhPlus weight="bold" />
                    <span>添加</span>
                  </div>
                </div>
              </button>
            </div>

            <div
                v-if="filteredWidgets.length === 0"
                class="h-full flex flex-col items-center justify-center opacity-40 text-[var(--settings-text-secondary)] min-h-[300px]"
            >
              <PhLayout :size="48" weight="duotone" class="mb-2" />
              <p class="text-sm">没有找到相关组件</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>



<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
.custom-scroll {
  -webkit-overflow-scrolling: touch;
}

/* 滚动条优化 */
.custom-scroll::-webkit-scrollbar {
  width: 6px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: var(--settings-border);
  border-radius: 3px;
}

.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--settings-text-secondary);
}
</style>