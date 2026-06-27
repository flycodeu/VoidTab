<script setup lang="ts">
import {computed} from "vue";
import {useConfigStore} from "../../../../stores/useConfigStore.ts";
import type {SidebarPosition} from "../../../../core/config/types.ts";

const store = useConfigStore();

const sidebarPositions: Array<{ value: SidebarPosition; label: string }> = [
  {value: "left", label: "左侧"},
  {value: "right", label: "右侧"},
  {value: "top", label: "顶部"},
  {value: "bottom", label: "底部"},
];

const mode = computed<"icon" | "card">({
  get() {
    return (store.config.theme as any).siteLayoutMode || "icon";
  },
  set(v) {
    (store.config.theme as any).siteLayoutMode = v;
  },
});

const clampCardSize = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const cardW = computed<number>({
  get() {
    return clampCardSize((store.config.theme as any).siteCard?.w, 1, 16, 3);
  },
  set(v) {
    (store.config.theme as any).siteCard = {
      ...(store.config.theme as any).siteCard,
      w: clampCardSize(v, 1, 16, 3),
    };
  },
});

const cardH = computed<number>({
  get() {
    return clampCardSize((store.config.theme as any).siteCard?.h, 1, 16, 1);
  },
  set(v) {
    (store.config.theme as any).siteCard = {
      ...(store.config.theme as any).siteCard,
      h: clampCardSize(v, 1, 16, 1),
    };
  },
});

type CardPreset = "1x1" | "2x1" | "3x1" | "4x1" | "custom";

const preset = computed<CardPreset>({
  get() {
    const w = cardW.value;
    const h = cardH.value;
    if (w === 1 && h === 1) return "1x1";
    if (w === 2 && h === 1) return "2x1";
    if (w === 3 && h === 1) return "3x1";
    if (w === 4 && h === 1) return "4x1";
    return "custom";
  },
  set(v) {
    if (v === "1x1") {
      cardW.value = 1;
      cardH.value = 1;
    } else if (v === "2x1") {
      cardW.value = 2;
      cardH.value = 1;
    } else if (v === "3x1") {
      cardW.value = 3;
      cardH.value = 1;
    } else if (v === "4x1") {
      cardW.value = 4;
      cardH.value = 1;
    }
  },
});

const previewCardStyle = computed(() => ({
  gridColumn: cardW.value > 4 ? '1 / -1' : `span ${Math.max(1, cardW.value)}`,
  minHeight: `${Math.min(180, Math.max(72, cardH.value * 42))}px`,
  background: 'rgba(var(--overlay-rgb), 0.14)',
  border: '1px solid rgba(var(--overlay-rgb), 0.14)',
}));

const previewRemarkClamp = computed(() => (cardW.value >= 3 || cardH.value >= 2 ? 2 : 1));
</script>

<template>
  <div class="layout-tab animate-fade-in">
    <section class="layout-section">
      <div class="flex justify-between items-center">
        <label class="font-bold text-sm">布局模式</label>

        <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
          <button
              @click="mode = 'icon'"
              class="px-3 py-1 rounded-md text-xs font-bold transition-all"
              :class="mode === 'icon'
              ? 'bg-[var(--accent-color)] text-white shadow'
              : 'opacity-50 hover:opacity-100'"
              type="button"
          >
            图标
          </button>

          <button
              @click="mode = 'card'"
              class="px-3 py-1 rounded-md text-xs font-bold transition-all"
              :class="mode === 'card'
              ? 'bg-[var(--accent-color)] text-white shadow'
              : 'opacity-50 hover:opacity-100'"
              type="button"
          >
            卡片
          </button>
        </div>
      </div>

      <div v-if="mode === 'card'" class="space-y-3">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">卡片大小</label>

          <div class="grid grid-cols-5 rounded-lg p-1 bg-[var(--modal-input-bg)]">
            <button
                type="button"
                @click="preset = '1x1'"
                class="px-2 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '1x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              1×1
            </button>

            <button
                type="button"
                @click="preset = '2x1'"
                class="px-2 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '2x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              2×1
            </button>

            <button
                type="button"
                @click="preset = '3x1'"
                class="px-2 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '3x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              3×1
            </button>

            <button
                type="button"
                @click="preset = '4x1'"
                class="px-2 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '4x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              4×1
            </button>

            <button
                type="button"
                @click="preset = 'custom'"
                class="px-2 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === 'custom'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              自定义
            </button>
          </div>
        </div>

        <div v-if="preset === 'custom'" class="space-y-3">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">宽度（列）</span>
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">{{ cardW }}</span>
            </div>
            <input
                type="range"
                v-model.number="cardW"
                min="1"
                max="16"
                step="1"
                class="w-full accent-[var(--accent-color)]"
            />
          </div>

          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">高度（行）</span>
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">{{ cardH }}</span>
            </div>
            <input
                type="range"
                v-model.number="cardH"
                min="1"
                max="16"
                step="1"
                class="w-full accent-[var(--accent-color)]"
            />
          </div>
        </div>

      </div>

      <div class="layout-preview-grid">
        <button
            type="button"
            @click="mode = 'icon'"
            class="w-full rounded-2xl p-3 text-left transition-all"
            :class="mode === 'icon' ? 'ring-2 ring-[var(--accent-color)]' : 'opacity-80 hover:opacity-100'"
            style="background: rgba(var(--overlay-rgb), 0.14); border: 1px solid rgba(var(--overlay-rgb), 0.14);"
        >
          <div class="flex items-center gap-3">
            <div
                class="shrink-0 rounded-2xl flex items-center justify-center font-extrabold"
                style="width: 44px; height: 44px; background: rgba(var(--accent-color-rgb), 0.9); color: white;"
            >
              DEV
            </div>
            <div class="min-w-0">
              <div class="text-xs font-extrabold truncate" style="color: var(--text-primary);">
                开发资源
              </div>
              <div class="text-[11px] opacity-60 truncate" style="color: var(--text-secondary);">
                图标 + 标题
              </div>
            </div>
          </div>
        </button>

        <button
            type="button"
            @click="mode = 'card'"
            class="w-full rounded-2xl p-3 text-left transition-all"
            :class="[
            mode === 'card' ? 'ring-2 ring-[var(--accent-color)]' : 'opacity-80 hover:opacity-100',
          ]"
            :style="previewCardStyle"
        >
          <div class="preview-card flex items-center gap-3 min-w-0" style="min-height: 72px;">
            <div
                class="shrink-0 rounded-2xl flex items-center justify-center font-extrabold"
                style="width: 44px; height: 44px; background: rgba(var(--accent-color-rgb), 0.9); color: white;"
            >
              GH
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2 min-w-0">
                <div class="min-w-0">
                  <div class="text-xs font-extrabold truncate" style="color: var(--text-primary);">
                    GitHub
                  </div>
                  <div class="text-[11px] opacity-60 truncate mt-0.5" style="color: var(--text-secondary);">
                    github.com
                  </div>
                </div>

                <div
                    class="shrink-0 rounded-full"
                    style="width: 8px; height: 8px; background: rgba(var(--overlay-rgb), 0.28); border: 1px solid rgba(var(--overlay-rgb), 0.18);"
                ></div>
              </div>

              <div
                  class="mt-2 text-[11px] opacity-80"
                  style="color: var(--text-primary);"
                  :class="previewRemarkClamp === 2 ? 'line-clamp-2' : 'truncate'"
              >
                这里显示备注：用途、账号、环境说明等…
              </div>
            </div>
          </div>
        </button>
      </div>
    </section>

    <section class="layout-section">
    <div class="setting-line">
      <div class="min-w-0">
        <label class="font-bold text-sm">显示分组栏</label>
      </div>
      <input
          type="checkbox"
          v-model="store.config.theme.showSidebar"
          class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"
      />
    </div>

    <div
        class="setting-line desktop-only"
        :class="!store.config.theme.showSidebar ? 'opacity-45' : ''"
    >
      <label class="font-bold text-sm">分组栏位置</label>
      <div class="grid grid-cols-4 rounded-lg p-1 bg-[var(--modal-input-bg)]">
        <button
            v-for="pos in sidebarPositions"
            :key="pos.value"
            @click="store.config.theme.sidebarPos = pos.value"
            :disabled="!store.config.theme.showSidebar"
            class="px-3 py-1 rounded-md text-xs font-bold transition-all"
            :class="store.config.theme.sidebarPos === pos.value
            ? 'bg-[var(--accent-color)] text-white shadow'
            : 'opacity-50 hover:opacity-100'"
            type="button"
        >
          {{ pos.label }}
        </button>
      </div>
    </div>

    <div
        class="lg:hidden mobile-note"
        style="border-color: var(--glass-border); background: var(--modal-input-bg); color: var(--text-secondary);"
    >
      手机端分组栏固定在底部。
    </div>

    <div class="setting-line">
      <div class="min-w-0">
        <label class="font-bold text-sm">显示全部分组</label>
      </div>
      <input
          type="checkbox"
          v-model="store.config.theme.showAllGroupsInMain"
          class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"
      />
    </div>

    <div class="setting-line">
      <label class="font-bold text-sm">时间组件</label>
      <input
          type="checkbox"
          v-model="store.config.theme.showTime"
          class="w-5 h-5 accent-[var(--accent-color)]"
      />
    </div>
    </section>

    <section class="layout-section">
    <div class="setting-line">
      <label class="font-bold text-sm">最大宽度</label>
      <span class="text-xs opacity-60">{{ store.config.theme.gridMaxWidth }}px</span>
    </div>
    <input
        type="range"
        v-model.number="store.config.theme.gridMaxWidth"
        min="800"
        max="2000"
        class="w-full accent-[var(--accent-color)]"
    />
    </section>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

.layout-tab {
  display: grid;
  gap: 16px;
}

.layout-section {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  background: var(--modal-input-bg);
}

.layout-preview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.layout-preview-grid > button:first-child {
  grid-column: span 1;
}

.setting-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 42px;
}

.mobile-note {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid;
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 1023px) {
  .desktop-only {
    display: none;
  }
}

@media (max-width: 680px) {
  .layout-preview-grid {
    grid-template-columns: 1fr;
  }

  .layout-preview-grid > button,
  .layout-preview-grid > button:first-child {
    grid-column: 1 / -1 !important;
  }

  .setting-line {
    align-items: flex-start;
  }
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

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
