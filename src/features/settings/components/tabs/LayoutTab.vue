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

/** ---------------------------
 * Layout mode
 * -------------------------- */
const mode = computed<"icon" | "card">({
  get() {
    return (store.config.theme as any).siteLayoutMode || "icon";
  },
  set(v) {
    (store.config.theme as any).siteLayoutMode = v;
  },
});

/** ---------------------------
 * Card size (w×h)
 * - 预设：2×1 / 3×1
 * - 自定义：滑块调整 w/h（目前你只需要 1 行高度，可保留扩展）
 * -------------------------- */
const cardW = computed<number>({
  get() {
    return Number((store.config.theme as any).siteCard?.w ?? 3);
  },
  set(v) {
    (store.config.theme as any).siteCard = {
      ...(store.config.theme as any).siteCard,
      w: v,
    };
  },
});

const cardH = computed<number>({
  get() {
    return Number((store.config.theme as any).siteCard?.h ?? 1);
  },
  set(v) {
    (store.config.theme as any).siteCard = {
      ...(store.config.theme as any).siteCard,
      h: v,
    };
  },
});

type CardPreset = "2x1" | "3x1" | "custom";

const preset = computed<CardPreset>({
  get() {
    const w = cardW.value;
    const h = cardH.value;
    if (w === 2 && h === 1) return "2x1";
    if (w === 3 && h === 1) return "3x1";
    return "custom";
  },
  set(v) {
    if (v === "2x1") {
      cardW.value = 2;
      cardH.value = 1;
    } else if (v === "3x1") {
      cardW.value = 3;
      cardH.value = 1;
    }
    // custom：不强制改值
  },
});

/** 预览：用 3 列网格模拟占格 */
const previewCardColSpan = computed(() => {
  const w = Math.max(2, Math.min(3, cardW.value));
  return w === 2 ? "col-span-2" : "col-span-3";
});

/** 预览：3×1 允许备注两行；2×1 一行更稳 */
const previewRemarkClamp = computed(() => (cardW.value >= 3 ? 2 : 1));
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- 布局模式 -->
    <div class="space-y-3">
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

      <!-- ✅ 卡片大小（仅在卡片模式显示） -->
      <div v-if="mode === 'card'" class="space-y-3">
        <div class="flex justify-between items-center">
          <label class="font-bold text-sm">卡片大小</label>

          <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
            <button
                type="button"
                @click="preset = '2x1'"
                class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '2x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              2×1
            </button>

            <button
                type="button"
                @click="preset = '3x1'"
                class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === '3x1'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              3×1
            </button>

            <button
                type="button"
                @click="preset = 'custom'"
                class="px-3 py-1 rounded-md text-xs font-bold transition-all"
                :class="preset === 'custom'
                ? 'bg-[var(--accent-color)] text-white shadow'
                : 'opacity-50 hover:opacity-100'"
            >
              自定义
            </button>
          </div>
        </div>

        <!-- 自定义：w/h 滑块（目前你的卡片高度建议固定 1，这里保留扩展） -->
        <div v-if="preset === 'custom'" class="space-y-3">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">宽度（列）</span>
              <span class="text-xs opacity-60" style="color: var(--text-secondary);">{{ cardW }}</span>
            </div>
            <input
                type="range"
                v-model.number="cardW"
                min="2"
                max="3"
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
                max="1"
                step="1"
                class="w-full accent-[var(--accent-color)]"
            />
          </div>
        </div>

        <div class="text-[11px] opacity-60" style="color: var(--text-secondary);">
          2×1 更紧凑；3×1 更适合标题较长或备注较多的站点。
        </div>
      </div>

      <!-- ✅ 预览小图（模拟效果） -->
      <!-- 用 3 列，让 3×1 的预览能“变宽”看出来 -->
      <div class="grid grid-cols-3 gap-3">
        <!-- Icon preview (占 1 列) -->
        <button
            type="button"
            @click="mode = 'icon'"
            class="col-span-1 w-full rounded-2xl p-3 text-left transition-all"
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

        <!-- Card preview：随 2×1 / 3×1 变宽（不显示 tags/数字） -->
        <button
            type="button"
            @click="mode = 'card'"
            class="w-full rounded-2xl p-3 text-left transition-all"
            :class="[
            mode === 'card' ? 'ring-2 ring-[var(--accent-color)]' : 'opacity-80 hover:opacity-100',
            previewCardColSpan
          ]"
            style="background: rgba(var(--overlay-rgb), 0.14); border: 1px solid rgba(var(--overlay-rgb), 0.14);"
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

                <!-- 右侧极简装饰点（可删） -->
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

      <div class="text-[11px] opacity-60" style="color: var(--text-secondary);">
        图标模式更简洁；卡片模式可展示域名与备注（更适合管理类分组）。
      </div>
    </div>

    <!-- 侧边栏 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">侧边栏位置</label>
      <div class="grid grid-cols-4 rounded-lg p-1 bg-[var(--modal-input-bg)]">
        <button
            v-for="pos in sidebarPositions"
            :key="pos.value"
            @click="store.config.theme.sidebarPos = pos.value"
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

    <!-- 分组浏览 -->
    <div class="flex justify-between items-center gap-4">
      <div class="min-w-0">
        <label class="font-bold text-sm">显示全部分组</label>
        <div class="text-[11px] opacity-60 mt-1" style="color: var(--text-secondary);">
          关闭时只显示当前分组；开启后中间区域可连续浏览所有分组。
        </div>
      </div>
      <input
          type="checkbox"
          v-model="store.config.theme.showAllGroupsInMain"
          class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"
      />
    </div>

    <!-- 时间组件 -->
    <div class="flex justify-between items-center">
      <label class="font-bold text-sm">时间组件</label>
      <input
          type="checkbox"
          v-model="store.config.theme.showTime"
          class="w-5 h-5 accent-[var(--accent-color)]"
      />
    </div>

    <!-- 最大宽度 -->
    <div class="flex justify-between items-center">
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
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
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
