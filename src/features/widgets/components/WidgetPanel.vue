<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {
  PhCloud,
  PhCheck,
  PhDownloadSimple,
  PhFlask,
  PhMagnifyingGlass,
  PhPlus,
  PhSquaresFour,
  PhUploadSimple,
  PhWarning,
  PhWifiSlash,
  PhX
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../stores/useConfigStore';
import {widgetRegistry, type WidgetMeta} from '../../../core/registry/widgets';
import type {DeclarativeTileDefinition, SandboxTileDefinition} from '../../../core/tiles/contracts.ts';
import {evaluateTileCompatibility, type CompatibilityStatus} from '../../../core/tiles/compatibility.ts';
import {getCurrentHostCapabilities} from '../../../core/tiles/hostCapabilities.ts';
import {listDeclarativeTileDefinitions, listSandboxTileDefinitions} from '../../../core/tiles/registry.ts';
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
const declarativeImportInput = ref<HTMLInputElement | null>(null);
const sandboxRuntimeEnabled = computed({
  get: () => store.config.runtime?.sandbox?.enabled === true,
  set: (value: boolean) => store.setSandboxRuntimeEnabled(value),
});
const hostCapabilities = computed(() => getCurrentHostCapabilities({sandboxRuntime: sandboxRuntimeEnabled.value}));
const grantedRequiredFeatures = computed(() => sandboxRuntimeEnabled.value ? ['sandboxRuntime' as const] : []);

const categories = [
  {id: 'featured', label: '推荐'},
  {id: 'all', label: '全部'},
  {id: 'declarative', label: '声明式'},
  {id: 'sandbox', label: '沙箱 JS'},
  {id: 'time', label: '时间'},
  {id: 'life', label: '生活'},
  {id: 'tool', label: '工具'},
  {id: 'system', label: '系统'},
  {id: 'game', label: '娱乐'},
];

const featuredWidgets = computed(() => widgetRegistry.filter((widget) => widget.featured));
const featuredLocalCount = computed(() => featuredWidgets.value.filter((widget) => widget.runtime === 'local').length);
const declarativeDefinitions = computed(() => listDeclarativeTileDefinitions(store.config.tileInstalls));
const sandboxDefinitions = computed(() => listSandboxTileDefinitions(store.config.tileInstalls));
type ExternalDefinition = DeclarativeTileDefinition | SandboxTileDefinition;

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
  if (activeCategory.value === 'declarative' || activeCategory.value === 'sandbox') return [];
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

const filteredDeclarativeTiles = computed(() => {
  const search = searchQuery.value.trim().toLowerCase();
  return declarativeDefinitions.value.filter((definition) => !search
      || definition.label.toLowerCase().includes(search)
      || definition.description?.toLowerCase().includes(search)
      || definition.id.toLowerCase().includes(search));
});

const filteredSandboxTiles = computed(() => {
  const search = searchQuery.value.trim().toLowerCase();
  return sandboxDefinitions.value.filter((definition) => !search
      || definition.label.toLowerCase().includes(search)
      || definition.description?.toLowerCase().includes(search)
      || definition.id.toLowerCase().includes(search));
});

const activeExternalDefinitions = computed<ExternalDefinition[]>(() =>
    activeCategory.value === 'sandbox' ? filteredSandboxTiles.value : filteredDeclarativeTiles.value,
);

const isExternalCategory = computed(() => activeCategory.value === 'declarative' || activeCategory.value === 'sandbox');

const categoryTitle = computed(() => {
  return categories.find((category) => category.id === activeCategory.value)?.label || '组件';
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

const compatibilityStatus = (definition: ExternalDefinition) =>
    evaluateTileCompatibility({
      compatibility: definition.compatibility,
      host: hostCapabilities.value,
      grantedRequiredFeatures: grantedRequiredFeatures.value,
    });

const compatibilityStateLabel = (status: CompatibilityStatus) => {
  if (status.state === 'supported') return 'supported';
  if (status.state === 'degraded') return 'degraded';
  if (status.state === 'blocked') return 'blocked';
  return 'unsupported';
};

const compatibilityStateText = (status: CompatibilityStatus) => {
  if (status.state === 'supported') return '可用';
  if (status.state === 'degraded') return '降级';
  if (status.state === 'blocked') return '需授权';
  return '不支持';
};

const canAddDeclarative = (status: CompatibilityStatus) =>
    status.state === 'supported' || status.state === 'degraded';

const auditStateLabel = (definition: ExternalDefinition) => definition.audit?.status || 'untrusted';

const auditStateText = (definition: ExternalDefinition) => {
  const status = auditStateLabel(definition);
  if (status === 'trusted') return '已信任';
  if (status === 'revoked') return '已撤销';
  if (status === 'hash-mismatch') return '校验失败';
  if (status === 'missing-package') return '缺包';
  return '本地未信任';
};

const externalRuntimeText = (definition: ExternalDefinition) => definition.source === 'sandbox' ? 'Sandbox JS' : '声明式';

const addExternalToGroup = (definition: ExternalDefinition) => {
  if (!selectedGroupId.value) {
    toast.warning('请先创建一个分组');
    return;
  }
  const status = compatibilityStatus(definition);
  if (!canAddDeclarative(status)) {
    toast.warning(status.state === 'blocked' ? status.reasons[0] || '组件需要授权后才能添加' : status.reasons[0] || '当前环境不支持该组件');
    return;
  }
  const result = store.addExternalTile(selectedGroupId.value, definition.id);
  if (result.success) toast.success(`已添加「${definition.label}」到「${selectedGroupName.value}」`);
  else toast.error(result.message || '添加外部组件失败');
};

const triggerDeclarativeImport = () => {
  declarativeImportInput.value && (declarativeImportInput.value.value = '');
  declarativeImportInput.value?.click();
};

const handleDeclarativeImport = async (event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const raw = JSON.parse(await file.text());
    const result = store.importTilePackage(raw);
    if (result.success) {
      activeCategory.value = result.runtime === 'sandbox' ? 'sandbox' : 'declarative';
      toast.success(`已导入${result.runtime === 'sandbox' ? '沙箱 JS' : '声明式'}组件「${result.label}」`);
      return;
    }
    toast.error(result.message || '组件导入失败');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '组件导入失败');
  } finally {
    if (input) input.value = '';
  }
};

const exportExternalPackage = (definition: ExternalDefinition) => {
  const payload = store.exportTilePackage(definition.id);
  if (!payload) {
    toast.warning('组件包不存在，无法导出');
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${definition.id.replace(/^external:/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')}.voidtile`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast.success(`已导出${externalRuntimeText(definition)}组件「${definition.label}」`);
};

const resolveWidgetIcon = (name: string) => resolvePhosphorIcon(name, 'SquaresFour');

// 左侧分类：支持鼠标滚轮切换（带节流，避免一滑跨多个）
let wheelCooldown = 0;
const switchCategory = (offset: number) => {
  const index = categories.findIndex((category) => category.id === activeCategory.value);
  if (index < 0) return;
  const next = Math.min(categories.length - 1, Math.max(0, index + offset));
  if (next !== index) activeCategory.value = categories[next].id;
};

const onCategoryWheel = (event: WheelEvent) => {
  if (Math.abs(event.deltaY) < 4) return;
  const now = Date.now();
  if (now - wheelCooldown < 220) return;
  wheelCooldown = now;
  switchCategory(event.deltaY > 0 ? 1 : -1);
};
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

          <button type="button" class="import-btn" @click="triggerDeclarativeImport">
            <PhUploadSimple size="16" weight="bold"/>
            导入 .voidtile
          </button>
          <input
              ref="declarativeImportInput"
              class="hidden"
              type="file"
              accept=".voidtile,.json,application/json"
              @change="handleDeclarativeImport"
          />
        </div>

        <div class="content">
          <aside class="category-list" data-wheel-allow="true" @wheel.prevent="onCategoryWheel">
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
            <div class="list-summary">
              <div>
                <div class="summary-title">{{ categoryTitle }}</div>
                <div class="summary-desc">
                  <template v-if="activeCategory === 'declarative'">
                    已安装 {{ filteredDeclarativeTiles.length }} 个本地声明式组件；仅渲染 JSON 视图，不执行外部代码。
                  </template>
                  <template v-else-if="activeCategory === 'sandbox'">
                    已安装 {{ filteredSandboxTiles.length }} 个本地沙箱 JS 组件；仅在本机实验开关开启时运行。
                  </template>
                  <template v-if="activeCategory === 'featured'">
                    默认推荐 {{ featuredWidgets.length }} 个，其中 {{ featuredLocalCount }} 个可本地运行。
                  </template>
                  <template v-else-if="!isExternalCategory">
                    共 {{ filteredWidgets.length }} 个组件，可添加到「{{ selectedGroupName }}」。
                  </template>
                </div>
              </div>
              <label v-if="activeCategory === 'sandbox'" class="sandbox-switch">
                <input v-model="sandboxRuntimeEnabled" type="checkbox"/>
                <span>启用本机 JS 实验</span>
              </label>
              <div class="summary-count">{{ isExternalCategory ? activeExternalDefinitions.length : filteredWidgets.length }}</div>
            </div>

            <div v-if="isExternalCategory && activeExternalDefinitions.length" class="widget-grid">
              <article
                  v-for="definition in activeExternalDefinitions"
                  :key="definition.id"
                  class="widget-option external-option"
                  :class="definition.source === 'sandbox' ? 'sandbox-option' : 'declarative-option'"
              >
                <div class="flex items-start justify-between gap-3">
                  <div
                      class="widget-icon"
                      :class="definition.source === 'sandbox' ? 'sandbox-icon' : 'declarative-icon'"
                      aria-hidden="true"
                  >
                    <component :is="resolveWidgetIcon(definition.icon)" :size="24" weight="fill"/>
                  </div>
                  <span
                      class="compat-badge"
                      :class="`compat-${compatibilityStateLabel(compatibilityStatus(definition))}`"
                  >
                    <component
                        :is="canAddDeclarative(compatibilityStatus(definition)) ? PhCheck : PhWarning"
                        size="13"
                        weight="bold"
                    />
                    {{ compatibilityStateText(compatibilityStatus(definition)) }}
                  </span>
                </div>

                <div class="mt-3 flex items-center gap-2">
                  <span class="runtime-badge" :class="definition.source === 'sandbox' ? 'runtime-experimental' : 'runtime-local'">
                    <component :is="definition.source === 'sandbox' ? PhFlask : PhWifiSlash" size="13" weight="bold"/>
                    {{ externalRuntimeText(definition) }}
                  </span>
                  <span class="audit-badge" :class="`audit-${auditStateLabel(definition)}`">
                    {{ auditStateText(definition) }}
                  </span>
                  <span class="hash-pill">{{ definition.packageHash }}</span>
                </div>

                <h3 class="mt-3 font-extrabold text-sm">{{ definition.label }}</h3>
                <p class="mt-1 text-xs leading-relaxed opacity-66 min-h-[42px]">
                  {{ definition.description || definition.id }}
                </p>

                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="size-pill">{{ definition.sizes.default.w }} x {{ definition.sizes.default.h }}</span>
                  <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="icon-btn"
                        :title="`导出${externalRuntimeText(definition)}组件`"
                        @click="exportExternalPackage(definition)"
                    >
                      <PhDownloadSimple size="15" weight="bold"/>
                    </button>
                    <button
                        type="button"
                        class="add-btn"
                        :disabled="!canAddDeclarative(compatibilityStatus(definition))"
                        @click="addExternalToGroup(definition)"
                    >
                      <PhPlus size="15" weight="bold"/>
                      添加
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <div v-else-if="!isExternalCategory && filteredWidgets.length" class="widget-grid">
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
              <div class="font-bold mt-3">{{ isExternalCategory ? (activeCategory === 'sandbox' ? '还没有沙箱 JS 组件' : '还没有声明式组件') : '没有找到组件' }}</div>
              <p class="text-xs opacity-60 mt-1">
                {{ isExternalCategory ? '导入本地 .voidtile 文件后，会显示兼容状态并可添加到分组。' : '换个关键词，或切换到“全部”分类。' }}
              </p>
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
  grid-template-columns: minmax(0, 1fr) auto auto;
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

.import-btn {
  min-width: 0;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 13px;
  border-radius: 14px;
  border: 1px solid var(--settings-border);
  background: color-mix(in srgb, var(--accent-color) 10%, var(--settings-input-bg));
  color: var(--settings-text);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
}

.import-btn:hover {
  border-color: rgba(var(--accent-color-rgb), 0.42);
  background: color-mix(in srgb, var(--accent-color) 16%, var(--settings-input-bg));
}

.import-btn:active {
  transform: scale(0.98);
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

.list-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--settings-border);
  background: var(--settings-panel);
}

.summary-title {
  font-size: 13px;
  font-weight: 900;
}

.summary-desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--settings-text);
  opacity: 0.62;
}

.summary-count {
  min-width: 34px;
  height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-color-rgb), 0.12);
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 900;
}

.sandbox-switch {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.24);
  background: rgba(217, 119, 6, 0.10);
  color: rgb(217 119 6);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.sandbox-switch input {
  width: 14px;
  height: 14px;
  accent-color: rgb(217 119 6);
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

.declarative-option {
  background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 8%, transparent), transparent),
      var(--settings-panel);
}

.sandbox-option {
  background:
      linear-gradient(135deg, rgba(217, 119, 6, 0.10), transparent),
      var(--settings-panel);
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

.declarative-icon {
  background: linear-gradient(135deg, #0f766e, #2563eb);
}

.sandbox-icon {
  background: linear-gradient(135deg, #b45309, #334155);
}

.runtime-badge,
.compat-badge,
.audit-badge,
.size-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 900;
}

.audit-badge {
  max-width: 96px;
  white-space: nowrap;
}

.external-option .runtime-badge {
  max-width: 104px;
  white-space: nowrap;
}

.hash-pill {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 800;
  opacity: 0.46;
}

.audit-trusted {
  color: rgb(22 163 74);
  background: rgba(22, 163, 74, 0.10);
}

.audit-untrusted,
.audit-missing-package {
  color: rgb(217 119 6);
  background: rgba(217, 119, 6, 0.12);
}

.audit-revoked,
.audit-hash-mismatch {
  color: rgb(220 38 38);
  background: rgba(220, 38, 38, 0.10);
}

.compat-supported {
  color: rgb(22 163 74);
  background: rgba(22, 163, 74, 0.10);
}

.compat-degraded {
  color: rgb(217 119 6);
  background: rgba(217, 119, 6, 0.12);
}

.compat-blocked {
  color: rgb(220 38 38);
  background: rgba(220, 38, 38, 0.10);
}

.compat-unsupported {
  color: rgb(100 116 139);
  background: rgba(100, 116, 139, 0.12);
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

.add-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(0.4);
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-text);
  background: var(--settings-input-bg);
  border: 1px solid var(--settings-border);
  transition: border-color 0.14s ease, color 0.14s ease, transform 0.14s ease;
}

.icon-btn:hover {
  color: var(--accent-color);
  border-color: rgba(var(--accent-color-rgb), 0.42);
}

.icon-btn:active {
  transform: scale(0.98);
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
