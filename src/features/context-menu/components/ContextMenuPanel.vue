<script setup lang="ts">
import {computed} from 'vue';
import {
  PhPencilSimple,
  PhTrash,
  PhFolderNotch,
  PhArrowRight,
  PhCheck,
  PhPlus,
  PhAppWindow,
  PhGear,
  PhCode,
  PhPalette,
  PhArrowClockwise,
  PhDownloadSimple,
  PhUploadSimple
} from '@phosphor-icons/vue';

type SizeValue = {w: number; h: number; label?: string};
type SizeEditor = {
  current: SizeValue;
  default: SizeValue;
  min: SizeValue;
  max: SizeValue;
  mobileFallback?: SizeValue;
  allowed?: SizeValue[];
};

const props = defineProps<{
  show: boolean;
  styleObj: Record<string, any>;
  menuType: 'site' | 'group' | 'blank' | 'widget' | string;
  groups: any[];
  currentGroupId: string;
  currentGroupName: string;
  sizeEditor?: SizeEditor | null;
}>();

const emit = defineEmits<{
  (e: 'toggleGlobalEdit'): void;
  (e: 'move', groupId: string): void;
  (e: 'delete'): void;
  (e: 'resize', w: number, h: number): void;
  (e: 'addSite'): void;
  (e: 'addWidget'): void;
  (e: 'importTile'): void;
  (e: 'exportTile'): void;
  (e: 'stylePreset', preset: 'clean' | 'soft' | 'vivid'): void;
  (e: 'resetStyle'): void;
  (e: 'configWidget'): void;
  (e: 'edit'): void;

  (e: 'openSettings'): void;
  (e: 'openDevTools'): void;
}>();

const sameSize = (left: SizeValue | undefined, right: SizeValue | undefined) =>
    !!left && !!right && left.w === right.w && left.h === right.h;

const uniqueSizes = (sizes: (SizeValue | undefined)[]) => {
  const seen = new Set<string>();
  const result: SizeValue[] = [];
  for (const size of sizes) {
    if (!size) continue;
    const key = `${size.w}x${size.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(size);
  }
  return result;
};

const sizeShortcutOptions = computed(() => {
  const editor = props.sizeEditor;
  if (!editor) return [];
  if (editor.allowed?.length) return uniqueSizes(editor.allowed);
  return uniqueSizes([
    {...editor.default, label: '默认'},
    editor.mobileFallback ? {...editor.mobileFallback, label: '手机'} : undefined,
    {...editor.min, label: '最小'},
    {...editor.max, label: '最大'},
    editor.current,
  ]);
});

const getSizeOptionLabel = (size: SizeValue) => size.label || `${size.w}x${size.h}`;
const isCurrentSize = (size: SizeValue) => sameSize(size, props.sizeEditor?.current);

const emitResizeWidth = (event: Event) => {
  const editor = props.sizeEditor;
  if (!editor) return;
  const target = event.target as HTMLInputElement | null;
  emit('resize', Number(target?.value), editor.current.h);
};

const emitResizeHeight = (event: Event) => {
  const editor = props.sizeEditor;
  if (!editor) return;
  const target = event.target as HTMLInputElement | null;
  emit('resize', editor.current.w, Number(target?.value));
};
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
      <!-- ============ blank ============ -->
      <template v-if="menuType === 'blank'">
        <button @click="emit('addSite')" class="menu-btn" type="button">
          <PhPlus size="16" class="opacity-70"/>
          添加图标
        </button>

        <button @click="emit('addWidget')" class="menu-btn" type="button">
          <PhAppWindow size="16" class="opacity-70"/>
          添加组件
        </button>

        <button @click="emit('importTile')" class="menu-btn" type="button">
          <PhUploadSimple size="16" class="opacity-70"/>
          导入卡片实例
        </button>

        <div class="divider"></div>

        <button @click="emit('toggleGlobalEdit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          整理桌面
        </button>

        <button @click="emit('openSettings')" class="menu-btn" type="button">
          <PhGear size="16" class="opacity-70"/>
          设置
        </button>

        <button @click="emit('openDevTools')" class="menu-btn" type="button">
          <PhCode size="16" class="opacity-70"/>
          开发者工具 (F12)
        </button>
      </template>

      <!-- ============ site ============ -->
      <template v-else-if="menuType === 'site'">
        <button @click="emit('edit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          编辑图标
        </button>

        <button @click="emit('toggleGlobalEdit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          整理桌面
        </button>

        <div class="divider"></div>

        <div class="style-panel">
          <div class="style-title">
            <PhPalette size="13" aria-hidden="true"/>
            实例外观
          </div>
          <div class="grid grid-cols-3 gap-1">
            <button @click="emit('stylePreset', 'clean')" class="style-chip" type="button">清爽</button>
            <button @click="emit('stylePreset', 'soft')" class="style-chip" type="button">柔和</button>
            <button @click="emit('stylePreset', 'vivid')" class="style-chip" type="button">醒目</button>
          </div>
          <button @click="emit('resetStyle')" class="menu-btn compact" type="button">
            <PhArrowClockwise size="14" class="opacity-70"/>
            重置外观
          </button>
        </div>

        <div v-if="sizeEditor" class="size-panel">
          <div class="size-title">布局尺寸</div>
          <div class="size-option-grid">
            <button
                v-for="option in sizeShortcutOptions"
                :key="`${option.w}x${option.h}`"
                @click="emit('resize', option.w, option.h)"
                class="size-option-btn"
                :class="{ active: isCurrentSize(option) }"
                :title="`${option.w}x${option.h}`"
                :aria-pressed="isCurrentSize(option)"
                type="button"
            >
              <span
                  class="size-swatch"
                  :style="{ width: Math.min(34, 8 + option.w * 5) + 'px', height: Math.min(22, 8 + option.h * 5) + 'px' }"
                  aria-hidden="true"
              ></span>
              <span>{{ getSizeOptionLabel(option) }}</span>
            </button>
          </div>
          <div v-if="!sizeEditor.allowed?.length" class="size-input-row">
            <label>
              <span>宽</span>
              <input
                  :value="sizeEditor.current.w"
                  :min="sizeEditor.min.w"
                  :max="sizeEditor.max.w"
                  inputmode="numeric"
                  type="number"
                  @change="emitResizeWidth"
              />
            </label>
            <label>
              <span>高</span>
              <input
                  :value="sizeEditor.current.h"
                  :min="sizeEditor.min.h"
                  :max="sizeEditor.max.h"
                  inputmode="numeric"
                  type="number"
                  @change="emitResizeHeight"
              />
            </label>
          </div>
        </div>

        <button @click="emit('exportTile')" class="menu-btn" type="button">
          <PhDownloadSimple size="16" class="opacity-70"/>
          导出卡片实例
        </button>

        <div class="divider"></div>

        <div
            class="px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-50 font-bold flex justify-between items-center">
          <span>移动到...</span>
          <span
              v-if="currentGroupName"
              class="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded"
          >
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

        <div class="divider"></div>

        <!-- ✅ group 放这里，不放 @apply -->
        <button @click="emit('delete')" class="danger-btn group" type="button">
          <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
          删除
        </button>

        <div class="divider"></div>

        <button @click="emit('openSettings')" class="menu-btn" type="button">
          <PhGear size="16" class="opacity-70"/>
          设置
        </button>

        <button @click="emit('openDevTools')" class="menu-btn" type="button">
          <PhCode size="16" class="opacity-70"/>
          开发者工具 (F12)
        </button>
      </template>

      <!-- ============ widget ============ -->
      <template v-else-if="menuType === 'widget'">
        <button @click="emit('toggleGlobalEdit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          整理桌面
        </button>

        <div class="divider"></div>

        <div class="style-panel">
          <div class="style-title">
            <PhPalette size="13" aria-hidden="true"/>
            实例外观
          </div>
          <div class="grid grid-cols-3 gap-1">
            <button @click="emit('stylePreset', 'clean')" class="style-chip" type="button">清爽</button>
            <button @click="emit('stylePreset', 'soft')" class="style-chip" type="button">柔和</button>
            <button @click="emit('stylePreset', 'vivid')" class="style-chip" type="button">醒目</button>
          </div>
          <button @click="emit('resetStyle')" class="menu-btn compact" type="button">
            <PhArrowClockwise size="14" class="opacity-70"/>
            重置外观
          </button>
        </div>

        <button @click="emit('exportTile')" class="menu-btn" type="button">
          <PhDownloadSimple size="16" class="opacity-70"/>
          导出卡片实例
        </button>

        <div v-if="sizeEditor" class="size-panel">
          <div class="size-title">布局尺寸</div>
          <div class="size-option-grid">
            <button
                v-for="option in sizeShortcutOptions"
                :key="`${option.w}x${option.h}`"
                @click="emit('resize', option.w, option.h)"
                class="size-option-btn"
                :class="{ active: isCurrentSize(option) }"
                :title="`${option.w}x${option.h}`"
                :aria-pressed="isCurrentSize(option)"
                type="button"
            >
              <span
                  class="size-swatch"
                  :style="{ width: Math.min(34, 8 + option.w * 5) + 'px', height: Math.min(22, 8 + option.h * 5) + 'px' }"
                  aria-hidden="true"
              ></span>
              <span>{{ getSizeOptionLabel(option) }}</span>
            </button>
          </div>
          <div v-if="!sizeEditor.allowed?.length" class="size-input-row">
            <label>
              <span>宽</span>
              <input
                  :value="sizeEditor.current.w"
                  :min="sizeEditor.min.w"
                  :max="sizeEditor.max.w"
                  inputmode="numeric"
                  type="number"
                  @change="emitResizeWidth"
              />
            </label>
            <label>
              <span>高</span>
              <input
                  :value="sizeEditor.current.h"
                  :min="sizeEditor.min.h"
                  :max="sizeEditor.max.h"
                  inputmode="numeric"
                  type="number"
                  @change="emitResizeHeight"
              />
            </label>
          </div>
        </div>

        <div class="divider"></div>

        <button @click="emit('delete')" class="danger-btn group" type="button">
          <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
          删除
        </button>

        <div class="divider"></div>

        <button @click="emit('openSettings')" class="menu-btn" type="button">
          <PhGear size="16" class="opacity-70"/>
          设置
        </button>

        <button @click="emit('openDevTools')" class="menu-btn" type="button">
          <PhCode size="16" class="opacity-70"/>
          开发者工具 (F12)
        </button>
      </template>

      <!-- ============ group ============ -->
      <template v-else-if="menuType === 'group'">
        <button @click="emit('edit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          编辑分组
        </button>

        <button @click="emit('toggleGlobalEdit')" class="menu-btn" type="button">
          <PhPencilSimple size="16" class="opacity-70"/>
          整理桌面
        </button>
        <div class="divider"></div>

        <button @click="emit('delete')" class="danger-btn group" type="button">
          <PhTrash size="16" class="group-hover:scale-110 transition-transform"/>
          删除分组
        </button>

        <div class="divider"></div>

        <button @click="emit('openSettings')" class="menu-btn" type="button">
          <PhGear size="16" class="opacity-70"/>
          设置
        </button>

        <button @click="emit('openDevTools')" class="menu-btn" type="button">
          <PhCode size="16" class="opacity-70"/>
          开发者工具 (F12)
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

/* ✅ 这里只用 @apply 支持的 utility */
.menu-btn {
  @apply flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
  hover:bg-black/5 dark:hover:bg-white/10 text-left w-full;
}

.menu-btn.compact {
  @apply py-2 text-xs;
}

/* ✅ 不要在 @apply 里写 group */
.danger-btn {
  @apply flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
  hover:bg-red-500/10 text-red-500 text-left w-full;
}

.divider {
  @apply border-t border-black/5 dark:border-white/10 my-1;
}

.style-panel {
  @apply px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 flex flex-col gap-1.5;
}

.style-title {
  @apply flex items-center gap-1.5 text-[10px] opacity-50 font-bold tracking-wider;
}

.style-chip {
  @apply h-7 rounded-md text-[11px] font-bold bg-black/5 dark:bg-white/10
  hover:bg-[var(--accent-color)] hover:text-white transition-colors;
}

.size-panel {
  @apply px-2 py-2 rounded-lg bg-black/5 dark:bg-white/5 flex flex-col gap-2;
}

.size-title {
  @apply text-[10px] opacity-50 font-bold;
}

.size-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.size-option-btn {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(0, 0, 0, 0.05);
  color: currentColor;
  font-size: 11px;
  font-weight: 700;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

:global(.dark) .size-option-btn {
  background: rgba(255, 255, 255, 0.1);
}

.size-option-btn:hover,
.size-option-btn.active {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.size-swatch {
  display: inline-block;
  border-radius: 3px;
  background: currentColor;
  opacity: 0.72;
}

.size-input-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.size-input-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.78;
}

.size-input-row input {
  width: 100%;
  min-width: 0;
  height: 28px;
  border-radius: 7px;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.68);
  color: inherit;
  padding: 0 6px;
  text-align: center;
}

:global(.dark) .size-input-row input {
  background: rgba(0, 0, 0, 0.22);
}
</style>
