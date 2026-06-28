<script setup lang="ts">
import {computed} from 'vue';
import {PhDatabase, PhFlask, PhShieldCheck, PhTrash, PhWarning, PhSquaresFour, PhBroom} from '@phosphor-icons/vue';
import type {SandboxRuntimeLimits, SandboxRuntimePermission} from '../../../../core/config/types.ts';
import type {HostFeature} from '../../../../core/tiles/contracts.ts';
import {DEFAULT_SANDBOX_LIMITS} from '../../../../core/tiles/sandboxRuntime.ts';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const toast = useToast();

const pruneOrphanGrants = () => {
  const removed = store.pruneOrphanSandboxGrants();
  if (removed > 0) toast.success(`已清理 ${removed} 个已删除实例的授权与资源`);
  else toast.info('没有需要清理的失效授权');
};

const permissionLabels: Record<SandboxRuntimePermission, string> = {
  storage: '实例存储',
  network: '网络代理',
  openExternal: '打开外链',
  'clipboard.write': '写入剪贴板',
  notifications: '系统通知',
};

const hostFeatureLabels: Record<HostFeature, string> = {
  indexedStorage: '本地存储',
  syncStorage: '同步存储',
  networkProxy: '网络访问',
  clipboardWrite: '写入剪贴板',
  notifications: '系统通知',
  openExternal: '打开外链',
  contextMenus: '右键菜单',
  localFileImport: '本地文件导入',
  sandboxRuntime: 'Sandbox 运行时',
};

const sandboxRuntime = computed(() => store.config.runtime?.sandbox || {enabled: false});
const sandboxLimits = computed<SandboxRuntimeLimits>(() => ({
  ...DEFAULT_SANDBOX_LIMITS,
  ...(sandboxRuntime.value.limits || {}),
}));

const sandboxEnabled = computed({
  get: () => sandboxRuntime.value.enabled === true,
  set: (value: boolean) => store.setSandboxRuntimeEnabled(value),
});

const grantEntries = computed(() => Object.entries(sandboxRuntime.value.grants || {})
    .map(([key, record]) => ({
      key,
      ...record,
      permissionText: record.permissions.map((permission) => permissionLabels[permission] || permission).join('、'),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt));

const revokedEntries = computed(() => Object.entries(sandboxRuntime.value.revoked || {})
    .map(([key, record]) => ({
      key,
      ...record,
      permissionText: record.permissions.map((permission) => permissionLabels[permission] || permission).join('、'),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8));

const tileGrantRuntime = computed(() => store.config.runtime?.tileGrants || {grants: {}, revoked: {}});
const tileGrantEntries = computed(() => Object.entries(tileGrantRuntime.value.grants || {})
    .map(([key, record]) => ({
      key,
      ...record,
      featureText: record.features.map((feature) => hostFeatureLabels[feature] || feature).join('、'),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt));

const tileRevokedEntries = computed(() => Object.entries(tileGrantRuntime.value.revoked || {})
    .map(([key, record]) => ({
      key,
      ...record,
      featureText: record.features.map((feature) => hostFeatureLabels[feature] || feature).join('、'),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8));

const crashEntries = computed(() => Object.entries(sandboxRuntime.value.crashes || {})
    .map(([key, record]) => ({key, ...record}))
    .sort((a, b) => b.lastAt - a.lastAt));

const formatTime = (value?: number) => value ? new Date(value).toLocaleString() : '无';

const updateLimit = (key: keyof SandboxRuntimeLimits, rawValue: unknown) => {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  store.updateSandboxRuntimeLimits({[key]: Math.round(value)} as Partial<SandboxRuntimeLimits>);
};

const updateLimitFromEvent = (key: keyof SandboxRuntimeLimits, event: Event, multiplier = 1) => {
  const target = event.target as HTMLInputElement | null;
  updateLimit(key, Number(target?.value) * multiplier);
};

// 桌面 / 右键菜单高级配置
const maxTileSpan = computed({
  get: () => store.config.theme?.maxTileSpan ?? 6,
  set: (value: number) => {
    const n = Math.max(2, Math.min(6, Math.round(Number(value) || 6)));
    store.config.theme.maxTileSpan = n;
  },
});
const showTileAppearanceMenu = computed({
  get: () => store.config.theme?.showTileAppearanceMenu !== false,
  set: (value: boolean) => { store.config.theme.showTileAppearanceMenu = value; },
});
const showTileSizeMenu = computed({
  get: () => store.config.theme?.showTileSizeMenu !== false,
  set: (value: boolean) => { store.config.theme.showTileSizeMenu = value; },
});
const showDesignerMenu = computed({
  get: () => store.config.theme?.showDesignerMenu === true,
  set: (value: boolean) => { store.config.theme.showDesignerMenu = value; },
});
const showImportTileMenu = computed({
  get: () => store.config.theme?.showImportTileMenu === true,
  set: (value: boolean) => { store.config.theme.showImportTileMenu = value; },
});
const showDevToolsMenu = computed({
  get: () => store.config.theme?.showDevToolsMenu === true,
  set: (value: boolean) => { store.config.theme.showDevToolsMenu = value; },
});
const tileSpanOptions = [3, 4, 5, 6];
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <section class="advanced-section space-y-4">
      <div class="section-title">
        <PhSquaresFour size="20" weight="duotone"/>
        桌面与右键菜单
      </div>

      <div class="compact-setting-row">
        <div class="min-w-0">
          <div class="font-extrabold text-[13px]">组件最大尺寸</div>
          <span class="setting-meta">右键尺寸上限：{{ maxTileSpan }}×{{ maxTileSpan }}</span>
        </div>
        <select v-model.number="maxTileSpan" class="span-select shrink-0" aria-label="组件最大尺寸">
          <option v-for="n in tileSpanOptions" :key="n" :value="n">{{ n }}×{{ n }}</option>
        </select>
      </div>

      <div class="switch-grid">
        <label class="toggle-card">
          <span>
            <strong>实例外观</strong>
            <small>右键预设</small>
          </span>
          <input v-model="showTileAppearanceMenu" type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"/>
        </label>

        <label class="toggle-card">
          <span>
            <strong>布局尺寸</strong>
            <small>右键调宽高</small>
          </span>
          <input v-model="showTileSizeMenu" type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"/>
        </label>
      </div>

      <div class="section-subtitle">进阶 / 开发者入口（按需开启）</div>

      <div class="switch-grid">
        <label class="toggle-card">
          <span>
            <strong>设计组件</strong>
            <small>Sandbox 编辑器</small>
          </span>
          <input v-model="showDesignerMenu" type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"/>
        </label>

        <label class="toggle-card">
          <span>
            <strong>导入实例</strong>
            <small>.voidtile-instance</small>
          </span>
          <input v-model="showImportTileMenu" type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"/>
        </label>

        <label class="toggle-card">
          <span>
            <strong>开发者工具</strong>
            <small>F12 入口</small>
          </span>
          <input v-model="showDevToolsMenu" type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"/>
        </label>
      </div>
    </section>

    <section class="advanced-section space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 font-extrabold text-sm">
            <PhFlask size="20" weight="duotone"/>
            Sandbox JS 本地实验
          </div>
          <p class="text-[11px] opacity-60 leading-relaxed mt-1">
            开启后，本机导入的沙箱 JS 组件会在隔离 iframe 中运行；该开关不会随 WebDAV 同步。
          </p>
        </div>
        <input
            v-model="sandboxEnabled"
            type="checkbox"
            class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"
            aria-label="启用 Sandbox JS 本地实验"
        />
      </div>

      <div class="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2 text-[11px] leading-relaxed">
        <PhWarning size="17" weight="fill" class="shrink-0 text-amber-500 mt-0.5"/>
        <p class="opacity-75">
          Sandbox 组件不能访问主页面 DOM、扩展 API、隐私空间、AI Key 或 WebDAV 凭证。它仍然是高级实验能力，只建议运行自己信任的本地包。
        </p>
      </div>
    </section>

    <section class="advanced-section space-y-4">
      <div class="section-title">
        <PhDatabase size="20" weight="duotone"/>
        资源限额
      </div>
      <div class="limit-grid">
        <label>
          <span>最大活动实例</span>
          <input
              type="number"
              min="1"
              max="24"
              :value="sandboxLimits.maxActiveInstances"
              @change="updateLimitFromEvent('maxActiveInstances', $event)"
          />
        </label>
        <label>
          <span>每分钟请求数</span>
          <input
              type="number"
              min="5"
              max="240"
              :value="sandboxLimits.maxRequestsPerMinute"
              @change="updateLimitFromEvent('maxRequestsPerMinute', $event)"
          />
        </label>
        <label>
          <span>实例存储 bytes</span>
          <input
              type="number"
              min="4096"
              max="1048576"
              step="1024"
              :value="sandboxLimits.maxStorageBytes"
              @change="updateLimitFromEvent('maxStorageBytes', $event)"
          />
        </label>
        <label>
          <span>网络响应 bytes</span>
          <input
              type="number"
              min="16384"
              max="1048576"
              step="1024"
              :value="sandboxLimits.maxNetworkBytesPerRequest"
              @change="updateLimitFromEvent('maxNetworkBytesPerRequest', $event)"
          />
        </label>
        <label>
          <span>熔断崩溃次数</span>
          <input
              type="number"
              min="1"
              max="20"
              :value="sandboxLimits.maxCrashCount"
              @change="updateLimitFromEvent('maxCrashCount', $event)"
          />
        </label>
        <label>
          <span>熔断时长分钟</span>
          <input
              type="number"
              min="1"
              max="1440"
              :value="Math.round(sandboxLimits.fuseDurationMs / 60000)"
              @change="updateLimitFromEvent('fuseDurationMs', $event, 60000)"
          />
        </label>
      </div>
    </section>

    <section class="advanced-section space-y-4">
      <div class="section-title">
        <PhShieldCheck size="20" weight="duotone"/>
        组件能力授权
      </div>
      <div v-if="tileGrantEntries.length" class="record-list">
        <article v-for="record in tileGrantEntries" :key="record.key" class="record-row">
          <div class="min-w-0">
            <strong>{{ record.tileType || record.packageId }}</strong>
            <span>{{ record.featureText || '无能力' }}</span>
            <small>{{ formatTime(record.updatedAt || record.grantedAt) }}</small>
          </div>
          <button type="button" class="danger-btn" title="撤销授权" @click="store.revokeTileCapabilities(record.tileId)">
            <PhTrash size="15" weight="bold"/>
          </button>
        </article>
      </div>
      <p v-else class="empty-copy">暂无已授权的声明式或内置组件实例。</p>

      <div v-if="tileRevokedEntries.length" class="revoked-box">
        <div class="text-[11px] font-extrabold opacity-70">最近撤销</div>
        <div v-for="record in tileRevokedEntries" :key="record.key" class="revoked-row">
          <span>{{ record.tileType || record.packageId }}</span>
          <small>{{ record.featureText }}</small>
        </div>
      </div>
    </section>

    <section class="advanced-section space-y-4">
      <div class="section-title sandbox-grant-head">
        <span class="flex items-center gap-2"><PhShieldCheck size="20" weight="duotone"/>Sandbox 实例授权</span>
        <button type="button" class="prune-btn" title="清理已删除组件残留的授权与本地资源" @click="pruneOrphanGrants">
          <PhBroom size="14" weight="bold"/>清理失效授权
        </button>
      </div>
      <p class="section-hint">删除组件实例或卸载自定义组件时会自动清理其授权、熔断记录与本地存储；此按钮可手动清扫历史残留。</p>
      <div v-if="grantEntries.length" class="record-list">
        <article v-for="record in grantEntries" :key="record.key" class="record-row">
          <div class="min-w-0">
            <strong>{{ record.tileType || record.packageId }}</strong>
            <span>{{ record.permissionText || '无能力' }}</span>
            <small>{{ formatTime(record.updatedAt || record.grantedAt) }}</small>
          </div>
          <button type="button" class="danger-btn" title="撤销授权" @click="store.revokeSandboxPermissions(record.tileId)">
            <PhTrash size="15" weight="bold"/>
          </button>
        </article>
      </div>
      <p v-else class="empty-copy">暂无已授权的 Sandbox 实例。</p>

      <div v-if="revokedEntries.length" class="revoked-box">
        <div class="text-[11px] font-extrabold opacity-70">最近撤销</div>
        <div v-for="record in revokedEntries" :key="record.key" class="revoked-row">
          <span>{{ record.tileType || record.packageId }}</span>
          <small>{{ record.permissionText }}</small>
        </div>
      </div>
    </section>

    <section class="advanced-section space-y-4">
      <div class="section-title">
        <PhWarning size="20" weight="duotone"/>
        崩溃熔断
      </div>
      <div v-if="crashEntries.length" class="record-list">
        <article v-for="record in crashEntries" :key="record.key" class="record-row">
          <div class="min-w-0">
            <strong>{{ record.packageId || record.tileId }}</strong>
            <span>{{ record.reason || 'Sandbox 运行错误' }}</span>
            <small>次数 {{ record.count }} · 最近 {{ formatTime(record.lastAt) }} · 熔断至 {{ formatTime(record.fusedUntil) }}</small>
          </div>
          <button type="button" class="clear-btn" @click="store.clearSandboxCrash(record.tileId)">
            清除
          </button>
        </article>
      </div>
      <p v-else class="empty-copy">暂无 Sandbox 崩溃记录。</p>
    </section>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

.advanced-section {
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  background: var(--modal-input-bg);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 900;
}

.sandbox-grant-head {
  justify-content: space-between;
}

.prune-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
  border: 1px solid rgba(var(--accent-color-rgb), 0.22);
}

.prune-btn:hover {
  background: rgba(var(--accent-color-rgb), 0.18);
}

.section-hint {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.6;
}

.section-subtitle {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed var(--glass-border);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  opacity: 0.55;
}

.compact-setting-row,
.toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.compact-setting-row {
  align-items: center;
  padding: 12px;
  border-radius: 13px;
  border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.06);
}

.setting-meta {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.25;
  opacity: 0.56;
}

.switch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(174px, 1fr));
  gap: 10px;
}

.toggle-card {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  padding: 11px 12px;
  border-radius: 13px;
  border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.06);
  cursor: pointer;
}

.toggle-card:hover {
  border-color: rgba(var(--accent-color-rgb), 0.28);
  background: rgba(var(--accent-color-rgb), 0.08);
}

.toggle-card span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.toggle-card strong {
  font-size: 12px;
  line-height: 1.15;
  font-weight: 900;
}

.toggle-card small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 1.1;
  opacity: 0.55;
}

.span-select {
  height: 36px;
  min-width: 96px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.08);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.limit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.limit-grid label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.limit-grid span {
  font-size: 11px;
  font-weight: 800;
  opacity: 0.68;
}

.limit-grid input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.08);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.record-list {
  display: grid;
  gap: 10px;
}

.record-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.07);
}

.record-row strong,
.record-row span,
.record-row small {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-row strong {
  font-size: 12px;
  font-weight: 900;
}

.record-row span {
  margin-top: 3px;
  font-size: 11px;
  opacity: 0.7;
}

.record-row small {
  margin-top: 3px;
  font-size: 10px;
  opacity: 0.5;
}

.danger-btn,
.clear-btn {
  flex: 0 0 auto;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 900;
}

.danger-btn {
  width: 30px;
  color: rgb(220 38 38);
  background: rgba(220, 38, 38, 0.10);
}

.clear-btn {
  padding: 0 10px;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.10);
}

.empty-copy {
  font-size: 11px;
  opacity: 0.56;
}

.revoked-box {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(var(--overlay-rgb), 0.06);
}

.revoked-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
}

.revoked-row span,
.revoked-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revoked-row small {
  opacity: 0.54;
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
