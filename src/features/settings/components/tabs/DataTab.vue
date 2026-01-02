<script setup lang="ts">
import {ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
// 引入图标，新增 PhCheck
import {PhDownloadSimple, PhFileArrowUp, PhBookmarkSimple, PhWarning, PhCheck} from '@phosphor-icons/vue';

import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';

import {migrateConfig} from '../../../../core/config/migrate.ts';
import {normalizeConfig} from '../../../../core/config/normalize.ts';

const store = useConfigStore();
const fileInput = ref<HTMLInputElement | null>(null);
const bookmarkInput = ref<HTMLInputElement | null>(null);

// --- 弹窗相关状态 ---
const showConfirm = ref(false);
const pendingData = ref<any>(null); // 暂存待导入的数据

// 操作结果提示状态
const opResult = ref<{ success: boolean; msg: string } | null>(null);

// 辅助函数：显示提示并自动消失
const showFeedback = (success: boolean, msg: string) => {
  opResult.value = {success, msg};
  setTimeout(() => {
    opResult.value = null;
  }, 3000);
};

// 导出逻辑不变
const handleExport = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.config, null, 2)], {type: 'application/json'}));
  a.download = `voidtab-backup.json`;
  a.click();
};

const triggerImport = () => fileInput.value?.click();

// 1. 读取文件并触发弹窗
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

      // 存入临时变量，并显示弹窗
      pendingData.value = raw;
      showConfirm.value = true;

    } catch (err) {
      console.error(err);
      showFeedback(false, '导入失败：文件格式不正确');
    }
  };

  r.readAsText(file);
  (e.target as HTMLInputElement).value = ''; // 重置 input
};

// 2. 用户点击“确认”后真正执行导入
const executeImport = () => {
  if (!pendingData.value) return;

  try {
    const raw = pendingData.value;
    const next = normalizeConfig(migrateConfig(raw));

    // 保留 webdav 字段逻辑
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

    // 关闭弹窗
    showConfirm.value = false;
    pendingData.value = null;

    // 🟢 修改：使用页面提示代替 alert
    showFeedback(true, '配置导入成功');

  } catch (e) {
    console.error(e);
    showFeedback(false, '导入时发生未知错误');
  }
};

const triggerBookmarkImport = () => bookmarkInput.value?.click();
const handleBookmarkUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    if (!content) return;

    const result = store.importBookmarks(content);

    // 🟢 修改：使用页面提示代替 alert
    if (result.success) {
      showFeedback(true, `导入成功！共导入 ${result.groupCount} 个分组，${result.count} 个书签`);
    } else {
      showFeedback(false, result.message || '导入失败');
    }
  };

  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导出数据</h3>
        <button @click="handleExport"
                class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center gap-2">
          <PhDownloadSimple size="16" weight="bold"/>
          导出 JSON
        </button>
      </div>

      <hr class="opacity-10"/>

      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导入数据</h3>
        <button @click="triggerImport"
                class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition">
          <PhFileArrowUp size="16" weight="bold"/>
          导入 JSON
          <input type="file" ref="fileInput" class="hidden" @change="handleImport"/>
        </button>
      </div>
    </div>

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

    <div v-if="opResult"
         class="flex items-center justify-center gap-2 text-sm font-bold animate-fade-in py-2"
         :class="opResult.success ? 'text-green-500' : 'text-red-500'">
      <component :is="opResult.success ? PhCheck : PhWarning" size="18" weight="fill"/>
      {{ opResult.msg }}
    </div>

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