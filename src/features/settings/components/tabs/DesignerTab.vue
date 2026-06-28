<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {
  PhCode,
  PhFlask,
  PhPlus,
  PhFloppyDisk,
  PhDownloadSimple,
  PhUploadSimple,
  PhTrash,
  PhArrowSquareOut,
  PhBookOpen,
  PhWarning,
  PhCheckCircle,
  PhPlay,
  PhPencilSimple,
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {useToast} from '../../../../shared/composables/useToast';
import CodeEditor from '../../../../shared/ui/CodeEditor.vue';
import SandboxTileHost from '../../../home/components/SandboxTileHost.vue';
import {createSandboxTileDefinitionFromInstall} from '../../../../core/tiles/sandboxPackage.ts';
import type {ComponentTile, SandboxTileDefinition, TileInstallRecord, TileSize} from '../../../../core/tiles/contracts.ts';
import type {SandboxRuntimePermission} from '../../../../core/config/types.ts';
import {
  compileDraft,
  createBlankDraft,
  createDraftFromInstall,
  DESIGNER_PERMISSION_INFO,
  exportDraftPackageJson,
  STARTER_TEMPLATES,
  type DesignerDraft,
} from '../../../../core/tiles/designerPackage.ts';
import {parseSandboxTilePackage} from '../../../../core/tiles/sandboxPackage.ts';

const store = useConfigStore();
const toast = useToast();

const PREVIEW_TILE_ID = 'designer-preview';
const PERMISSION_KEYS: SandboxRuntimePermission[] = ['storage', 'network', 'openExternal', 'clipboard.write', 'notifications'];
const SECTIONS = [
  {id: 'basic', label: '基本'},
  {id: 'code', label: '封面'},
  {id: 'modal', label: '弹窗'},
  {id: 'caps', label: '能力'},
  {id: 'advanced', label: '设置'},
] as const;
type SectionId = typeof SECTIONS[number]['id'];
const SIZE_PRESETS: (TileSize & {label: string})[] = [
  {w: 2, h: 2, label: '2×2'},
  {w: 3, h: 3, label: '3×3'},
];

const draft = ref<DesignerDraft>(createBlankDraft());
const committedDraft = ref<DesignerDraft>(JSON.parse(JSON.stringify(draft.value)));
const editingTileType = ref<string | null>(null);
const activeSection = ref<SectionId>('basic');
const showDocs = ref(false);
const logs = ref<{level: string; text: string; at: number}[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const previewNonce = ref(0);

const sandboxEnabled = computed(() => store.config.runtime?.sandbox?.enabled === true);

// Debounced recompile so the preview iframe is not rebuilt on every keystroke.
let commitTimer: ReturnType<typeof setTimeout> | null = null;
watch(draft, (value) => {
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    committedDraft.value = JSON.parse(JSON.stringify(value));
  }, 500);
}, {deep: true});

onBeforeUnmount(() => {
  if (commitTimer) clearTimeout(commitTimer);
});

const build = computed(() => compileDraft(committedDraft.value));
const buildLive = computed(() => compileDraft(draft.value));

const previewDefinition = computed<SandboxTileDefinition | null>(() => {
  if (!build.value.ok || !build.value.install) return null;
  return createSandboxTileDefinitionFromInstall(build.value.install, {includeDisabled: true});
});

const previewTile = computed<ComponentTile | null>(() => {
  const definition = previewDefinition.value;
  if (!definition) return null;
  return {
    id: PREVIEW_TILE_ID,
    tileType: definition.id,
    title: definition.label,
    settings: definition.defaultSettings || {},
    layouts: {desktop: {x: 0, y: 0, w: definition.sizes.default.w, h: definition.sizes.default.h}},
    revision: {updatedAt: Date.now(), deviceId: 'designer', sequence: 0},
    createdAt: Date.now(),
  } as ComponentTile;
});

const myDesigns = computed(() => Object.values(store.config.tileInstalls)
    .filter((install): install is TileInstallRecord =>
        install.runtime === 'sandbox' && install.source === 'local' && !!install.manifest)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));

const groups = computed(() => store.config.layout.map((group) => ({id: group.id, title: group.title})));
const applyGroupId = ref('');
watch(groups, (list) => {
  if (!applyGroupId.value && list.length) applyGroupId.value = list[0].id;
}, {immediate: true});

const togglePermission = (permission: SandboxRuntimePermission) => {
  const set = new Set(draft.value.permissions);
  if (set.has(permission)) set.delete(permission);
  else set.add(permission);
  draft.value.permissions = PERMISSION_KEYS.filter((key) => set.has(key));
};

const networkHostsText = computed({
  get: () => draft.value.networkHosts.join('\n'),
  set: (value: string) => {
    draft.value.networkHosts = value.split(/[\n,]/).map((host) => host.trim()).filter(Boolean);
  },
});

const applyDefaultSize = (size: TileSize) => {
  draft.value.sizes.default = {w: size.w, h: size.h};
  if (draft.value.sizes.max.w < size.w) draft.value.sizes.max.w = size.w;
  if (draft.value.sizes.max.h < size.h) draft.value.sizes.max.h = size.h;
};
const isDefaultSize = (size: TileSize) =>
    draft.value.sizes.default.w === size.w && draft.value.sizes.default.h === size.h;

const enableSandbox = () => {
  store.setSandboxRuntimeEnabled(true);
  toast.success('已启用 Sandbox JS 本地实验');
};

const onPreviewLog = (payload: {level?: string; text?: string}) => {
  logs.value.push({level: payload.level || 'log', text: payload.text || '', at: Date.now()});
  if (logs.value.length > 200) logs.value.splice(0, logs.value.length - 200);
};
const clearLogs = () => { logs.value = []; };
const rerunPreview = () => { logs.value = []; previewNonce.value += 1; };

const newDraft = () => {
  draft.value = createBlankDraft();
  editingTileType.value = null;
  logs.value = [];
  activeSection.value = 'basic';
};

const loadTemplate = (templateId: string) => {
  const template = STARTER_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return;
  draft.value = template.draft();
  editingTileType.value = null;
  logs.value = [];
  activeSection.value = 'code';
  toast.info(`已加载示例：${template.label}`);
};

const editDesign = (install: TileInstallRecord) => {
  const next = createDraftFromInstall(install);
  if (!next) {
    toast.error('无法编辑该组件');
    return;
  }
  draft.value = next;
  editingTileType.value = install.tileType;
  logs.value = [];
  activeSection.value = 'code';
};

const saveDesign = () => {
  const result = buildLive.value;
  if (!result.ok || !result.wire) {
    toast.error(`保存失败：${result.error || '组件结构无效'}`);
    return null;
  }
  const res = store.importTilePackage(result.wire);
  if (!res.success) {
    toast.error(`保存失败：${res.message || '安装失败'}`);
    return null;
  }
  editingTileType.value = res.tileType ?? null;
  committedDraft.value = JSON.parse(JSON.stringify(draft.value));
  toast.success('已保存到「我的设计」');
  return res.tileType ?? null;
};

const applyToGroup = () => {
  const tileType = saveDesign();
  if (!tileType) return;
  if (!applyGroupId.value) {
    toast.error('请先选择要添加到的分组');
    return;
  }
  const res = store.addExternalTile(applyGroupId.value, tileType as any);
  if (res.success) toast.success('已应用到分组（首次运行需在桌面点「授权运行」）');
  else toast.error(`应用失败：${res.message || '未知错误'}`);
};

const exportDesign = () => {
  const result = buildLive.value;
  if (!result.ok || !result.install) {
    toast.error(`导出失败：${result.error || '组件结构无效'}`);
    return;
  }
  const json = exportDraftPackageJson(result.install);
  if (!json) {
    toast.error('导出失败');
    return;
  }
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${draft.value.id || 'voidtab-widget'}.voidtab-tile.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success('已导出组件包（可分享给他人导入）');
};

const triggerImport = () => fileInput.value?.click();
const handleImportFile = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const raw = JSON.parse(String(e.target?.result ?? ''));
      const parsed = parseSandboxTilePackage(raw);
      const next = createDraftFromInstall(parsed.install);
      if (!next) throw new Error('不是有效的 Sandbox 组件包');
      draft.value = next;
      editingTileType.value = null;
      logs.value = [];
      activeSection.value = 'code';
      toast.success('已导入到设计器，可继续编辑或保存');
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : '文件格式不正确'}`);
    }
  };
  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
};

const deleteDesign = (install: TileInstallRecord) => {
  if (store.uninstallTilePackage(install.tileType)) {
    if (editingTileType.value === install.tileType) newDraft();
    toast.success('已删除组件');
  }
};
</script>

<template>
  <div class="space-y-4 animate-fade-in">
    <!-- 顶部：标题 + 示例 -->
    <section class="d-card">
      <div class="designer-head">
        <div class="min-w-0">
          <div class="flex items-center gap-2 font-extrabold text-sm">
            <PhCode size="20" weight="duotone"/>
            组件设计（Sandbox JS）
          </div>
        </div>
        <div class="head-actions">
          <button type="button" class="btn ghost sm" @click="newDraft"><PhPlus size="14" weight="bold"/>空白</button>
          <button type="button" class="btn ghost sm" @click="triggerImport"><PhUploadSimple size="14" weight="bold"/>导入</button>
          <button type="button" class="btn ghost sm" @click="showDocs = !showDocs">
            <PhBookOpen size="14" weight="bold"/>{{ showDocs ? '收起' : '速查' }}
          </button>
          <input ref="fileInput" type="file" class="hidden" accept=".json,application/json" @change="handleImportFile"/>
        </div>
      </div>

      <div v-if="!sandboxEnabled" class="warn-banner mt-3">
        <PhWarning size="16" weight="fill" class="shrink-0 text-amber-500 mt-0.5"/>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-amber-500">尚未启用 Sandbox JS 本地实验</div>
          <div class="text-[11px] opacity-70 mt-0.5">实时预览与运行需要先开启该实验能力。</div>
        </div>
        <button type="button" class="btn primary sm shrink-0" @click="enableSandbox">启用</button>
      </div>

      <div class="starter-grid mt-3">
        <button
            v-for="t in STARTER_TEMPLATES"
            :key="t.id"
            type="button"
            class="starter-card"
            @click="loadTemplate(t.id)"
        >
          <span>{{ t.label }}</span>
          <small>{{ t.description }}</small>
        </button>
      </div>

      <!-- 我的设计 -->
      <div v-if="myDesigns.length" class="mydesigns mt-3">
        <span class="qs-label">我的设计</span>
        <span v-for="install in myDesigns" :key="install.tileType" class="design-chip" :class="{active: editingTileType === install.tileType}">
          <button type="button" class="design-chip-main" @click="editDesign(install)">
            <PhPencilSimple size="12" weight="bold"/>{{ install.manifest?.metadata.label || install.tileType }}
          </button>
          <button type="button" class="design-chip-del" title="删除" @click="deleteDesign(install)"><PhTrash size="12" weight="bold"/></button>
        </span>
      </div>
    </section>

    <!-- 文档 -->
    <section v-if="showDocs" class="d-card docs">
      <div class="doc-grid">
        <div>
          <h3 class="doc-h">入口</h3>
          <pre class="doc-code">VoidWidget.define({
  mount(ctx) {
    ctx.root.textContent = 'Hello';
  }
});</pre>
        </div>
        <div>
          <h3 class="doc-h">常用 API</h3>
          <p><code>ctx.root</code> 封面根节点 · <code>ctx.size</code> 当前尺寸 · <code>ctx.settings</code> 实例设置 · <code>ctx.modal.open</code> 打开弹窗 · <code>ctx.storage</code> 本地存储 · <code>ctx.network.fetch</code> 网络代理</p>
          <p>封面和弹窗都可使用 <code>--vt-accent</code>、<code>--vt-text</code>、<code>--vt-muted</code>、<code>--vt-surface</code> 适配当前主题。</p>
          <h3 class="doc-h">交付</h3>
          <p>保存后安装到本机；应用到分组会放置一个实例；导出生成可分享的组件包。</p>
        </div>
      </div>
    </section>

    <!-- 主体：左编辑 / 右预览 -->
    <div class="d-body">
      <!-- 左：分区编辑 -->
      <section class="d-card editor min-w-0">
        <div class="seg">
          <button
              v-for="s in SECTIONS"
              :key="s.id"
              type="button"
              class="seg-btn"
              :class="{active: activeSection === s.id}"
              @click="activeSection = s.id"
          >{{ s.label }}</button>
        </div>

        <!-- 基本 -->
        <div v-show="activeSection === 'basic'" class="sec">
          <div class="field-grid">
            <label class="field"><span>名称</span><input v-model="draft.label" type="text"/></label>
            <label class="field"><span>ID（唯一）</span><input v-model="draft.id" type="text" placeholder="my.widget"/></label>
            <label class="field"><span>图标（Phosphor 名）</span><input v-model="draft.icon" type="text" placeholder="Code"/></label>
            <label class="field"><span>版本</span><input v-model="draft.version" type="text" placeholder="0.1.0"/></label>
          </div>
          <label class="field mt-2"><span>描述</span><input v-model="draft.description" type="text"/></label>

          <div class="mt-3">
            <div class="field-label">默认尺寸</div>
            <div class="size-presets">
              <button v-for="p in SIZE_PRESETS" :key="p.label" type="button" class="chip" :class="{accent: isDefaultSize(p)}" @click="applyDefaultSize(p)">{{ p.label }}</button>
            </div>
            <div class="size-grid mt-2">
              <div class="size-col"><span>默认</span><div><input v-model.number="draft.sizes.default.w" type="number" min="1" max="6"/>×<input v-model.number="draft.sizes.default.h" type="number" min="1" max="6"/></div></div>
              <div class="size-col"><span>最小</span><div><input v-model.number="draft.sizes.min.w" type="number" min="1" max="6"/>×<input v-model.number="draft.sizes.min.h" type="number" min="1" max="6"/></div></div>
              <div class="size-col"><span>最大</span><div><input v-model.number="draft.sizes.max.w" type="number" min="1" max="6"/>×<input v-model.number="draft.sizes.max.h" type="number" min="1" max="6"/></div></div>
            </div>
          </div>
        </div>

        <!-- 封面 -->
        <div v-show="activeSection === 'code'" class="sec">
          <div class="designer-note mb-2">
            封面运行在卡片 iframe 中，可读取 <code>ctx.size.placement.w/h</code> 判断 1×1、2×2 或宽卡展示内容。
            样式可直接使用 <code>--vt-accent</code> / <code>--vt-text</code> 等主题变量。
          </div>
          <label class="field"><span>封面 JS</span>
            <CodeEditor v-model="draft.entryCode" language="javascript" :rows="16"/>
          </label>
          <label class="field mt-2"><span>封面 CSS</span>
            <CodeEditor v-model="draft.styles" language="css" :rows="6"/>
          </label>
          <label class="field mt-2"><span>初始 HTML（可选）</span>
            <CodeEditor v-model="draft.html" language="xml" :rows="3"/>
          </label>
        </div>

        <!-- 弹窗 -->
        <div v-show="activeSection === 'modal'" class="sec">
          <div class="designer-note mb-2">
            这里是默认弹窗模板；封面 JS 可在点击时调用 <code>VoidTabDesigner.openModal(ctx, { html, width: '900px', height: '72vh' })</code> 传入实时数据覆盖模板内容。
            弹窗 iframe 会继承同一套主题变量，适合封面和详情保持一致视觉。
            弹窗内容可以直接使用列表、输入框、数字框、文本域等常规布局。
          </div>
          <div class="field-grid mb-2">
            <label class="field"><span>弹窗宽度</span><input v-model="draft.modalWidth" type="text" placeholder="760px / 80vw"/></label>
            <label class="field"><span>弹窗高度</span><input v-model="draft.modalHeight" type="text" placeholder="620px / 72vh"/></label>
          </div>
          <label class="field"><span>弹窗 HTML</span>
            <CodeEditor v-model="draft.modalHtml" language="xml" :rows="10"/>
          </label>
          <label class="field mt-2"><span>弹窗 CSS</span>
            <CodeEditor v-model="draft.modalStyles" language="css" :rows="7"/>
          </label>
        </div>

        <!-- 能力 -->
        <div v-show="activeSection === 'caps'" class="sec">
          <label v-for="key in PERMISSION_KEYS" :key="key" class="cap-row">
            <input type="checkbox" :checked="draft.permissions.includes(key)" @change="togglePermission(key)"/>
            <span class="cap-text"><b>{{ DESIGNER_PERMISSION_INFO[key].label }}</b><small>{{ DESIGNER_PERMISSION_INFO[key].detail }}</small></span>
          </label>
          <label v-if="draft.permissions.includes('network')" class="field mt-2">
            <span>允许的网络域名（每行一个，支持 *.example.com）</span>
            <textarea v-model="networkHostsText" rows="3" class="code-area mono" placeholder="api.example.com"></textarea>
          </label>
        </div>

        <!-- 设置 -->
        <div v-show="activeSection === 'advanced'" class="sec">
          <label class="field"><span>设置 Schema JSON</span>
            <CodeEditor v-model="draft.settingsSchemaText" language="json" :rows="8" placeholder='{"type":"object","properties":{}}'/>
          </label>
          <label class="field mt-2"><span>分类</span><input v-model="draft.category" type="text" placeholder="local"/></label>
        </div>
      </section>

      <!-- 右：预览 + 控制台 + 操作 -->
      <section class="d-card preview-col min-w-0">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="font-extrabold text-[13px]">实时预览</div>
          <button type="button" class="btn ghost sm" @click="rerunPreview"><PhPlay size="13" weight="bold"/>重新运行</button>
        </div>

        <div class="preview-stage">
          <div v-if="!build.ok" class="preview-error">
            <PhWarning size="18" weight="fill"/><span>{{ build.error }}</span>
          </div>
          <SandboxTileHost
              v-else-if="previewTile && previewDefinition"
              :key="previewNonce + ':' + (build.install?.sha256 || '')"
              :tile="previewTile"
              :definition="previewDefinition"
              :enabled="sandboxEnabled"
              :debug="true"
              :preview-mode="true"
              @log="onPreviewLog"
          />
        </div>

        <div class="status-row mt-2" :class="build.ok ? 'ok' : 'bad'">
          <component :is="build.ok ? PhCheckCircle : PhWarning" size="14" weight="fill"/>
          <span>{{ build.ok ? '组件结构有效' : build.error }}</span>
        </div>

        <div class="console mt-2">
          <div class="console-head">
            <span class="flex items-center gap-1.5"><PhFlask size="13" weight="bold"/>调试控制台</span>
            <button type="button" class="btn ghost xs" @click="clearLogs">清空</button>
          </div>
          <div class="console-body">
            <p v-if="!logs.length" class="console-empty">console.log / 运行错误会显示在这里。</p>
            <div v-for="(log, index) in logs" :key="index" class="console-line" :class="log.level">
              <span class="console-level">{{ log.level }}</span><span class="console-text">{{ log.text }}</span>
            </div>
          </div>
        </div>

        <div class="actions mt-3">
          <button type="button" class="btn primary" @click="saveDesign"><PhFloppyDisk size="15" weight="bold"/>保存</button>
          <button type="button" class="btn ghost" @click="exportDesign"><PhDownloadSimple size="15" weight="bold"/>导出</button>
          <div class="apply-group">
            <select v-model="applyGroupId" class="group-select">
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.title }}</option>
            </select>
            <button type="button" class="btn ghost" @click="applyToGroup"><PhArrowSquareOut size="15" weight="bold"/>应用到分组</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.d-card { padding: 16px; border-radius: 16px; border: 1px solid var(--glass-border); background: var(--modal-input-bg); }

.designer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.starter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.starter-card {
  min-width: 0;
  min-height: 78px;
  display: grid;
  align-content: space-between;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.16);
  background:
      radial-gradient(circle at 90% 12%, rgba(var(--accent-color-rgb), 0.14), transparent 34%),
      rgba(var(--overlay-rgb), 0.07);
  text-align: left;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.starter-card:hover,
.starter-card:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(var(--accent-color-rgb), 0.36);
  background:
      radial-gradient(circle at 90% 12%, rgba(var(--accent-color-rgb), 0.20), transparent 34%),
      rgba(var(--accent-color-rgb), 0.08);
  outline: none;
}

.starter-card span {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 900;
}

.starter-card small {
  display: -webkit-box;
  min-height: 30px;
  overflow: hidden;
  color: var(--settings-text-secondary);
  font-size: 11px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.d-body { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 980px) { .d-body { grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); align-items: start; } }
@media (min-width: 980px) { .preview-col { position: sticky; top: 8px; } }

/* 段切换 */
.seg { display: inline-flex; padding: 3px; border-radius: 12px; background: rgba(var(--overlay-rgb), 0.10); margin-bottom: 14px; }
.seg-btn { padding: 6px 14px; border-radius: 9px; font-size: 12px; font-weight: 800; opacity: 0.7; }
.seg-btn.active { background: var(--accent-color); color: #fff; opacity: 1; }

.sec { min-width: 0; }
.field { display: grid; gap: 5px; min-width: 0; }
.field > span { font-size: 11px; font-weight: 800; opacity: 0.62; }
.field-label { font-size: 11px; font-weight: 800; opacity: 0.62; margin-bottom: 6px; }
.field input, .group-select {
  width: 100%; height: 34px; padding: 0 10px; border-radius: 10px;
  border: 1px solid var(--glass-border); background: rgba(var(--overlay-rgb), 0.08);
  font-size: 12px; outline: none; color: inherit;
}
.field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }

.designer-note {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(var(--accent-color-rgb), 0.18);
  background: rgba(var(--accent-color-rgb), 0.08);
  color: var(--settings-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.designer-note code {
  padding: 1px 4px;
  border-radius: 5px;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
}

.code-area {
  width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--glass-border);
  background: rgba(var(--overlay-rgb), 0.10); font-size: 12px; line-height: 1.5; resize: vertical; outline: none; color: inherit;
}
.code-area.mono { font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.size-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.size-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.size-col { display: grid; gap: 5px; }
.size-col > span { font-size: 11px; font-weight: 800; opacity: 0.62; }
.size-col > div { display: flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.7; }
.size-col input { width: 46px; height: 32px; text-align: center; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(var(--overlay-rgb), 0.08); color: inherit; outline: none; }

.cap-row { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; cursor: pointer; }
.cap-row input { margin-top: 2px; width: 15px; height: 15px; accent-color: var(--accent-color); }
.cap-text { display: grid; gap: 1px; min-width: 0; }
.cap-text b { font-size: 11px; }
.cap-text small { font-size: 10px; opacity: 0.6; line-height: 1.35; }

.preview-stage {
  position: relative; width: 100%; height: 220px; border-radius: 14px; overflow: hidden;
  border: 1px dashed var(--glass-border);
  background: repeating-conic-gradient(rgba(127,127,127,0.06) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px;
}
.preview-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px; color: rgb(239 68 68); font-size: 11px; font-weight: 700; text-align: center; }

.console { border-radius: 12px; border: 1px solid var(--glass-border); overflow: hidden; }
.console-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; font-size: 11px; font-weight: 800; opacity: 0.75; background: rgba(var(--overlay-rgb), 0.08); }
.console-body { max-height: 130px; overflow: auto; padding: 6px 8px; font-family: 'Fira Code', ui-monospace, monospace; }
.console-empty { font-size: 10px; opacity: 0.5; }
.console-line { display: flex; gap: 8px; padding: 2px 0; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.console-level { flex: 0 0 auto; text-transform: uppercase; font-size: 9px; font-weight: 900; opacity: 0.6; }
.console-line.error .console-level, .console-line.error .console-text { color: rgb(239 68 68); }
.console-line.warn .console-level { color: rgb(245 158 11); }

.status-row { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; }
.status-row.ok { color: rgb(34 197 94); }
.status-row.bad { color: rgb(239 68 68); }

.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.apply-group { display: flex; align-items: center; gap: 6px; }
.group-select { width: auto; min-width: 110px; }

.mydesigns { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.qs-label { font-size: 11px; font-weight: 800; opacity: 0.55; }

.chip { padding: 5px 11px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid var(--glass-border); background: rgba(var(--overlay-rgb), 0.08); }
.chip:hover { border-color: var(--accent-color); color: var(--accent-color); }
.chip.accent { border-color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.12); color: var(--accent-color); }

.design-chip { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid var(--glass-border); background: rgba(var(--overlay-rgb), 0.08); overflow: hidden; }
.design-chip.active { border-color: var(--accent-color); }
.design-chip-main { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px 5px 10px; font-size: 11px; font-weight: 700; max-width: 160px; }
.design-chip-main span, .design-chip-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.design-chip-del { padding: 5px 8px; color: rgb(220 38 38); background: rgba(220, 38, 38, 0.08); }

.warn-banner { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.1); }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer; }
.btn.sm { height: 30px; padding: 0 10px; }
.btn.xs { height: 22px; padding: 0 8px; font-size: 10px; }
.btn.primary { color: white; background: var(--accent-color); border: 0; }
.btn.ghost { color: inherit; background: rgba(var(--overlay-rgb), 0.08); border: 1px solid var(--glass-border); }
.btn.ghost:hover { border-color: var(--accent-color); }

.docs { font-size: 12px; line-height: 1.6; }
.doc-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 14px; }
.docs p { opacity: 0.82; margin: 4px 0 10px; }
.doc-h { font-size: 12px; font-weight: 900; margin: 12px 0 4px; }
.doc-h:first-child { margin-top: 0; }
.docs code { font-family: 'Fira Code', ui-monospace, monospace; font-size: 11px; padding: 1px 4px; border-radius: 5px; background: rgba(var(--overlay-rgb), 0.12); }
.doc-code { font-family: 'Fira Code', ui-monospace, monospace; font-size: 11px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: rgba(var(--overlay-rgb), 0.12); overflow: auto; margin: 4px 0 10px; }

@media (max-width: 720px) {
  .designer-head { align-items: flex-start; flex-direction: column; }
  .head-actions { justify-content: flex-start; }
  .starter-grid, .doc-grid { grid-template-columns: 1fr; }
}
</style>
