<script setup lang="ts">
import {computed} from "vue";
import {useConfigStore} from "../../../../stores/useConfigStore.ts";

const store = useConfigStore();

const mode = computed<"icon" | "card">({
  get() {
    return (store.config.theme as any).siteLayoutMode || "icon";
  },
  set(v) {
    (store.config.theme as any).siteLayoutMode = v;
  },
});
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

      <!-- 预览小图（模拟效果） -->
      <div class="grid grid-cols-2 gap-3">
        <!-- Icon preview -->
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
                图标 + 标题（更简洁）
              </div>
            </div>
          </div>
        </button>

        <!-- Card preview (2×1 风格：只保留 title/domain/remark) -->
        <button
            type="button"
            @click="mode = 'card'"
            class="w-full rounded-2xl p-3 text-left transition-all"
            :class="mode === 'card' ? 'ring-2 ring-[var(--accent-color)]' : 'opacity-80 hover:opacity-100'"
            style="background: rgba(var(--overlay-rgb), 0.14); border: 1px solid rgba(var(--overlay-rgb), 0.14);"
        >
          <div
              class="preview-card flex items-center gap-3 min-w-0"
              style="min-height: 72px;"
          >
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

                <!-- 右侧极简装饰点（可删），不显示数字、不显示 tags -->
                <div
                    class="shrink-0 rounded-full"
                    style="width: 8px; height: 8px; background: rgba(var(--overlay-rgb), 0.28); border: 1px solid rgba(var(--overlay-rgb), 0.18);"
                ></div>
              </div>

              <div class="mt-2 text-[11px] opacity-80 line-clamp-2" style="color: var(--text-primary);">
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
      <div class="flex rounded-lg p-1 bg-[var(--modal-input-bg)]">
        <button
            @click="store.config.theme.sidebarPos = 'left'"
            class="px-3 py-1 rounded-md text-xs font-bold transition-all"
            :class="store.config.theme.sidebarPos === 'left'
            ? 'bg-[var(--accent-color)] text-white shadow'
            : 'opacity-50 hover:opacity-100'"
            type="button"
        >
          左侧
        </button>
        <button
            @click="store.config.theme.sidebarPos = 'right'"
            class="px-3 py-1 rounded-md text-xs font-bold transition-all"
            :class="store.config.theme.sidebarPos === 'right'
            ? 'bg-[var(--accent-color)] text-white shadow'
            : 'opacity-50 hover:opacity-100'"
            type="button"
        >
          右侧
        </button>
      </div>
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
