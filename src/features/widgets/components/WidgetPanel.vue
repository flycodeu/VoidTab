<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {
  PhCloud,
  PhFlask,
  PhMagnifyingGlass,
  PhPlus,
  PhSquaresFour,
  PhWifiSlash,
  PhX
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../stores/useConfigStore';
import {widgetRegistry, type WidgetMeta} from '../../../core/registry/widgets';
import {resolvePhosphorIcon} from '../../../shared/icons/phosphorIconMap';
import {useEscapeClose} from '../../../shared/composables/useEscapeClose';
import {useToast} from '../../../shared/composables/useToast';

const props = defineProps<{
  isOpen: boolean;
  activeGroupId?: string;
}>();

const emit = defineEmits(['close']);

const store = useConfigStore();
const toast = useToast();

useEscapeClose(() => props.isOpen, () => emit('close'));

const searchQuery = ref('');
const activeCategory = ref('featured');
const selectedGroupId = ref('');

const categories = [
  {id: 'featured', label: '推荐'},
  {id: 'all', label: '全部'},
  {id: 'time', label: '时间'},
  {id: 'life', label: '生活'},
  {id: 'tool', label: '工具'},
  {id: 'system', label: '系统'},
  {id: 'game', label: '娱乐'},
];

const groups = computed(() => store.config.layout || []);

watch(
    () => [props.isOpen, props.activeGroupId, groups.value.map((group) => group.id).join('|')],
    () => {
      if (!props.isOpen) return;
      const preferred = props.activeGroupId && groups.value.some((group) => group.id === props.activeGroupId)
          ? props.activeGroupId
          : groups.value[0]?.id;
      selectedGroupId.value = selectedGroupId.value && groups.value.some((group) => group.id === selectedGroupId.value)
          ? selectedGroupId.value
          : (preferred || '');
    },
    {immediate: true}
);

const filteredWidgets = computed(() => {
  const search = searchQuery.value.trim().toLowerCase();
  return widgetRegistry.filter((widget) => {
    const matchCategory = activeCategory.value === 'all'
        || (activeCategory.value === 'featured' ? widget.featured : widget.category === activeCategory.value);
    const matchSearch = !search
        || widget.label.toLowerCase().includes(search)
        || widget.description.toLowerCase().includes(search)
        || widget.type.toLowerCase().includes(search);
    return matchCategory && matchSearch;
  });
});

const selectedGroupName = computed(() => {
  return groups.value.find((group) => group.id === selectedGroupId.value)?.title || '未选择分组';
});

const runtimeLabel = (runtime: WidgetMeta['runtime']) => {
  if (runtime === 'network') return '联网';
  if (runtime === 'experimental') return '实验';
  return '本地';
};

const runtimeIcon = (runtime: WidgetMeta['runtime']) => {
  if (runtime === 'network') return PhCloud;
  if (runtime === 'experimental') return PhFlask;
  return PhWifiSlash;
};

const runtimeClass = (runtime: WidgetMeta['runtime']) => {
  if (runtime === 'network') return 'runtime-network';
  if (runtime === 'experimental') return 'runtime-experimental';
  return 'runtime-local';
};

const addWidgetToGroup = (widget: WidgetMeta) => {
  if (!selectedGroupId.value) {
    toast.warning('请先创建一个分组');
    return;
  }
  store.addWidget(selectedGroupId.value, widget.type);
  toast.success(`已添加「${widget.label}」到「${selectedGroupName.value}」`);
};

const resolveWidgetIcon = (name: string) => resolvePhosphorIcon(name, 'SquaresFour');
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
      <div class="absolute inset-0 bg-black/55 backdrop-blur-md transition-opacity" @click="emit('close')"></div>

      <section
          class="relative w-full max-w-6xl h-[84vh] md:h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border bg-[var(--settings-surface)] text-[var(--settings-text)]"
          style="border-color: var(--settings-border);"
          role="dialog"
          aria-modal="true"
          aria-labelledby="widget-panel-title"
          data-modal="1"
      >
        <header class="panel-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="panel-icon">
              <PhSquaresFour size="20" weight="fill"/>
            </div>
            <div class="min-w-0">
              <h2 id="widget-panel-title" class="font-extrabold text-sm tracking-wide truncate">组件中心</h2>
              <p class="text-xs opacity-60 mt-0.5 truncate">向当前分组添加本地工具、信息卡片和轻量组件</p>
            </div>
          </div>

          <button
              @click="emit('close')"
              class="close-btn"
              type="button"
              aria-label="关闭组件中心"
              title="关闭"
          >
            <PhX size="22"/>
          </button>
        </header>

        <div class="toolbar">
          <div class="search-box">
            <PhMagnifyingGlass size="18" class="opacity-50 shrink-0"/>
            <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索组件..."
                class="search-input"
            />
          </div>

          <label class="group-select">
            <span>添加到</span>
            <select v-model="selectedGroupId" class="group-select-input">
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.title }}
              </option>
            </select>
          </label>
        </div>

        <div class="content">
          <aside class="category-list" data-wheel-allow="true">
            <button
                v-for="category in categories"
                :key="category.id"
                type="button"
                class="category-btn"
                :class="activeCategory === category.id ? 'category-active' : ''"
                @click="activeCategory = category.id"
            >
              {{ category.label }}
            </button>
          </aside>

          <main class="widget-list" data-wheel-allow="true">
            <div v-if="filteredWidgets.length" class="widget-grid">
              <article
                  v-for="widget in filteredWidgets"
                  :key="widget.type"
                  class="widget-option"
              >
                <div class="flex items-start justify-between gap-3">
                  <div
                      class="widget-icon bg-gradient-to-br"
                      :class="widget.color"
                      aria-hidden="true"
                  >
                    <component :is="resolveWidgetIcon(widget.icon)" :size="24" weight="fill"/>
                  </div>
                  <span class="runtime-badge" :class="runtimeClass(widget.runtime)">
                    <component :is="runtimeIcon(widget.runtime)" size="13" weight="bold"/>
                    {{ runtimeLabel(widget.runtime) }}
                  </span>
                </div>

                <h3 class="mt-4 font-extrabold text-sm">{{ widget.label }}</h3>
                <p class="mt-1 text-xs leading-relaxed opacity-66 min-h-[42px]">
                  {{ widget.description }}
                </p>

                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="size-pill">{{ widget.defaultW }} x {{ widget.defaultH }}</span>
                  <button
                      type="button"
                      class="add-btn"
                      @click="addWidgetToGroup(widget)"
                  >
                    <PhPlus size="15" weight="bold"/>
                    添加
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="empty">
              <PhSquaresFour size="48" weight="duotone"/>
              <div class="font-bold mt-3">没有找到组件</div>
              <p class="text-xs opacity-60 mt-1">换个关键词，或切换到“全部”分类。</p>
            </div>
          </main>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--settings-border);
  background: var(--settings-panel);
}

.panel-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-color-rgb), 0.14);
  color: var(--accent-color);
}

.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.68;
  transition: opacity 0.16s ease, background 0.16s ease;
}

.close-btn:hover {
  opacity: 1;
  background: var(--settings-input-bg);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--settings-border);
  background: var(--settings-surface);
}

.search-box,
.group-select {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--settings-border);
  background: var(--settings-input-bg);
  border-radius: 14px;
  padding: 0 12px;
}

.search-input,
.group-select-input {
  min-width: 0;
  height: 42px;
  background: transparent;
  outline: none;
  font-size: 13px;
}

.group-select {
  font-size: 12px;
  font-weight: 800;
  opacity: 0.86;
}

.content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
}

.category-list {
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid var(--settings-border);
  background: var(--settings-panel);
}

.category-btn {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  opacity: 0.68;
  transition: opacity 0.14s ease, background 0.14s ease, color 0.14s ease;
}

.category-btn:hover {
  opacity: 1;
  background: var(--settings-input-bg);
}

.category-active {
  opacity: 1;
  color: white;
  background: var(--accent-color);
}

.widget-list {
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.widget-option {
  min-width: 0;
  padding: 15px;
  border-radius: 18px;
  border: 1px solid var(--settings-border);
  background: var(--settings-panel);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.widget-option:hover {
  transform: translateY(-2px);
  border-color: rgba(var(--accent-color-rgb), 0.42);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.widget-icon {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.16);
}

.runtime-badge,
.size-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 900;
}

.runtime-local {
  color: rgb(22 163 74);
  background: rgba(22, 163, 74, 0.10);
}

.runtime-network {
  color: rgb(37 99 235);
  background: rgba(37, 99, 235, 0.10);
}

.runtime-experimental {
  color: rgb(217 119 6);
  background: rgba(217, 119, 6, 0.12);
}

.size-pill {
  color: var(--settings-text);
  background: var(--settings-input-bg);
  border: 1px solid var(--settings-border);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  color: white;
  background: var(--accent-color);
  font-size: 12px;
  font-weight: 900;
  transition: filter 0.14s ease, transform 0.14s ease;
}

.add-btn:hover {
  filter: brightness(1.06);
}

.add-btn:active {
  transform: scale(0.98);
}

.empty {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  text-align: center;
}

@media (max-width: 767px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .content {
    grid-template-columns: 1fr;
  }

  .category-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--settings-border);
  }

  .category-btn {
    width: auto;
    white-space: nowrap;
  }
}
</style>
