<script setup lang="ts">
import {computed, ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import type {WebDavProfile} from '../../../../core/sync';
import {PhCloudArrowUp, PhCloudArrowDown, PhWarning, PhSpinner, PhCheck, PhLightning} from '@phosphor-icons/vue';

// 引入确认弹窗组件
import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';

const store = useConfigStore();

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

// 控制确认弹窗显示
const showRestoreConfirm = ref(false);

// 🟢 修改 1：使用通用的操作结果状态（代替之前的 restoreResult）
const opResult = ref<{ success: boolean; msg: string } | null>(null);

// 🟢 辅助函数：显示操作反馈并自动消失
const showFeedback = (success: boolean, msg: string) => {
  opResult.value = {success, msg};
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
  opResult.value = null; // 清除旧提示

  const res = await store.uploadBackup();

  isUploading.value = false;

  // 🟢 修改 2：移除 alert，使用 showFeedback 显示结果
  // 假设 res.success 存在，或者根据 msg 判断
  const isSuccess = res.success !== false;
  showFeedback(isSuccess, res.msg);
};

// 1. 点击“恢复数据”按钮：只打开弹窗
const openRestoreDialog = () => {
  showRestoreConfirm.value = true;
};

// 2. 确认后的执行逻辑
const executeRestore = async () => {
  showRestoreConfirm.value = false; // 关闭弹窗
  isDownloading.value = true;
  opResult.value = null; // 清除旧提示

  try {
    const res = await store.downloadBackup();

    // 🟢 修改 3：使用 showFeedback
    showFeedback(true, res.msg);

  } catch (error) {
    showFeedback(false, '恢复失败，请检查网络或配置');
  } finally {
    isDownloading.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex justify-between items-center">
        <div class="flex flex-col">
          <span class="font-bold text-sm">启用同步</span>
          <span class="text-[10px] opacity-50">关闭后将不会自动同步（手动备份仍可用）</span>
        </div>
        <input type="checkbox" v-model="syncEnabled" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>

      <div class="flex justify-between items-center">
        <div class="flex flex-col">
          <span class="font-bold text-sm">自动同步</span>
          <span class="text-[10px] opacity-50">开启后后台定时检查并自动上传/下载</span>
        </div>
        <input type="checkbox" v-model="syncAuto" class="w-5 h-5 accent-[var(--accent-color)]"/>
      </div>

      <div class="flex justify-between items-center">
        <div class="flex flex-col">
          <span class="font-bold text-sm">同步间隔</span>
          <span class="text-[10px] opacity-50">单位：分钟（默认 10）</span>
        </div>

        <select v-model.number="intervalMinutesProxy"
                class="bg-transparent border border-current/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent-color)]">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="15">15</option>
          <option :value="30">30</option>
          <option :value="60">60</option>
        </select>
      </div>
    </div>

    <template v-if="isWebdav">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div class="space-y-1">
          <label class="text-xs font-bold opacity-60 uppercase ml-1">文件夹</label>
          <input v-model="webdavFolder" type="text" placeholder="voidtab"
                 class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"/>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-bold opacity-60 uppercase ml-1">文件名</label>
          <input v-model="webdavFilename" type="text" placeholder="voidtab-backup.json"
                 class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"/>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm leading-relaxed">
        <p class="font-bold text-blue-400 mb-1 flex items-center gap-2">
          <PhCloudArrowUp size="16" weight="fill"/>
          WebDAV 同步
        </p>
        <p class="opacity-60 text-xs mt-1">注意：部分网盘需要生成“应用专用密码”。</p>
      </div>

      <div class="space-y-4 p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
        <div class="space-y-1">
          <label class="text-xs font-bold opacity-60 uppercase ml-1">服务器地址 (URL)</label>
          <input v-model="webdavUrl" type="text" placeholder="https://dav.jianguoyun.com/dav/"
                 class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"/>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">账号 (Email)</label>
            <input v-model="webdavUsername" type="text" placeholder="你的账号"
                   class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"/>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold opacity-60 uppercase ml-1">密码 / 应用密码</label>
            <input v-model="webdavPassword" type="password" placeholder="建议使用应用专用密码"
                   class="w-full bg-transparent border-b-2 border-current/10 py-2 px-1 text-sm outline-none focus:border-[var(--accent-color)] transition-colors"/>
          </div>
        </div>

        <div v-if="testResult" class="flex items-center gap-2 text-sm font-bold pt-2 animate-fade-in"
             :class="testResult.success ? 'text-green-500' : 'text-red-500'">
          <component :is="testResult.success ? PhCheck : PhWarning" size="18" weight="fill"/>
          {{ testResult.msg }}
        </div>
      </div>

      <div class="flex flex-col sm:flex-row items-center gap-3">
        <button @click="handleTestConnection" :disabled="isTesting"
                class="w-full sm:w-auto px-5 py-3 rounded-xl border border-[var(--glass-border)] font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-[var(--sidebar-active)]">
          <PhSpinner v-if="isTesting" class="animate-spin" size="18"/>
          <PhLightning v-else size="18" weight="bold"/>
          测试连接
        </button>

        <div class="hidden sm:block flex-1"></div>

        <button @click="openRestoreDialog" :disabled="isDownloading"
                class="w-full sm:w-auto px-5 py-3 rounded-xl border border-[var(--glass-border)] font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-[var(--sidebar-active)]">
          <PhSpinner v-if="isDownloading" class="animate-spin" size="18"/>
          <PhCloudArrowDown v-else size="18" weight="bold"/>
          恢复数据
        </button>

        <button @click="handleUpload" :disabled="isUploading"
                class="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--accent-color)] text-white font-bold text-sm transition-all hover:brightness-110 active:scale-95 shadow-lg flex items-center justify-center gap-2">
          <PhSpinner v-if="isUploading" class="animate-spin" size="18"/>
          <PhCloudArrowUp v-else size="18" weight="bold"/>
          立即备份
        </button>
      </div>

      <div v-if="opResult"
           class="flex items-center justify-center gap-2 text-sm font-bold pt-3 animate-fade-in"
           :class="opResult.success ? 'text-green-500' : 'text-red-500'">
        <component :is="opResult.success ? PhCheck : PhWarning" size="18" weight="fill"/>
        {{ opResult.msg }}
      </div>

      <div class="text-center pt-2">
        <span class="text-xs opacity-40 font-mono">上次同步: {{ lastSyncTimeStr }}</span>
      </div>
    </template>

    <div v-else class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
          <PhWarning size="20" weight="duotone"/>
        </div>
        <div class="flex-1">
          <p class="font-bold text-sm">当前未启用 WebDAV</p>
          <p class="text-xs opacity-60 mt-1">
            provider=none 时不包含 WebDAV 字段，因此不显示配置表单。需要 WebDAV 请将 provider 设置为
            <code class="opacity-90">webdav</code>。
          </p>
        </div>
      </div>
    </div>

    <ConfirmDialog
        :show="showRestoreConfirm"
        title="恢复云端数据？"
        :message="['此操作将下载云端备份文件，并完全覆盖当前的本地配置。', '建议您在恢复前先手动导出当前配置作为备份，操作不可撤销。']"
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