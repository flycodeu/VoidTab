<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import type {WebDavProfile} from '../../../../core/sync';
import {
  PhCloudArrowUp,
  PhCloudArrowDown,
  PhWarning,
  PhSpinner,
  PhCheck,
  PhLightning,
  PhInfo,
} from '@phosphor-icons/vue';

import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';
import SyncConflictDialog from '../SyncConflictDialog.vue';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const toast = useToast();

/** provider 收窄 */
const isWebdav = computed(() => store.config.sync?.provider === 'webdav');
const webdavProfile = computed(() => (isWebdav.value ? (store.config.sync as WebDavProfile) : null));

/** 基础字段 v-model 代理 */
const syncEnabled = computed({
  get: () => (store.config.sync as any)?.enabled ?? false,
  set: (v: boolean) => {
    (store.config.sync as any).enabled = v;
  }
});
const syncAuto = computed({
  get: () => (store.config.sync as any)?.autoSync ?? false,
  set: (v: boolean) => {
    (store.config.sync as any).autoSync = v;
  }
});

const intervalMinutesProxy = computed({
  get() {
    const v = (store.config.sync as any)?.intervalMinutes;
    return Number(v ?? 10);
  },
  set(v: number) {
    (store.config.sync as any).intervalMinutes = Number(v);
  }
});

const webdavFolder = computed({
  get: () => webdavProfile.value?.folder ?? '',
  set: (v: string) => {
    if (webdavProfile.value) webdavProfile.value.folder = v;
  }
});
const webdavFilename = computed({
  get: () => webdavProfile.value?.filename ?? '',
  set: (v: string) => {
    if (webdavProfile.value) webdavProfile.value.filename = v;
  }
});
const webdavUrl = computed({
  get: () => webdavProfile.value?.url ?? '',
  set: (v: string) => {
    if (webdavProfile.value) webdavProfile.value.url = v;
  }
});
const webdavUsername = computed({
  get: () => webdavProfile.value?.username ?? '',
  set: (v: string) => {
    if (webdavProfile.value) webdavProfile.value.username = v;
  }
});
const webdavPassword = computed({
  get: () => webdavProfile.value?.password ?? '',
  set: (v: string) => {
    if (webdavProfile.value) webdavProfile.value.password = v;
  }
});

/** 状态管理 */
const isTesting = ref(false);
const isUploading = ref(false);
const isDownloading = ref(false);
const testResult = ref<{ success: boolean; msg: string } | null>(null);

const showRestoreConfirm = ref(false);

/** 操作结果提示状态 */
const opResult = ref<{ success: boolean; msg: string } | null>(null);

/** 新增：说明折叠 */
const showRemoteHelp = ref(false);

/** 冲突状态 */
const conflictState = computed(() => store.syncConflictState);
const conflictSnapshot = computed(() => store.syncConflictSnapshot);
const hasConflict = computed(() =>
  conflictState.value === 'detected' || conflictState.value === 'pending'
);
const showConflictDialog = ref(false);
const conflictResolving = computed(() => conflictState.value === 'resolving');

const openConflictDialog = () => { showConflictDialog.value = true; };

const handleKeepLocal = async () => {
  const res = await store.resolveKeepLocal();
  if (res.success) {
    showConflictDialog.value = false;
    toast.success(res.msg);
  } else {
    toast.error(res.msg);
  }
};

const handleUseRemote = async () => {
  const res = await store.resolveUseRemote();
  if (res.success) {
    showConflictDialog.value = false;
    toast.success(res.msg);
  } else {
    toast.error(res.msg);
  }
};

const handlePostpone = () => {
  store.resolvePostpone();
  showConflictDialog.value = false;
};

const handleExportLocal = () => {
  try {
    const data = JSON.stringify(store.config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voidtab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.info('请前往「数据」标签页导出备份');
  }
};

const sensitiveSyncFields = ['AI Key', 'WebDAV 密码', 'JWT 临时 Token'];
const webdavExamples = [
  {name: '坚果云', url: 'https://dav.jianguoyun.com/dav/', note: '使用账号邮箱和应用专用密码；网页版默认走内置代理。'},
  {name: 'Nextcloud / ownCloud', url: 'https://example.com/remote.php/dav/files/your-user/', note: '将 example.com 和 your-user 替换为自己的服务地址和用户名。'},
  {name: '群晖 Synology', url: 'https://example.com:5006/', note: '需要已启用 WebDAV Server，并确保证书和端口可访问。'},
];
const webdavErrorTips = [
  '401/403：账号或应用密码错误，或服务端未授权 WebDAV。',
  '404：服务器地址、文件夹或备份文件名不正确；恢复前需先备份一次。',
  '409：嵌套文件夹的父目录不存在，先在网盘里创建父目录。',
  '503/网络失败：网页版可能被 CORS 拦截；扩展版通常可直连已声明的 WebDAV host。',
];

const showFeedback = (success: boolean, msg: string) => {
  opResult.value = {success, msg};
  if (success) toast.success(msg);
  else toast.error(msg);
  setTimeout(() => {
    opResult.value = null;
  }, 3000);
};

const lastSyncTimeStr = computed(() => {
  const t = (store.config.sync as any)?.lastSyncTime;
  if (!t) return '从未同步';
  return new Date(t).toLocaleString();
});

const handleTestConnection = async () => {
  if (!isWebdav.value || !webdavProfile.value) {
    testResult.value = {success: false, msg: '当前未启用 WebDAV（provider=none）'};
    return;
  }

  const p = webdavProfile.value;
  if (!p.folder || !p.filename || !p.url || !p.username || !p.password) {
    testResult.value = {success: false, msg: '请先填写完整配置（含文件夹/文件名）'};
    return;
  }

  isTesting.value = true;
  testResult.value = null;

  const res = await store.testSyncConnection(p as any);
  const success = !!res?.ok;

  isTesting.value = false;
  testResult.value = {
    success,
    msg: res?.message || (success ? '连接成功！' : '连接失败，请检查 URL 或密码')
  };
};

const handleUpload = async () => {
  isUploading.value = true;
  opResult.value = null;

  const res = await store.uploadBackup();

  isUploading.value = false;

  const isSuccess = res.success !== false;
  showFeedback(isSuccess, res.msg);
};

const openRestoreDialog = () => {
  showRestoreConfirm.value = true;
};

const executeRestore = async () => {
  showRestoreConfirm.value = false;
  isDownloading.value = true;
  opResult.value = null;

  try {
    const res = await store.downloadBackup();
    showFeedback(res.success !== false, res.msg);
  } catch (error) {
    showFeedback(false, '恢复失败，请检查网络或配置');
  } finally {
    isDownloading.value = false;
  }
};
</script>

<template>
  <div class="space-y-4 animate-fade-in">
    <!-- =========================
     * 1) 基础同步开关（更紧凑）
     * ========================= -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">同步设置</div>
          <div class="panel-sub">开启后可使用 WebDAV 备份与恢复</div>
        </div>

        <!-- 右侧状态 -->
        <div class="meta">
          <span class="meta-label">上次同步</span>
          <span class="meta-value">{{ lastSyncTimeStr }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-title">启用同步</div>
            <div class="setting-desc">关闭后不自动同步</div>
          </div>
          <input type="checkbox" v-model="syncEnabled" class="toggle"/>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-title">自动同步</div>
            <div class="setting-desc">后台定时上传/下载</div>
          </div>
          <input type="checkbox" v-model="syncAuto" class="toggle"/>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-title">同步间隔</div>
            <div class="setting-desc">单位：分钟</div>
          </div>

          <select
              v-model.number="intervalMinutesProxy"
              class="select"
          >
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="15">15</option>
            <option :value="30">30</option>
            <option :value="60">60</option>
          </select>
        </div>
      </div>

      <!-- 冲突提示 banner -->
      <div
          v-if="hasConflict"
          class="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer hover:opacity-90 transition-opacity"
          style="background: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.30);"
          @click="openConflictDialog"
      >
        <PhWarning size="16" weight="fill" class="text-amber-400 shrink-0" />
        <div class="flex-1 min-w-0">
          <span class="text-xs font-bold text-amber-400">检测到同步冲突</span>
          <span class="text-xs opacity-60 ml-2" style="color: var(--settings-text);">
            {{ conflictState === 'pending' ? '已暂停自动同步' : '本设备与云端数据均有改动' }}
          </span>
        </div>
        <span class="text-xs font-bold shrink-0" style="color: var(--accent-color);">处理 →</span>
      </div>

      <!-- 操作反馈（更靠下更窄） -->
      <div v-if="opResult" class="feedback" :class="opResult.success ? 'ok' : 'bad'">
        <component :is="opResult.success ? PhCheck : PhWarning" size="16" weight="fill"/>
        <span class="truncate">{{ opResult.msg }}</span>
      </div>

      <div class="safe-note mt-3">
        <PhInfo size="16" weight="duotone"/>
        <span>
          同步和云端备份会剥离 {{ sensitiveSyncFields.join('、') }}；恢复云端数据时会保留本机已填写的敏感字段。
        </span>
      </div>
    </section>

    <!-- =========================
     * 2) WebDAV 配置区
     * ========================= -->
    <template v-if="isWebdav">
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">WebDAV 配置</div>
            <div class="panel-sub">部分网盘需使用“应用专用密码”；网页版可能受 CORS 限制</div>
          </div>

          <div class="badge">
            <PhCloudArrowUp size="14" weight="fill"/>
            WebDAV
          </div>
        </div>

        <!-- 文件夹/文件名：更紧凑两列 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div class="field">
            <label class="label">文件夹</label>
            <input
                v-model="webdavFolder"
                type="text"
                placeholder="voidtab"
                class="input"
            />
          </div>

          <div class="field">
            <label class="label">文件名</label>
            <input
                v-model="webdavFilename"
                type="text"
                placeholder="voidtab-backup.json"
                class="input"
            />
          </div>
        </div>

        <div class="field mt-3">
          <label class="label">服务器地址 (URL)</label>
          <input
              v-model="webdavUrl"
              type="text"
              placeholder="https://dav.jianguoyun.com/dav/"
              class="input"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div class="field">
            <label class="label">账号 (Email)</label>
            <input
                v-model="webdavUsername"
                type="text"
                placeholder="你的账号"
                class="input"
            />
          </div>

          <div class="field">
            <label class="label">密码 / 应用密码</label>
            <input
                v-model="webdavPassword"
                type="password"
                placeholder="建议使用应用专用密码"
                class="input"
            />
          </div>
        </div>

        <div v-if="testResult" class="feedback mt-3" :class="testResult.success ? 'ok' : 'bad'">
          <component :is="testResult.success ? PhCheck : PhWarning" size="16" weight="fill"/>
          <span class="truncate">{{ testResult.msg }}</span>
        </div>

        <!-- 按钮区：更紧凑、对齐 -->
        <div class="btn-row mt-4">
          <button
              @click="handleTestConnection"
              :disabled="isTesting"
              class="btn btn-ghost"
          >
            <PhSpinner v-if="isTesting" class="animate-spin" size="16"/>
            <PhLightning v-else size="16" weight="bold"/>
            测试连接
          </button>

          <button
              @click="openRestoreDialog"
              :disabled="isDownloading"
              class="btn btn-ghost"
          >
            <PhSpinner v-if="isDownloading" class="animate-spin" size="16"/>
            <PhCloudArrowDown v-else size="16" weight="bold"/>
            恢复数据
          </button>

          <button
              @click="handleUpload"
              :disabled="isUploading"
              class="btn btn-primary"
          >
            <PhSpinner v-if="isUploading" class="animate-spin" size="16"/>
            <PhCloudArrowUp v-else size="16" weight="bold"/>
            立即备份
          </button>
        </div>

        <!-- ✅ 新增：远程同步说明（默认不展示，点击才展开） -->
        <div class="mt-4">
          <button class="link" @click="showRemoteHelp = !showRemoteHelp">
            <PhInfo size="16" weight="duotone"/>
            {{ showRemoteHelp ? '收起说明' : 'WebDAV 填写与错误说明' }}
          </button>

          <Transition name="fade">
            <div v-if="showRemoteHelp" class="help">
              <div class="help-title">常见服务地址示例</div>
              <div class="example-list">
                <div v-for="item in webdavExamples" :key="item.name" class="example-item">
                  <div class="example-name">{{ item.name }}</div>
                  <code class="example-url">{{ item.url }}</code>
                  <div class="example-note">{{ item.note }}</div>
                </div>
              </div>

              <div class="help-title mt-3">错误原因拆分</div>
              <ul class="help-list">
                <li v-for="tip in webdavErrorTips" :key="tip">{{ tip }}</li>
              </ul>

              <div class="help-title mt-3">同步安全</div>
              <div class="help-text">
                上传和自动同步只保存布局、站点、组件、主题和非敏感配置；AI Key、WebDAV 密码和临时 Token 仅保留在本机。
              </div>
            </div>
          </Transition>
        </div>
      </section>
    </template>

    <!-- provider 不是 webdav -->
    <div v-else class="panel">
      <div class="flex items-start gap-3">
        <div class="icon-warn">
          <PhWarning size="18" weight="duotone"/>
        </div>
        <div class="flex-1">
          <div class="panel-title">当前未启用 WebDAV</div>
          <div class="panel-sub mt-1">
            provider=none 时不包含 WebDAV 字段，因此不显示配置表单。需要 WebDAV 请将 provider 设置为
            <code class="opacity-90">webdav</code>。
          </div>
        </div>
      </div>
    </div>

    <!-- 恢复确认弹窗 -->
    <ConfirmDialog
        :show="showRestoreConfirm"
        title="恢复云端数据？"
        :message="[
        '此操作将下载云端备份文件，并完全覆盖当前的本地配置。',
        '建议您在恢复前先手动导出当前配置作为备份，操作不可撤销。'
      ]"
        confirmText="确认恢复"
        cancelText="取消"
        :danger="true"
        @cancel="showRestoreConfirm = false"
        @confirm="executeRestore"
    >
      <template #icon>
        <PhWarning :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>

    <!-- 冲突解决对话框 -->
    <SyncConflictDialog
        v-if="showConflictDialog && conflictSnapshot"
        :snapshot="conflictSnapshot"
        :resolving="conflictResolving"
        @keepLocal="handleKeepLocal"
        @useRemote="handleUseRemote"
        @postpone="handlePostpone"
        @exportLocal="handleExportLocal"
    />
  </div>
</template>

<style scoped>
/* 更紧凑的面板风格 */
.panel {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  background: var(--modal-input-bg);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  font-weight: 800;
  font-size: 13px;
}

.panel-sub {
  font-size: 11px;
  opacity: 0.6;
  line-height: 1.35;
}

/* 右侧 meta */
.meta {
  text-align: right;
  min-width: 160px;
}

.meta-label {
  display: block;
  font-size: 10px;
  opacity: 0.5;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meta-value {
  display: block;
  font-size: 11px;
  opacity: 0.8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* 小 badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.10);
  border: 1px solid rgba(59, 130, 246, 0.18);
  color: rgba(59, 130, 246, 0.95);
}

/* 设置行（紧凑） */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

:global(.dark) .setting-row {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.setting-text {
  min-width: 0;
}

.setting-title {
  font-weight: 800;
  font-size: 12px;
}

.setting-desc {
  font-size: 10px;
  opacity: 0.55;
}

.toggle {
  width: 18px;
  height: 18px;
  accent-color: var(--accent-color);
}

/* 表单 */
.field {
  min-width: 0;
}

.label {
  display: block;
  font-size: 10px;
  font-weight: 800;
  opacity: 0.55;
  margin-left: 2px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.input {
  width: 100%;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

:global(.dark) .input {
  border-color: rgba(255, 255, 255, 0.12);
}

.input:focus {
  border-color: rgba(var(--accent-color-rgb), 0.45);
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.12);
}

.select {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
}

:global(.dark) .select {
  border-color: rgba(255, 255, 255, 0.12);
}

/* 按钮区：紧凑 grid */
.btn-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 640px) {
  .btn-row {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.btn {
  height: 42px;
  border-radius: 14px;
  font-weight: 800;
  font-size: 12px;
  transition: transform .12s ease, filter .12s ease, background .12s ease, border-color .12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  user-select: none;
}

.btn:active {
  transform: scale(0.98);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--glass-border);
}

.btn-ghost:hover {
  background: var(--sidebar-active);
}

.btn-primary {
  background: var(--accent-color);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: white;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.btn-primary:hover {
  filter: brightness(1.05);
}

/* 反馈条：更窄更紧凑 */
.feedback {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  padding: 8px 10px;
  border-radius: 12px;
  max-width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

:global(.dark) .feedback {
  border-color: rgba(255, 255, 255, 0.10);
}

.feedback.ok {
  color: rgb(34 197 94);
  background: rgba(34, 197, 94, 0.08);
}

.feedback.bad {
  color: rgb(239 68 68);
  background: rgba(239, 68, 68, 0.08);
}

.safe-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(34, 197, 94, 0.18);
  background: rgba(34, 197, 94, 0.07);
  color: rgb(22 163 74);
  font-size: 11px;
  line-height: 1.45;
  font-weight: 700;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 说明折叠 */
.link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  opacity: 0.78;
  transition: opacity .12s ease, transform .12s ease;
}

.link:hover {
  opacity: 1;
}

.link:active {
  transform: scale(0.98);
}

.help {
  margin-top: 10px;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.18);
  background: rgba(var(--accent-color-rgb), 0.06);
}

.help-title {
  font-weight: 900;
  font-size: 12px;
  margin-bottom: 6px;
}

.example-list {
  display: grid;
  gap: 8px;
}

.example-item {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(.dark) .example-item {
  border-color: rgba(255, 255, 255, 0.10);
}

.example-name {
  font-size: 11px;
  font-weight: 900;
}

.example-url {
  display: block;
  padding: 6px 8px;
  border-radius: 8px;
  overflow-wrap: anywhere;
  background: rgba(0, 0, 0, 0.06);
  font-size: 11px;
  opacity: 0.86;
}

:global(.dark) .example-url {
  background: rgba(255, 255, 255, 0.08);
}

.example-note {
  font-size: 11px;
  opacity: 0.66;
  line-height: 1.45;
}

.help-text {
  font-size: 12px;
  opacity: 0.78;
  line-height: 1.5;
}

.help-list {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 5px;
  font-size: 11px;
  line-height: 1.45;
  opacity: 0.76;
}

/* 未启用提示 icon */
.icon-warn {
  padding: 8px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.10);
  color: rgb(245 158 11);
}

.animate-fade-in {
  animation: fadeIn 0.22s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .18s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
