<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {
  PhDownloadSimple,
  PhFileArrowUp,
  PhBookmarkSimple,
  PhWarning,
  PhCheck,
  PhCode,
  PhTrash,
  PhArrowsClockwise,
  PhUploadSimple
} from '@phosphor-icons/vue';

import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';

import {migrateConfig} from '../../../../core/config/migrate.ts';
import {normalizeConfig} from '../../../../core/config/normalize.ts';
import {mergeLocalSensitiveFields} from '../../../../core/config/sensitive.ts';
import {isConfigVersionTooNew, preflightConfigForReader} from '../../../../core/config/preflight.ts';
import {createImportValidationMessages, validateImportedConfig} from '../../../../core/config/validate.ts';
import {createConfigV6SyncExport, restoreConfigV6FromSyncExportWithReport} from '../../../../core/sync/v6Channel.ts';
import {migrateV5ToV6} from '../../../../core/config/migrateV5ToV6.ts';
import {normalizeConfigV6} from '../../../../core/config/v6.ts';
import {getStableConfigDeviceId} from '../../../../core/config/deviceId.ts';
import {exportBookmarksToHtml} from '../../../../core/bookmarks/export.ts';
import {
  isBrowserBookmarksSupported,
  hasBookmarksPermission,
  requestBookmarksPermission,
  readBrowserBookmarkGroups,
  writeGroupsToBrowser,
} from '../../../../core/bookmarks/browserBookmarks.ts';
import {hydrateTileInstallsFromRepository} from '../../../../core/tiles/packageRepository.ts';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const toast = useToast();
const fileInput = ref<HTMLInputElement | null>(null);
const bookmarkInput = ref<HTMLInputElement | null>(null);

// --- 弹窗相关状态：导入覆盖 ---
const showConfirm = ref(false);
const pendingData = ref<any>(null);
const pendingImportMessages = ref<string[]>([]);
const showV6SyncConfirm = ref(false);
const upgradeBusy = ref(false);

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

const v6SyncConfirmationPending = computed(() => store.config.sync.provider === 'webdav'
    && store.config.sync.enabled
    && store.config.sync.syncSchemaChannel !== 'v6');

const isV6WirePayload = (raw: unknown): raw is {version: 6} =>
    !!raw && typeof raw === 'object' && (raw as {version?: unknown}).version === 6;

const normalizeImportedConfig = async (raw: unknown) => {
  const existingInstalls = await hydrateTileInstallsFromRepository(store.config.tileInstalls);
  if (isV6WirePayload(raw)) {
    return restoreConfigV6FromSyncExportWithReport(raw, {
      existingInstalls,
      now: Date.now(),
    }).config;
  }
  const migrated = migrateConfig(raw);
  const next = normalizeConfigV6(migrateV5ToV6(normalizeConfig(migrated), {
    deviceId: getStableConfigDeviceId(),
    migratedAt: Date.now(),
  }).config);
  next.tileInstalls = existingInstalls;
  return next;
};

// ===============================
// 导出 JSON
// ===============================
const handleExport = () => {
  const exportData = createConfigV6SyncExport(store.config);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'}));
  a.download = 'voidtab-backup.v6.json';
  a.click();
  showFeedback(true, '已导出 JSON（不含 AI Key、WebDAV 密码和临时 Token）');
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

const cancelImport = () => {
  showConfirm.value = false;
  pendingData.value = null;
  pendingImportMessages.value = [];
};

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

      try {
        preflightConfigForReader(raw);
      } catch (error) {
        if (isConfigVersionTooNew(error)) {
          showFeedback(false, `导入失败：备份需要 v${error.foundVersion} 客户端；当前数据未改动`);
          return;
        }
        throw error;
      }

      if (isV6WirePayload(raw)) {
        try {
          const restored = restoreConfigV6FromSyncExportWithReport(raw, {
            existingInstalls: store.config.tileInstalls,
            now: Date.now(),
          });
          const recoveryCount = restored.recoveryRecords.length;
          pendingImportMessages.value = [
            '将导入备份配置；本地组件安装记录和运行时缓存不会被覆盖。',
            ...(recoveryCount > 0
                ? [`检测到 ${recoveryCount} 条恢复记录，导入后可在“同步”页查看缺失组件包、布局重叠或冲突提示。`]
                : []),
          ];
        } catch (error: any) {
          showFeedback(false, `导入失败：${error?.message || 'v6 配置结构不符合要求'}`);
          return;
        }
      } else {
        const validation = validateImportedConfig(raw);
        if (!validation.ok) {
          showFeedback(false, `导入失败：${validation.errors[0] || '配置结构不符合要求'}`);
          return;
        }
        pendingImportMessages.value = createImportValidationMessages(validation);
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
const executeImport = async () => {
  if (!pendingData.value) return;

  try {
    const raw = pendingData.value;
    preflightConfigForReader(raw);
    const next = mergeLocalSensitiveFields(await normalizeImportedConfig(raw), store.config);

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

    // Sync routing is device-local state. A portable v6 file must never
    // silently authorize writes back to a legacy WebDAV filename.
    if (ns?.provider === 'webdav') {
      ns.syncSchemaUpgradePending = cur.syncSchemaUpgradePending;
      ns.syncSchemaChannel = cur.syncSchemaChannel;
    }

    next.sync = ns;
    store.config = next;

    showConfirm.value = false;
    pendingData.value = null;
    pendingImportMessages.value = [];

    showFeedback(true, '配置导入成功');

  } catch (error) {
    if (isConfigVersionTooNew(error)) {
      showFeedback(false, `导入失败：备份需要 v${error.foundVersion} 客户端；当前数据未改动`);
    } else {
      showFeedback(false, '导入时发生未知错误');
    }
  }
};

const executeV6SyncConfirmation = async () => {
  upgradeBusy.value = true;
  try {
    const result = await store.confirmV6SyncUpgrade();
    if (result.success) {
      showV6SyncConfirm.value = false;
      showFeedback(true, result.message);
    } else {
      showFeedback(false, result.message);
    }
  } catch (error: any) {
    showFeedback(false, error?.message || 'v6 同步通道确认失败');
  } finally {
    upgradeBusy.value = false;
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
      const duplicateCount = Number(result.duplicateCount || 0);
      const invalidCount = Number(result.skippedInvalid || 0);
      const baseMsg = result.message || `导入成功！新增 ${result.groupCount} 个分组，${result.count} 个书签`;
      const suffix = [
        duplicateCount > 0 ? `已跳过 ${duplicateCount} 个重复 URL` : '',
        invalidCount > 0 ? `已跳过 ${invalidCount} 个无效 URL` : '',
      ].filter(Boolean).join('，');
      showFeedback(true, suffix ? `${baseMsg}；${suffix}` : baseMsg);
    } else {
      showFeedback(false, result.message || '导入失败');
    }
  };

  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
};

// ===============================
// 浏览器书签双向同步（仅扩展环境）
// ===============================
const browserSyncSupported = isBrowserBookmarksSupported();
const browserSyncBusy = ref(false);

const ensureBookmarkPermission = async () => {
  if (await hasBookmarksPermission()) return true;
  const granted = await requestBookmarksPermission();
  if (!granted) showFeedback(false, '未授予书签权限，无法同步');
  return granted;
};

const syncFromBrowser = async () => {
  if (browserSyncBusy.value) return;
  browserSyncBusy.value = true;
  try {
    if (!(await ensureBookmarkPermission())) return;
    const groups = await readBrowserBookmarkGroups();
    const result = store.mergeBrowserBookmarkGroups(groups);
    if (result.added > 0) {
      showFeedback(true, `已从浏览器合并：新增 ${result.added} 个书签（合并 ${result.mergedGroups} 个分组、新建 ${result.newGroups} 个分组），跳过 ${result.skipped} 个重复`);
    } else {
      showFeedback(true, `没有新书签需要合并（已跳过 ${result.skipped} 个重复）`);
    }
  } catch (error) {
    showFeedback(false, error instanceof Error ? error.message : '同步失败');
  } finally {
    browserSyncBusy.value = false;
  }
};

const exportToBrowser = async () => {
  if (browserSyncBusy.value) return;
  browserSyncBusy.value = true;
  try {
    if (!(await ensureBookmarkPermission())) return;
    const groups = store.collectBookmarkGroupsForBrowser();
    if (!groups.length) {
      showFeedback(false, '当前没有可导出的书签');
      return;
    }
    const result = await writeGroupsToBrowser(groups);
    showFeedback(true, `已导出到浏览器「VoidTab」书签夹：新增 ${result.addedBookmarks} 个书签、${result.createdFolders} 个文件夹，跳过 ${result.skipped} 个重复`);
  } catch (error) {
    showFeedback(false, error instanceof Error ? error.message : '导出失败');
  } finally {
    browserSyncBusy.value = false;
  }
};

// ===============================
// ✅ 新增：恢复默认设置（危险）双重确认
// ===============================
const showReset1 = ref(false);
const showReset2 = ref(false);
const resetBackupAcknowledged = ref(false);

const openReset = () => {
  resetBackupAcknowledged.value = false;
  showReset1.value = true;
};

const goResetStep2 = () => {
  showReset1.value = false;
  resetBackupAcknowledged.value = false;
  showReset2.value = true;
};

const cancelResetStep2 = () => {
  showReset2.value = false;
  resetBackupAcknowledged.value = false;
};

const executeResetAll = async () => {
  if (!resetBackupAcknowledged.value) {
    showFeedback(false, '请先确认已导出备份或不需要保留当前数据');
    return;
  }

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

      <p class="text-[11px] opacity-60 leading-relaxed">
        JSON 备份会包含分组、站点、组件、主题和同步配置结构，但不会导出 AI Key、WebDAV 密码和临时 Token。
      </p>

      <hr class="opacity-10"/>

      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导入数据</h3>
        <button
            @click="triggerImport"
            class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition"
        >
          <PhFileArrowUp size="16" weight="bold"/>
          导入 JSON
          <input type="file" ref="fileInput" class="hidden" accept=".json,application/json" @change="handleImport"/>
        </button>
      </div>
    </div>

    <div v-if="v6SyncConfirmationPending" class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
      <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start justify-between gap-3">
        <p class="text-[11px] leading-relaxed opacity-85">
          WebDAV 自动同步已暂停。确认所有设备均已升级后才会写入新版同步文件；旧备份不会被覆盖。
        </p>
        <button
            type="button"
            class="shrink-0 px-3 py-2 rounded-lg border border-current/25 text-xs font-bold disabled:opacity-50"
            :disabled="upgradeBusy"
            @click="showV6SyncConfirm = true"
        >确认设备已升级</button>
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

    <!-- 浏览器书签双向同步（仅扩展环境） -->
    <div v-if="browserSyncSupported" class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 rounded-lg bg-blue-500/10 text-blue-500">
          <PhArrowsClockwise size="20" weight="duotone"/>
        </div>
        <div class="min-w-0">
          <h3 class="font-bold text-sm">浏览器书签同步</h3>
          <p class="text-[10px] opacity-60">合并而非覆盖：同名分组合并、按网址去重、缺失分组自动新增</p>
        </div>
      </div>

      <p class="text-[11px] opacity-55 leading-relaxed">
        首次使用会请求「书签」权限。从浏览器同步会把现有书签合并进当前分组；导出会写入浏览器的「VoidTab」书签夹，二者都只新增、不删除、不覆盖。
      </p>

      <div class="flex flex-wrap gap-2">
        <button
            :disabled="browserSyncBusy"
            @click="syncFromBrowser"
            class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold hover:bg-blue-500 hover:text-white hover:border-transparent transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <PhArrowsClockwise size="14" weight="bold"/>
          从浏览器同步（合并）
        </button>
        <button
            :disabled="browserSyncBusy"
            @click="exportToBrowser"
            class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold hover:bg-blue-500 hover:text-white hover:border-transparent transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <PhUploadSimple size="14" weight="bold"/>
          导出到浏览器书签
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
        :message="pendingImportMessages.length ? pendingImportMessages : ['导入操作将完全覆盖您当前的本地设置。', '我们会自动迁移旧版数据格式，但建议先备份当前配置。']"
        confirmText="确认覆盖"
        cancelText="取消"
        :danger="true"
        @cancel="cancelImport"
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
        @cancel="cancelResetStep2"
        @confirm="executeResetAll"
        :confirmDisabled="!resetBackupAcknowledged"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone"/>
      </template>
      <template #body>
        <label class="reset-ack">
          <input v-model="resetBackupAcknowledged" type="checkbox" class="reset-ack-check"/>
          <span>我已导出 JSON 备份，或确认不需要保留当前数据。</span>
        </label>
      </template>
    </ConfirmDialog>

    <ConfirmDialog
        :show="showV6SyncConfirm"
        title="启用新版同步？"
        :message="[
          '确认后，后续同步只会读写同目录下的新版备份文件。',
          '请确认所有写入该文件的设备都已升级；原备份文件保持为只读恢复源。'
        ]"
        confirmText="确认启用"
        cancelText="取消"
        :danger="true"
        :confirmDisabled="upgradeBusy"
        @cancel="showV6SyncConfirm = false"
        @confirm="executeV6SyncConfirmation"
    >
      <template #icon><PhWarning :size="32" weight="duotone"/></template>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

.reset-ack {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.08);
  text-align: left;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}

.reset-ack-check {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  accent-color: rgb(239 68 68);
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
