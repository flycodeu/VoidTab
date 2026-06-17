<script setup lang="ts">
import { computed } from 'vue';
import {
  PhWarning,
  PhDevices,
  PhCloud,
  PhArrowLeft,
  PhArrowRight,
  PhClock,
  PhCloudArrowUp,
  PhX,
} from '@phosphor-icons/vue';
import type { ConflictSnapshot } from '../../../core/sync/types';

const props = defineProps<{
  snapshot: ConflictSnapshot;
  resolving: boolean;
}>();

const emit = defineEmits<{
  keepLocal: [];
  useRemote: [];
  postpone: [];
  exportLocal: [];
}>();

const fmtTime = (ts: number) => {
  if (!ts) return '未知';
  return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const localTime = computed(() => fmtTime(props.snapshot.summary.localLastModified));
const remoteTime = computed(() => fmtTime(props.snapshot.summary.remoteLastModified));

const localIsNewer = computed(() =>
  props.snapshot.summary.localLastModified >= props.snapshot.summary.remoteLastModified
);
</script>

<template>
  <Teleport to="body">
    <div
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);"
    >
      <div
          class="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
          style="background: var(--settings-surface); border: 1px solid var(--settings-border);"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-title"
      >
        <!-- Header -->
        <div class="flex items-start gap-3 p-5 border-b" style="border-color: var(--settings-border);">
          <div
              class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style="background: rgba(245,158,11,0.15);"
          >
            <PhWarning size="20" weight="fill" class="text-amber-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 id="conflict-title" class="font-bold text-base" style="color: var(--settings-text);">
              检测到同步冲突
            </h2>
            <p class="text-xs mt-0.5 opacity-60" style="color: var(--settings-text);">
              本设备与云端数据均有改动，请选择保留哪一份。
            </p>
          </div>
          <button
              class="w-7 h-7 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              style="color: var(--settings-text);"
              @click="emit('postpone')"
              title="稍后处理"
          >
            <PhX size="16" weight="bold" />
          </button>
        </div>

        <!-- Comparison -->
        <div class="p-5 grid grid-cols-2 gap-3">
          <!-- Local -->
          <div
              class="rounded-xl p-4 border"
              :style="{
                background: localIsNewer ? 'rgba(var(--accent-color-rgb),0.06)' : 'var(--settings-panel)',
                borderColor: localIsNewer ? 'rgba(var(--accent-color-rgb),0.25)' : 'var(--settings-border)',
              }"
          >
            <div class="flex items-center gap-2 mb-3">
              <PhDevices size="15" weight="bold" style="color: var(--accent-color);" />
              <span class="font-bold text-xs" style="color: var(--settings-text);">本设备</span>
            </div>
            <div class="space-y-1.5 text-[11px]" style="color: var(--settings-text-secondary);">
              <div class="flex justify-between">
                <span class="opacity-70">分组</span>
                <span class="font-bold" style="color: var(--settings-text);">{{ snapshot.summary.localGroupCount }}</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-70">站点</span>
                <span class="font-bold" style="color: var(--settings-text);">{{ snapshot.summary.localSiteCount }}</span>
              </div>
              <div class="flex justify-between items-start gap-1">
                <span class="opacity-70 shrink-0">主题</span>
                <span class="font-medium text-right truncate" style="color: var(--settings-text);">{{ snapshot.summary.localThemeLabel }}</span>
              </div>
              <div class="flex items-center gap-1 pt-1 border-t opacity-60" style="border-color: var(--settings-border);">
                <PhClock size="11" />
                <span>{{ localTime }}</span>
              </div>
            </div>
          </div>

          <!-- Remote -->
          <div
              class="rounded-xl p-4 border"
              :style="{
                background: !localIsNewer ? 'rgba(var(--accent-color-rgb),0.06)' : 'var(--settings-panel)',
                borderColor: !localIsNewer ? 'rgba(var(--accent-color-rgb),0.25)' : 'var(--settings-border)',
              }"
          >
            <div class="flex items-center gap-2 mb-3">
              <PhCloud size="15" weight="bold" style="color: var(--accent-color);" />
              <span class="font-bold text-xs" style="color: var(--settings-text);">云端</span>
            </div>
            <div class="space-y-1.5 text-[11px]" style="color: var(--settings-text-secondary);">
              <div class="flex justify-between">
                <span class="opacity-70">分组</span>
                <span class="font-bold" style="color: var(--settings-text);">{{ snapshot.summary.remoteGroupCount }}</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-70">站点</span>
                <span class="font-bold" style="color: var(--settings-text);">{{ snapshot.summary.remoteSiteCount }}</span>
              </div>
              <div class="flex justify-between items-start gap-1">
                <span class="opacity-70 shrink-0">主题</span>
                <span class="font-medium text-right truncate" style="color: var(--settings-text);">{{ snapshot.summary.remoteThemeLabel }}</span>
              </div>
              <div class="flex items-center gap-1 pt-1 border-t opacity-60" style="border-color: var(--settings-border);">
                <PhClock size="11" />
                <span>{{ remoteTime }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Export hint -->
        <div class="px-5 pb-3">
          <button
              class="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-90 transition-opacity"
              style="color: var(--accent-color);"
              @click="emit('exportLocal')"
          >
            <PhCloudArrowUp size="13" />
            <span>操作前先导出本地备份</span>
          </button>
        </div>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-2 p-5 pt-0">
          <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style="background: rgba(var(--accent-color-rgb),0.12); color: var(--accent-color);"
              :disabled="resolving"
              @click="emit('keepLocal')"
          >
            <PhArrowLeft size="15" weight="bold" />
            保留本设备
          </button>
          <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style="background: var(--accent-color); color: white;"
              :disabled="resolving"
              @click="emit('useRemote')"
          >
            使用云端
            <PhArrowRight size="15" weight="bold" />
          </button>
          <button
              class="sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold opacity-60 hover:opacity-100 transition-opacity"
              style="background: var(--settings-panel); color: var(--settings-text); border: 1px solid var(--settings-border);"
              :disabled="resolving"
              @click="emit('postpone')"
          >
            稍后
          </button>
        </div>

        <!-- Warning -->
        <div class="px-5 pb-5">
          <p class="text-[10px] opacity-40 text-center" style="color: var(--settings-text);">
            选择后该操作无法撤销
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
