<script setup lang="ts">
import { ref } from 'vue';
import { useConfigStore } from '../../../../stores/useConfigStore';
import { PhDownloadSimple, PhFileArrowUp, PhBookmarkSimple } from '@phosphor-icons/vue';

import { migrateConfig } from '../../../../core/config/migrate';
import { normalizeConfig } from '../../../../core/config/normalize';

const store = useConfigStore();
const fileInput = ref<HTMLInputElement | null>(null);
const bookmarkInput = ref<HTMLInputElement | null>(null);

const handleExport = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.config, null, 2)], { type: 'application/json' }));
  a.download = `voidtab-backup.json`;
  a.click();
};

const triggerImport = () => fileInput.value?.click();

const handleImport = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const raw = JSON.parse(String(ev.target?.result ?? ''));
      if (!raw || typeof raw !== 'object') return alert('不是有效配置 JSON');
      if (!confirm('覆盖配置?（将使用 migrate + normalize 处理缺字段）')) return;

      const next = normalizeConfig(migrateConfig(raw));

      // 保留 webdav 字段（仅 webdav->webdav）
      const cur = { ...(store.config.sync as any) };
      const ns = { ...(next.sync as any) };

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

      alert('导入成功');
    } catch (err) {
      console.error(err);
      alert('导入失败：不是合法 JSON 或格式不正确');
    }
  };

  r.readAsText(file);
  (e.target as HTMLInputElement).value = '';
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
    if (result.success) alert(`导入成功！共导入 ${result.groupCount} 个分组，${result.count} 个书签。`);
    else alert(result.message || '导入失败');
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
        <button @click="handleExport" class="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold flex items-center gap-2">
          <PhDownloadSimple size="16" weight="bold"/>导出 JSON
        </button>
      </div>

      <hr class="opacity-10"/>

      <div class="flex justify-between items-center">
        <h3 class="font-bold text-sm">导入数据</h3>
        <button @click="triggerImport" class="px-4 py-2 rounded-lg border border-current/20 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition">
          <PhFileArrowUp size="16" weight="bold"/>导入 JSON
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
          <PhFileArrowUp size="14" weight="bold"/>选择 HTML 文件
          <input type="file" ref="bookmarkInput" class="hidden" accept=".html" @change="handleBookmarkUpload"/>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
