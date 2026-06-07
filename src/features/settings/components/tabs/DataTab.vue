<script setup lang="ts">
import {ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {
  PhDownloadSimple,
  PhFileArrowUp,
  PhBookmarkSimple,
  PhWarning,
  PhCheck,
  PhCode,
  PhTrash
} from '@phosphor-icons/vue';

import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';

import {migrateConfig} from '../../../../core/config/migrate.ts';
import {normalizeConfig} from '../../../../core/config/normalize.ts';
import {exportBookmarksToHtml} from '../../../../core/bookmarks/export.ts';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const toast = useToast();
const fileInput = ref<HTMLInputElement | null>(null);
const bookmarkInput = ref<HTMLInputElement | null>(null);

// --- 弹窗相关状态：导入覆盖 ---
const showConfirm = ref(false);
const pendingData = ref<any>(null);

// --- 操作结果提示状态 ---
const opResult = ref<{ success: boolean; msg: string } | null>(null);

const showFeedback = (success: boolean, msg: string) => {
  opResult.value = {success, msg};
  if (success) toast.success(msg);
  else toast.error(msg);
  setTimeout(() => {
    opResult.value = null;
  }, 3000);
};

// ===============================
// 导出 JSON
// ===============================
const handleExport = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.config, null, 2)], {type: 'application/json'}));
  a.download = `voidtab-backup.json`;
  a.click();
};

// 导出浏览器书签 HTML（只导出分组+网站）
const handleExportHtml = () => {
  try {
    const html = exportBookmarksToHtml(store.config);

    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `voidtab-bookmarks.html`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 0);

    showFeedback(true, '已导出浏览器书签 HTML（可在 Edge/Chrome 导入）');
  } catch {
    showFeedback(false, '导出 HTML 失败，请稍后重试');
  }
};

const triggerImport = () => fileInput.value?.click();

// 读取 JSON 并触发弹窗
const handleImport = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const raw = JSON.parse(String(ev.target?.result ?? ''));
      if (!raw || typeof raw !== 'object') {
        showFeedback(false, '导入失败：不是有效的配置 JSON');
        return;
      }

      pendingData.value = raw;
      showConfirm.value = true;

    } catch {
      showFeedback(false, '导入失败：文件格式不正确');
    }
  };

  r.readAsText(file);
  (e.target as HTMLInputElement).value = '';
};

// 用户点击“确认覆盖”后执行导入
const executeImport = () => {
  if (!pendingData.value) return;

  try {
    const raw = pendingData.value;
    const next = normalizeConfig(migrateConfig(raw));

    // 保留 webdav 字段逻辑（不改变你原本行为）
    const cur = {...(store.config.sync as any)};
    const ns = {...(next.sync as any)};

    const keepIfEmpty = (k: string) => {
      if (ns[k] === undefined || ns[k] === null || ns[k] === '') ns[k] = cur[k];
    };

    if (cur?.provider === 'webdav' && ns?.provider === 'webdav') {
      keepIfEmpty('url');
      keepIfEmpty('username');
      keepIfEmpty('password');
      keepIfEmpty('folder');
      keepIfEmpty('filename');
    }

    next.sync = ns;
    store.config = next as any;

    showConfirm.value = false;
    pendingData.value = null;

    showFeedback(true, '配置导入成功');

  } catch {
    showFeedback(false, '导入时发生未知错误');
  }
};

// ===============================
// 导入浏览器书签
// ===============================
const triggerBookmarkImport = () => bookmarkInput.value?.click();

const handleBookmarkUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    if (!content) return;

    const result = store.importBookmarks(content);

    if (result.success) {
      showFeedback(true, `导入成功！共导入 ${result.groupCount} 个分组，${result.count} 个书签`);
    } else {
      showFeedback(false, result.message || '导入失败');
    }
  };

  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
};

// ===============================
// ✅ 新增：恢复默认设置（危险）双重确认
// ===============================
const showReset1 = ref(false);
const showReset2 = ref(false);

const openReset = () => {
  showReset1.value = true;
};

const goResetStep2 = () => {
  showReset1.value = false;
  showReset2.value = true;
};

const executeResetAll = async () => {
  showReset2.value = false;

  try {
    // store 里实现 resetToDefault（下面我给完整 store 代码）
    await (store as any).resetToDefault?.();

    // 如果 store 没实现，给提示（理论不会走到这）
    if (!(store as any).resetToDefault) {
      showFeedback(false, 'resetToDefault 未实现，请先在 useConfigStore 添加该方法');
      return;
    }

    // ✅ 强制刷新，确保所有页面/Pinia状态/缓存都回到干净状态
    location.reload();
  } catch {
    showFeedback(false, '恢复默认设置失败，请稍后重试');
  }
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- 导出 / 导入 JSON -->
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导出数据</h3>

        <div class="flex items-center gap-2">
          <button
              @click="handleExportHtml"
              class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition"
              title="导出为浏览器书签 HTML（Edge/Chrome/Firefox 可导入）"
          >
            <PhCode size="16" weight="bold"/>
            导出 HTML
          </button>

          <button
              @click="handleExport"
              class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center gap-2"
          >
            <PhDownloadSimple size="16" weight="bold"/>
            导出 JSON
          </button>
        </div>
      </div>

      <hr class="opacity-10"/>

      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导入数据</h3>
        <button
            @click="triggerImport"
            class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition"
        >
          <PhFileArrowUp size="16" weight="bold"/>
          导入 JSON
          <input type="file" ref="fileInput" class="hidden" @change="handleImport"/>
        </button>
      </div>
    </div>

    <!-- 导入浏览器书签 -->
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 rounded-lg bg-orange-500/10 text-orange-500">
          <PhBookmarkSimple size="20" weight="duotone"/>
        </div>
        <div>
          <h3 class="font-bold text-sm">导入浏览器书签</h3>
          <p class="text-[10px] opacity-60">支持 Chrome/Edge/Firefox HTML</p>
        </div>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs opacity-50">将文件夹解析为分组</span>
        <button
            @click="triggerBookmarkImport"
            class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold hover:bg-orange-500 hover:text-white hover:border-transparent transition-all flex items-center gap-2"
        >
          <PhFileArrowUp size="14" weight="bold"/>
          选择 HTML 文件
          <input type="file" ref="bookmarkInput" class="hidden" accept=".html" @change="handleBookmarkUpload"/>
        </button>
      </div>
    </div>

    <!-- ✅ 新增：危险区域（放在页面底部最合理） -->
    <div class="p-5 rounded-2xl border border-red-500/25 bg-red-500/5 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 font-extrabold text-sm text-red-600">
            <PhWarning size="18" weight="fill"/>
            危险区域
          </div>
          <p class="text-[11px] opacity-70 leading-relaxed mt-1">
            “恢复默认设置”将清空本地保存的所有数据（分组/站点/主题/同步配置/历史等），并刷新页面。<br/>
            强烈建议先执行一次“导出 JSON”备份，避免数据丢失。
          </p>
        </div>

        <button
            @click="openReset"
            class="shrink-0 px-4 py-2 rounded-lg text-xs font-extrabold text-red-600 border border-red-500/30 hover:bg-red-500/10 active:scale-95 transition flex items-center gap-2"
        >
          <PhTrash size="16" weight="bold"/>
          恢复默认设置
        </button>
      </div>
    </div>

    <!-- 操作结果提示 -->
    <div
        v-if="opResult"
        class="flex items-center justify-center gap-2 text-sm font-bold animate-fade-in py-2"
        :class="opResult.success ? 'text-green-500' : 'text-red-500'"
    >
      <component :is="opResult.success ? PhCheck : PhWarning" size="18" weight="fill"/>
      {{ opResult.msg }}
    </div>

    <!-- 导入覆盖确认 -->
    <ConfirmDialog
        :show="showConfirm"
        title="覆盖当前配置？"
        :message="['导入操作将完全覆盖您当前的本地设置。', '我们会自动迁移旧版数据格式，但建议先备份当前配置。']"
        confirmText="确认覆盖"
        cancelText="取消"
        :danger="true"
        @cancel="showConfirm = false"
        @confirm="executeImport"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>

    <!-- ✅ 重置 第一次确认 -->
    <ConfirmDialog
        :show="showReset1"
        title="恢复默认设置？"
        :message="[
        '该操作将清空本地保存的所有数据（包含分组/站点/主题/同步配置/历史等）。',
        '强烈建议先点击“导出 JSON”进行备份。',
        '此操作不可撤销。'
      ]"
        confirmText="我已了解，继续"
        cancelText="取消"
        :danger="true"
        :closeOnBackdrop="false"
        @cancel="showReset1 = false"
        @confirm="goResetStep2"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>

    <!-- ✅ 重置 第二次确认（最后确认） -->
    <ConfirmDialog
        :show="showReset2"
        title="最后确认：立即清空本地数据"
        :message="[
        '确认后将立即清空本地数据并刷新页面。',
        '如果你没有备份，数据将无法找回。'
      ]"
        confirmText="确认清空"
        cancelText="我再想想"
        :danger="true"
        :closeOnBackdrop="false"
        @cancel="showReset2 = false"
        @confirm="executeResetAll"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>
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
</style>
