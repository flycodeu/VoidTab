// src/core/tiles/designerPackage.ts
//
// Helpers that power the in-app "组件设计" (component designer). A designer draft
// is an editor-friendly view over a sandbox tile package; building converts it
// into the canonical SandboxTilePackageWire and runs it through the real
// parser/validator so the designer never ships a package the runtime would reject.
import type {JsonValue, SandboxTilePackageWire, TileCapability, TileInstallRecord, TileSize} from './contracts.ts';
import {DECLARATIVE_TILE_PACKAGE_KIND, DECLARATIVE_TILE_PACKAGE_VERSION} from './declarativePackage.ts';
import {createSandboxTilePackageExport, parseSandboxTilePackage} from './sandboxPackage.ts';
import type {SandboxRuntimePermission} from '../config/types.ts';

export const DESIGNER_ENTRY_PATH = 'index.js' as const;

export interface DesignerDraft {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: string;
    version: string;
    sizes: {
        default: TileSize;
        min: TileSize;
        max: TileSize;
    };
    permissions: SandboxRuntimePermission[];
    networkHosts: string[];
    entryCode: string;
    styles: string;
    modalHtml: string;
    modalStyles: string;
    modalWidth: string;
    modalHeight: string;
    html: string;
    /** Raw JSON text for the optional settingsSchema; empty means "none". */
    settingsSchemaText: string;
}

export const DESIGNER_PERMISSION_INFO: Record<SandboxRuntimePermission, {label: string; detail: string}> = {
    storage: {label: '实例存储', detail: '读写本实例自己的本地小容量数据（ctx.storage）'},
    network: {label: '网络代理', detail: '经宿主访问清单声明的域名（ctx.network.fetch，仅 GET/HEAD）'},
    openExternal: {label: '打开外链', detail: '在新标签页打开经校验的 URL（ctx.openUrl）'},
    'clipboard.write': {label: '写入剪贴板', detail: '把文本写入系统剪贴板（ctx.copyText）'},
    notifications: {label: '系统通知', detail: '在浏览器授权后发送本地通知（ctx.notify）'},
};

const cloneSize = (size: TileSize): TileSize => ({w: size.w, h: size.h});

export function createBlankDraft(now = Date.now()): DesignerDraft {
    const suffix = Math.random().toString(36).slice(2, 6);
    const starter = STARTER_TEMPLATES[0].draft(now);
    return {
        id: `my.widget-${suffix}`,
        label: '我的组件',
        description: '',
        icon: 'Code',
        category: 'local',
        version: '0.1.0',
        sizes: {
            default: {w: 2, h: 2},
            min: {w: 1, h: 1},
            max: {w: 4, h: 4},
        },
        permissions: starter.permissions.slice(),
        networkHosts: starter.networkHosts.slice(),
        entryCode: starter.entryCode,
        styles: starter.styles,
        modalHtml: starter.modalHtml,
        modalStyles: starter.modalStyles,
        modalWidth: starter.modalWidth,
        modalHeight: starter.modalHeight,
        html: '',
        settingsSchemaText: starter.settingsSchemaText,
    };
}

function permissionsToCapabilities(permissions: SandboxRuntimePermission[], networkHosts: string[]): TileCapability[] {
    const caps: TileCapability[] = [];
    if (permissions.includes('storage')) caps.push({type: 'storage', scope: 'instance'});
    if (permissions.includes('network')) {
        caps.push({type: 'network', hosts: networkHosts.map((host) => host.trim()).filter(Boolean)});
    }
    if (permissions.includes('openExternal')) caps.push({type: 'openExternal'});
    if (permissions.includes('clipboard.write')) caps.push({type: 'clipboard.write'});
    if (permissions.includes('notifications')) caps.push({type: 'notifications'});
    return caps;
}

function capabilitiesToPermissions(capabilities: TileCapability[] | undefined): {
    permissions: SandboxRuntimePermission[];
    networkHosts: string[];
} {
    const permissions: SandboxRuntimePermission[] = [];
    let networkHosts: string[] = [];
    for (const capability of capabilities || []) {
        if (capability.type === 'storage') permissions.push('storage');
        else if (capability.type === 'network') {
            permissions.push('network');
            networkHosts = (capability.hosts || []).slice();
        } else if (capability.type === 'openExternal') permissions.push('openExternal');
        else if (capability.type === 'clipboard.write') permissions.push('clipboard.write');
        else if (capability.type === 'notifications') permissions.push('notifications');
    }
    return {permissions, networkHosts};
}

const DESIGNER_MODAL_START = '/* voidtab-designer-modal:start */';
const DESIGNER_MODAL_END = '/* voidtab-designer-modal:end */';

function createDesignerModalHelper(draft: DesignerDraft) {
    const payload = {
        title: draft.label.trim() || draft.id.trim() || '详情',
        html: draft.modalHtml || '',
        styles: draft.modalStyles || '',
        width: draft.modalWidth || '',
        height: draft.modalHeight || '',
    };
    return `${DESIGNER_MODAL_START}
const __VOIDTAB_DESIGNER_MODAL__ = JSON.parse(${JSON.stringify(JSON.stringify(payload))});
window.VoidTabDesigner = Object.freeze({
  modal: __VOIDTAB_DESIGNER_MODAL__,
  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] || char);
  },
  openModal(ctx, overrides) {
    const next = Object.assign({}, __VOIDTAB_DESIGNER_MODAL__, overrides || {});
    return ctx.modal.open(next);
  },
  updateModal(ctx, overrides) {
    const next = Object.assign({}, __VOIDTAB_DESIGNER_MODAL__, overrides || {});
    return ctx.modal.update ? ctx.modal.update(next) : ctx.modal.open(next);
  }
});
${DESIGNER_MODAL_END}`;
}

function buildDesignerEntryCode(draft: DesignerDraft) {
    return `${createDesignerModalHelper(draft)}

${draft.entryCode || ''}`;
}

function splitDesignerEntryCode(source: string) {
    const start = source.indexOf(DESIGNER_MODAL_START);
    const end = source.indexOf(DESIGNER_MODAL_END);
    if (start < 0 || end < start) {
        return {
            entryCode: source,
            modalHtml: '',
            modalStyles: '',
            modalWidth: '',
            modalHeight: '',
        };
    }

    const helper = source.slice(start + DESIGNER_MODAL_START.length, end);
    const entryCode = `${source.slice(0, start)}${source.slice(end + DESIGNER_MODAL_END.length)}`.trimStart();
    const match = helper.match(/JSON\.parse\((["'][\s\S]*?["'])\)/);
    if (!match) return {entryCode, modalHtml: '', modalStyles: '', modalWidth: '', modalHeight: ''};

    try {
        const payload = JSON.parse(JSON.parse(match[1])) as {html?: unknown; styles?: unknown; width?: unknown; height?: unknown};
        return {
            entryCode,
            modalHtml: typeof payload.html === 'string' ? payload.html : '',
            modalStyles: typeof payload.styles === 'string' ? payload.styles : '',
            modalWidth: typeof payload.width === 'string' ? payload.width : '',
            modalHeight: typeof payload.height === 'string' ? payload.height : '',
        };
    } catch {
        return {entryCode, modalHtml: '', modalStyles: '', modalWidth: '', modalHeight: ''};
    }
}

/** Build a raw package wire from a draft. May throw on invalid settingsSchema JSON. */
export function buildSandboxPackageWireFromDraft(draft: DesignerDraft): SandboxTilePackageWire {
    let settingsSchema: JsonValue | undefined;
    const schemaText = draft.settingsSchemaText.trim();
    if (schemaText) {
        try {
            settingsSchema = JSON.parse(schemaText) as JsonValue;
        } catch {
            throw new TypeError('设置 Schema 不是有效的 JSON');
        }
    }

    const capabilities = permissionsToCapabilities(draft.permissions, draft.networkHosts);

    return {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
        manifest: {
            manifestVersion: 1,
            id: draft.id.trim(),
            version: draft.version.trim() || '0.0.0',
            apiVersion: 1,
            source: 'sandbox',
            metadata: {
                label: draft.label.trim() || draft.id.trim(),
                ...(draft.description.trim() ? {description: draft.description.trim()} : {}),
                icon: draft.icon.trim() || 'Code',
                category: draft.category.trim() || 'local',
            },
            sizes: {
                default: cloneSize(draft.sizes.default),
                min: cloneSize(draft.sizes.min),
                max: cloneSize(draft.sizes.max),
            },
            renderer: {kind: 'sandbox', entry: DESIGNER_ENTRY_PATH},
            ...(settingsSchema !== undefined ? {settingsSchema} : {}),
            ...(capabilities.length ? {capabilities} : {}),
            compatibility: {
                targets: ['web', 'extension'],
                minHostVersion: '1.0.0',
                mobileSupport: 'full',
            },
            integrity: {sha256: '', assets: {}},
        } as SandboxTilePackageWire['manifest'],
        sandbox: {
            entry: DESIGNER_ENTRY_PATH,
            scripts: {[DESIGNER_ENTRY_PATH]: buildDesignerEntryCode(draft)},
            ...(draft.styles.trim() ? {styles: draft.styles} : {}),
            ...(draft.html.trim() ? {html: draft.html} : {}),
        },
    };
}

export interface DesignerBuildResult {
    ok: boolean;
    error?: string;
    wire?: SandboxTilePackageWire;
    install?: TileInstallRecord;
}

/** Build + validate a draft through the real sandbox parser. */
export function compileDraft(draft: DesignerDraft, now = Date.now()): DesignerBuildResult {
    try {
        const wire = buildSandboxPackageWireFromDraft(draft);
        const parsed = parseSandboxTilePackage(wire, now);
        return {ok: true, wire, install: parsed.install};
    } catch (error) {
        return {ok: false, error: error instanceof Error ? error.message : '组件包结构无效'};
    }
}

/** Reconstruct an editable draft from an installed sandbox package (for editing). */
export function createDraftFromInstall(install: TileInstallRecord): DesignerDraft | null {
    if (install.runtime !== 'sandbox' || !install.manifest || !install.sandbox) return null;
    const manifest = install.manifest;
    const entry = install.sandbox.entry;
    const {permissions, networkHosts} = capabilitiesToPermissions(manifest.capabilities);
    const designerSource = splitDesignerEntryCode(install.sandbox.scripts[entry] || '');
    return {
        id: manifest.id,
        label: manifest.metadata.label,
        description: manifest.metadata.description || '',
        icon: manifest.metadata.icon || 'Code',
        category: manifest.metadata.category || 'local',
        version: manifest.version,
        sizes: {
            default: cloneSize(manifest.sizes.default),
            min: cloneSize(manifest.sizes.min),
            max: cloneSize(manifest.sizes.max),
        },
        permissions,
        networkHosts,
        entryCode: designerSource.entryCode,
        styles: install.sandbox.styles || '',
        modalHtml: designerSource.modalHtml,
        modalStyles: designerSource.modalStyles,
        modalWidth: designerSource.modalWidth || '760px',
        modalHeight: designerSource.modalHeight || '620px',
        html: install.sandbox.html || '',
        settingsSchemaText: manifest.settingsSchema !== undefined
            ? JSON.stringify(manifest.settingsSchema, null, 2)
            : '',
    };
}

/** Pretty-printed package JSON for export/share. */
export function exportDraftPackageJson(install: TileInstallRecord): string | null {
    const wire = createSandboxTilePackageExport(install);
    return wire ? JSON.stringify(wire, null, 2) : null;
}

// ---------------------------------------------------------------------------
// Starter templates — one-click examples loaded into the editor.
// ---------------------------------------------------------------------------

export interface StarterTemplate {
    id: string;
    label: string;
    description: string;
    draft: (now?: number) => DesignerDraft;
}

const themedCoverBaseStyles = `:root{
  --sample-accent:var(--vt-accent,#3b82f6);
  --sample-text:var(--vt-text,#f8fafc);
  --sample-muted:var(--vt-muted,rgba(248,250,252,.66));
  --sample-surface:var(--vt-surface,rgba(255,255,255,.08));
  --sample-line:color-mix(in srgb,var(--sample-text) 13%,transparent);
}
:is(.focus-clock,.habit-card,.net-card){
  position:relative;isolation:isolate;overflow:hidden;
  width:100%;height:100%;box-sizing:border-box;border:1px solid var(--sample-line);
  border-radius:inherit;color:var(--sample-text);cursor:pointer;text-align:left;
  background:
    linear-gradient(135deg,color-mix(in srgb,var(--sample-accent) 12%,transparent),transparent 56%),
    color-mix(in srgb,var(--sample-surface) 92%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 16%,transparent);
  transition:transform .16s ease,border-color .16s ease,background .16s ease;
}
:is(.focus-clock,.habit-card,.net-card)::before{
  content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(90deg,color-mix(in srgb,var(--sample-accent) 13%,transparent),transparent 34%);
  opacity:.9;mask-image:linear-gradient(135deg,#000,transparent 72%);
}
:is(.focus-clock,.habit-card,.net-card):hover{border-color:color-mix(in srgb,var(--sample-accent) 45%,transparent)}
:is(.focus-clock,.habit-card,.net-card):active{transform:scale(.985)}
`;

const themedModalBaseStyles = `.modal-card{
  --sample-accent:var(--vt-accent,#3b82f6);
  --sample-text:var(--vt-text,#f8fafc);
  --sample-muted:var(--vt-muted,rgba(248,250,252,.66));
  --sample-surface:var(--vt-surface,rgba(255,255,255,.08));
  --sample-line:color-mix(in srgb,var(--sample-text) 13%,transparent);
  min-height:100%;padding:22px;color:var(--sample-text);
  background:
    linear-gradient(135deg,color-mix(in srgb,var(--sample-accent) 9%,transparent),transparent 54%),
    color-mix(in srgb,var(--sample-surface) 94%,transparent);
}
.sample-hero,.modal-card>header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px;border:1px solid var(--sample-line);border-radius:18px;background:color-mix(in srgb,var(--sample-surface) 82%,transparent)}
.sample-hero>div,.modal-card>header>div{min-width:0}
.modal-card header span{display:block;font-size:11px;line-height:1.2;font-weight:950;letter-spacing:0;color:var(--sample-accent)}
.modal-card h1{margin:8px 0 7px;font-size:clamp(26px,7vw,44px);line-height:1;font-weight:950;letter-spacing:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.modal-card p{max-width:64ch;margin:0;color:var(--sample-muted)}
.hero-badge,.section-badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:52px;height:32px;padding:0 10px;border-radius:11px;border:1px solid color-mix(in srgb,var(--sample-accent) 34%,transparent);background:color-mix(in srgb,var(--sample-accent) 10%,transparent);color:var(--sample-accent);font-style:normal;font-size:12px;font-weight:950}
.status-strip{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;padding:14px;border-radius:16px;background:color-mix(in srgb,var(--sample-surface) 78%,transparent);border:1px solid var(--sample-line)}
.status-strip b,.status-strip span{display:block}.status-strip b{font-size:16px}.status-strip span{margin-top:3px;font-size:12px;color:var(--sample-muted)}
.sample-section{margin-top:14px;padding:16px;border-radius:18px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 74%,transparent)}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.section-head h2{margin:0;font-size:14px;line-height:1.2}.section-head span{font-size:11px;font-weight:900;color:var(--sample-muted)}
.metric-grid,.habit-stats,.net-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.metric-grid article,.habit-stats article,.net-grid article{min-width:0;padding:14px;border-radius:15px;background:color-mix(in srgb,var(--sample-surface) 76%,transparent);border:1px solid var(--sample-line)}
.metric-grid span,.habit-stats span,.net-grid span{display:block;font-size:11px;font-weight:850;color:var(--sample-muted)}
.metric-grid b,.habit-stats b,.net-grid b{display:block;margin-top:5px;font-size:clamp(16px,4vw,24px);line-height:1.1;font-weight:950;overflow-wrap:anywhere}
.metric-grid em,.habit-meter{display:block;height:8px;margin-top:11px;border-radius:999px;background:color-mix(in srgb,var(--sample-text) 10%,transparent);overflow:hidden}
.metric-grid i,.habit-meter b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--sample-accent),color-mix(in srgb,var(--sample-accent) 42%,#fff))}
.editable-list,.field-list{display:grid;gap:8px}
.edit-row{display:grid;grid-template-columns:58px minmax(80px,.75fr) minmax(120px,1.25fr);gap:8px;align-items:center;padding:8px;border-radius:13px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 70%,transparent)}
.edit-row.is-active{border-color:color-mix(in srgb,var(--sample-accent) 42%,transparent);background:color-mix(in srgb,var(--sample-accent) 9%,transparent)}
.row-time{font-size:12px;font-weight:950;color:var(--sample-accent);font-variant-numeric:tabular-nums}
.inline-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.inline-field{display:grid;gap:6px}.inline-field span{font-size:11px;font-weight:900;color:var(--sample-muted)}
input,textarea{width:100%;min-width:0;border:1px solid var(--sample-line);border-radius:11px;background:color-mix(in srgb,var(--sample-surface) 82%,transparent);color:var(--sample-text);font:inherit;font-size:13px;outline:none}
input{height:34px;padding:0 10px}textarea{min-height:78px;padding:9px 10px;resize:vertical}
input:focus,textarea:focus{border-color:color-mix(in srgb,var(--sample-accent) 58%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sample-accent) 13%,transparent)}
.field-row{display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px;align-items:start;padding:10px 0;border-bottom:1px solid var(--sample-line)}.field-row:last-child{border-bottom:0}
.field-row span{font-size:11px;font-weight:900;color:var(--sample-muted)}.field-row b{font-size:13px;line-height:1.35;overflow-wrap:anywhere}
.tag-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.tag-row span{padding:6px 9px;border-radius:999px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 75%,transparent);font-size:11px;font-weight:850;color:var(--sample-muted)}
.habit-meter{margin-top:14px}.habit-note{margin-top:14px!important;font-size:12px}
@media(max-width:560px){.sample-hero,.modal-card>header{display:grid}.metric-grid,.habit-stats,.net-grid,.inline-fields{grid-template-columns:1fr}.edit-row,.field-row{grid-template-columns:1fr}.hero-badge{justify-content:flex-start;width:max-content}}
`;

const clockCode = `// 时间看板：显示时间、日期、下一项闹钟，并支持在详情中维护今日计划。
const PLAN_KEY = 'time-board-plan-v2';

VoidWidget.define({
  async mount(ctx) {
    const root = document.createElement('button');
    root.className = 'focus-clock time-card';
    root.type = 'button';
    root.innerHTML =
      '<div class="time-head"><span class="date-line"></span><b class="weekday-pill"></b></div>' +
      '<div class="time-main"><strong class="clock-time"></strong><span class="clock-seconds"></span></div>' +
      '<div class="next-alarm"><span></span><b></b><small></small></div>' +
      '<div class="clock-band"><span></span><b><i></i></b></div>';
    ctx.root.appendChild(root);

    const state = {
      root,
      plan: await loadPlan(ctx),
      lastAlertKey: '',
      paused: false,
    };
    this._state = state;
    this._render = () => render(ctx, state);

    root.addEventListener('click', () => openDetail(ctx, state));
    this._render();
    this._timer = setInterval(this._render, 1000);
  },
  pause() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._state) this._state.paused = true;
  },
  resume() {
    if (!this._render || this._timer) return;
    if (this._state) this._state.paused = false;
    this._render();
    this._timer = setInterval(this._render, 1000);
  },
  unmount() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },
  async modalEvent(ctx, event) {
    const state = this._state || {plan: defaultPlan(), root: null, lastAlertKey: ''};
    if (event.name === 'save-time-plan') {
      state.plan = readPlanFromForm(event.data);
      await savePlan(ctx, state.plan);
      render(ctx, state);
      openDetail(ctx, state, '计划已保存，封面会显示最近一项', true, '[data-vt-section="plan-list"]');
      return;
    }
    if (event.name === 'add-time-plan') {
      state.plan = readPlanFromForm(event.data, normalizePlan(state.plan));
      await savePlan(ctx, state.plan);
      render(ctx, state);
      openDetail(ctx, state, '已添加一项计划', true, '[data-vt-section="add-plan"]');
      return;
    }
    if (event.name === 'delete-time-plan') {
      const index = Number(event.source && event.source.dataset ? event.source.dataset.index : -1);
      const next = readPlanFromForm(event.data, normalizePlan(state.plan));
      if (Number.isInteger(index) && index >= 0) next.splice(index, 1);
      state.plan = normalizePlan(next);
      await savePlan(ctx, state.plan);
      render(ctx, state);
      openDetail(ctx, state, '已删除该计划', true, '[data-vt-section="plan-list"]');
      return;
    }
    if (event.name === 'reset-time-plan') {
      state.plan = defaultPlan();
      await savePlan(ctx, state.plan);
      render(ctx, state);
      openDetail(ctx, state, '已恢复示例闹钟和计划', true, '[data-vt-section="plan-list"]');
    }
  },
});

function getPlacement(ctx) {
  return ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
}

function getPanelTitle(ctx) {
  const value = ctx.settings && typeof ctx.settings.panelTitle === 'string' ? ctx.settings.panelTitle.trim() : '';
  return value || '时间看板';
}

function defaultPlan() {
  return [
    {time: '07:30', title: '起床', note: '洗漱、喝水、查看今天安排', enabled: true},
    {time: '09:30', title: '开始工作', note: '处理最重要的一件事', enabled: true},
    {time: '12:20', title: '午休', note: '离开屏幕，补充能量', enabled: true},
    {time: '18:30', title: '晚间计划', note: '运动、采购或家庭事项', enabled: true},
  ];
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\\d{1,2}):(\\d{2})$/);
  if (!match) return '';
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function normalizePlan(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => ({
    time: normalizeTime(item && item.time),
    title: String(item && item.title || '').trim().slice(0, 36),
    note: String(item && item.note || '').trim().slice(0, 90),
    enabled: item ? item.enabled !== false : true,
  })).filter((item) => item.time && item.title).slice(0, 8).sort((a, b) => a.time.localeCompare(b.time));
}

async function loadPlan(ctx) {
  try {
    const saved = await ctx.storage.get(PLAN_KEY);
    const normalized = normalizePlan(saved);
    if (normalized.length) return normalized;
  } catch (e) {}
  return defaultPlan();
}

async function savePlan(ctx, plan) {
  try {
    await ctx.storage.set(PLAN_KEY, normalizePlan(plan));
  } catch (e) {}
}

function readFormValue(data, key) {
  const value = data && data[key];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function readPlanFromForm(data, fallback) {
  const plan = [];
  for (let index = 0; index < 8; index += 1) {
    const time = normalizeTime(readFormValue(data, 'time' + index));
    const title = readFormValue(data, 'title' + index).trim();
    const note = readFormValue(data, 'note' + index).trim();
    if (time && title) {
      plan.push({time, title: title.slice(0, 36), note: note.slice(0, 90), enabled: readFormValue(data, 'enabled' + index) === 'on'});
    }
  }
  const newTime = normalizeTime(readFormValue(data, 'newTime'));
  const newTitle = readFormValue(data, 'newTitle').trim();
  if (newTime && newTitle) {
    plan.push({time: newTime, title: newTitle.slice(0, 36), note: readFormValue(data, 'newNote').trim().slice(0, 90), enabled: true});
  }
  const normalized = normalizePlan(plan);
  const fallbackPlan = normalizePlan(fallback);
  return normalized.length ? normalized : (fallbackPlan.length ? fallbackPlan : defaultPlan());
}

function minuteOf(time) {
  const parts = String(time || '00:00').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function getNextAlarm(now, plan) {
  const enabled = normalizePlan(plan).filter((item) => item.enabled !== false);
  if (!enabled.length) return null;
  const current = now.getHours() * 60 + now.getMinutes();
  for (const item of enabled) {
    const diff = minuteOf(item.time) - current;
    if (diff >= 0) return {item, diff, tomorrow: false};
  }
  return {item: enabled[0], diff: 1440 - current + minuteOf(enabled[0].time), tomorrow: true};
}

function formatDiff(minutes) {
  if (minutes <= 0) return '现在';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (!hour) return minute + ' 分钟后';
  return hour + ' 小时 ' + String(minute).padStart(2, '0') + ' 分钟后';
}

function dayProgress(now) {
  return Math.round((now.getHours() * 60 + now.getMinutes()) / 1440 * 100);
}

function weekProgress(now) {
  const day = now.getDay() || 7;
  return Math.min(100, Math.round(((day - 1) * 1440 + now.getHours() * 60 + now.getMinutes()) / (7 * 1440) * 100));
}

function render(ctx, state) {
  if (!state.root) return;
  const now = new Date();
  const placement = getPlacement(ctx);
  const compact = placement.w <= 1 || placement.h <= 1;
  const wide = placement.w >= 3;
  const next = getNextAlarm(now, state.plan);
  const progress = dayProgress(now);

  state.root.classList.toggle('is-compact', compact);
  state.root.classList.toggle('is-wide', wide);
  state.root.querySelector('.date-line').textContent = now.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric'});
  state.root.querySelector('.weekday-pill').textContent = now.toLocaleDateString('zh-CN', {weekday: 'short'});
  state.root.querySelector('.clock-time').textContent = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
  state.root.querySelector('.clock-seconds').textContent = now.toLocaleTimeString('zh-CN', {second: '2-digit'}).replace(/\\D/g, '');
  state.root.querySelector('.next-alarm span').textContent = next ? (next.tomorrow ? '明天提醒' : '下一项') : '今日计划';
  state.root.querySelector('.next-alarm b').textContent = next ? next.item.time + ' · ' + next.item.title : '暂无启用提醒';
  state.root.querySelector('.next-alarm small').textContent = next ? formatDiff(next.diff) + (next.item.note ? ' / ' + next.item.note : '') : '打开详情添加闹钟';
  state.root.querySelector('.clock-band span').textContent = '今日 ' + progress + '%';
  state.root.querySelector('.clock-band i').style.width = progress + '%';

  if (!state.paused) checkDueNotification(ctx, state, now, next);
}

function checkDueNotification(ctx, state, now, next) {
  if (!next || next.tomorrow || next.diff !== 0 || now.getSeconds() > 3) return;
  const key = now.toLocaleDateString('zh-CN') + ':' + next.item.time + ':' + next.item.title;
  if (state.lastAlertKey === key) return;
  state.lastAlertKey = key;
  ctx.notify(next.item.title, {body: next.item.note || '时间到了'}).catch(() => {});
}

function buildAlarmRows(plan) {
  const esc = VoidTabDesigner.escapeHtml;
  return normalizePlan(plan).map((item, index) =>
    '<label class="alarm-row">' +
      '<input class="alarm-check" type="checkbox" name="enabled' + index + '" ' + (item.enabled === false ? '' : 'checked') + '>' +
      '<input type="time" name="time' + index + '" value="' + esc(item.time) + '">' +
      '<input name="title' + index + '" value="' + esc(item.title) + '" placeholder="标题">' +
      '<input name="note' + index + '" value="' + esc(item.note) + '" placeholder="备注">' +
      '<button type="button" class="row-danger" data-vt-action="delete-time-plan" data-index="' + index + '">删除</button>' +
    '</label>'
  ).join('');
}

function openDetail(ctx, state, notice, updateOnly, scrollTarget) {
  const now = new Date();
  const next = getNextAlarm(now, state.plan);
  const esc = VoidTabDesigner.escapeHtml;
  const title = getPanelTitle(ctx);
  const time = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const date = now.toLocaleDateString('zh-CN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
  const html =
    '<main class="modal-card time-detail">' +
      '<header class="sample-hero time-hero"><div><span>' + esc(title) + '</span><h1>' + esc(time) + '</h1><p>' + esc(date) + '</p></div><i class="hero-badge">闹钟</i></header>' +
      '<section class="time-dock">' +
        '<article><span>下一项</span><b>' + esc(next ? next.item.time + ' · ' + next.item.title : '暂无启用提醒') + '</b><small>' + esc(next ? formatDiff(next.diff) : '添加计划后显示倒计时') + '</small></article>' +
        '<article><span>今日</span><b>' + dayProgress(now) + '%</b><small>一天进度</small></article>' +
        '<article><span>本周</span><b>' + weekProgress(now) + '%</b><small>周进度</small></article>' +
      '</section>' +
      '<form class="alarm-form" data-vt-action="save-time-plan">' +
        '<section class="sample-section" data-vt-section="plan-list"><div class="section-head"><h2>闹钟和计划</h2><span>最多 8 项，保存在本实例</span></div>' + (notice ? '<p class="section-notice">' + esc(notice) + '</p>' : '') + '<div class="alarm-board">' + buildAlarmRows(state.plan) + '</div></section>' +
        '<section class="sample-section add-alarm" data-vt-section="add-plan"><div class="section-head"><h2>新增一项</h2><span>立即添加到本实例</span></div><div class="alarm-row new-row"><span></span><input type="time" name="newTime"><input name="newTitle" placeholder="例如：喝水 / 会议 / 取快递"><input name="newNote" placeholder="备注"><button type="button" class="row-add" data-vt-action="add-time-plan">添加</button></div></section>' +
        '<div class="modal-actions"><button type="submit" class="primary-action" data-vt-action="save-time-plan">保存全部</button><button type="button" class="secondary-action" data-vt-action="reset-time-plan">恢复示例</button></div>' +
      '</form>' +
      '<p class="habit-note">提示：封面会显示最近一项倒计时；到点时会尝试发送本地通知，正式桌面实例需授权通知能力。</p>' +
    '</main>';
  const payload = {title: title, html: html, scrollTarget: scrollTarget || ''};
  return updateOnly ? VoidTabDesigner.updateModal(ctx, payload) : VoidTabDesigner.openModal(ctx, payload);
}`;

const clockStyles = `${themedCoverBaseStyles}
.time-card{
  padding:16px;border:0;
  display:grid;grid-template-rows:auto 1fr auto auto;gap:11px;
}
.time-head,.clock-band{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:850;color:var(--sample-muted)}
.date-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.weekday-pill{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,var(--sample-accent) 14%,transparent);color:var(--sample-accent);font-size:11px;font-weight:950}
.time-main{display:flex;align-items:flex-end;gap:8px;min-width:0}
.clock-time{font-size:clamp(40px,19cqw,82px);line-height:.88;font-weight:950;letter-spacing:0;font-variant-numeric:tabular-nums}
.clock-seconds{margin-bottom:5px;font-size:clamp(14px,5cqw,24px);line-height:1;font-weight:950;color:var(--sample-accent);font-variant-numeric:tabular-nums}
.next-alarm{display:grid;gap:3px;min-width:0;padding:10px 11px;border-radius:15px;background:color-mix(in srgb,var(--sample-surface) 76%,transparent);border:1px solid var(--sample-line)}
.next-alarm span{font-size:10px;font-weight:950;color:var(--sample-accent)}
.next-alarm b{font-size:13px;line-height:1.18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.next-alarm small{font-size:11px;line-height:1.22;color:var(--sample-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clock-band{gap:8px}
.clock-band b{height:7px;flex:1;border-radius:999px;background:color-mix(in srgb,var(--sample-text) 11%,transparent);overflow:hidden}
.clock-band i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--sample-accent),color-mix(in srgb,var(--sample-accent) 36%,#fff));transition:width .2s ease}
.time-card.is-compact{place-items:center;text-align:center;padding:12px;grid-template-rows:auto auto auto}
.time-card.is-compact .time-head,.time-card.is-compact .next-alarm small,.time-card.is-compact .clock-band{display:none}
.time-card.is-compact .time-main{align-items:baseline}
.time-card.is-compact .clock-time{font-size:clamp(30px,22cqw,54px)}
.time-card.is-wide{grid-template-columns:1.2fr .8fr;grid-template-rows:auto 1fr auto}
.time-card.is-wide .time-head,.time-card.is-wide .time-main,.time-card.is-wide .clock-band{grid-column:1}
.time-card.is-wide .next-alarm{grid-column:2;grid-row:1 / span 3;align-self:stretch;align-content:center}
}`;

const clockModalHtml = `<main class="modal-card time-detail">
  <header class="sample-hero time-hero">
    <div>
      <span>时间看板</span>
      <h1>09:41:26</h1>
      <p>2026年6月27日 星期六</p>
    </div>
    <i class="hero-badge">闹钟</i>
  </header>
  <section class="time-dock">
    <article><span>下一项</span><b>09:30 · 开始工作</b><small>1 小时 12 分钟后</small></article>
    <article><span>今日</span><b>41%</b><small>一天进度</small></article>
    <article><span>本周</span><b>72%</b><small>周进度</small></article>
  </section>
  <form class="alarm-form">
    <section class="sample-section"><div class="section-head"><h2>闹钟和计划</h2><span>保存在本实例</span></div>
      <div class="alarm-board">
        <label class="alarm-row"><input class="alarm-check" type="checkbox" checked><input type="time" value="07:30"><input value="起床"><input value="洗漱、喝水、查看今天安排"><button type="button" class="row-danger">删除</button></label>
        <label class="alarm-row"><input class="alarm-check" type="checkbox" checked><input type="time" value="09:30"><input value="开始工作"><input value="处理最重要的一件事"><button type="button" class="row-danger">删除</button></label>
        <label class="alarm-row"><input class="alarm-check" type="checkbox" checked><input type="time" value="18:30"><input value="晚间计划"><input value="运动、采购或家庭事项"><button type="button" class="row-danger">删除</button></label>
      </div>
    </section>
    <section class="sample-section add-alarm"><div class="section-head"><h2>新增一项</h2><span>立即添加到本实例</span></div><div class="alarm-row new-row"><span></span><input type="time"><input placeholder="例如：会议"><input placeholder="备注"><button type="button" class="row-add">添加</button></div></section>
    <div class="modal-actions"><button type="button" class="primary-action">保存全部</button><button type="button" class="secondary-action">恢复示例</button></div>
  </form>
</main>`;

const clockModalStyles = `${themedModalBaseStyles}
.time-dock{display:grid;grid-template-columns:1.35fr .75fr .75fr;gap:10px;margin-top:14px}
.time-dock article{min-width:0;padding:15px;border-radius:16px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 76%,transparent)}
.time-dock span{display:block;font-size:11px;font-weight:900;color:var(--sample-muted)}
.time-dock b{display:block;margin-top:6px;font-size:clamp(18px,4vw,28px);line-height:1.1;font-weight:950;overflow-wrap:anywhere}
.time-dock small{display:block;margin-top:5px;font-size:12px;color:var(--sample-muted)}
.section-notice{margin:0 0 10px!important;padding:8px 10px;border-radius:12px;border:1px solid color-mix(in srgb,var(--sample-accent) 30%,transparent);background:color-mix(in srgb,var(--sample-accent) 9%,transparent);color:var(--sample-accent)!important;font-size:12px;font-weight:850}
.alarm-form{margin-top:14px}.alarm-board{display:grid;gap:8px}
.alarm-row{display:grid;grid-template-columns:26px 96px minmax(110px,.75fr) minmax(140px,1.1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:14px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 70%,transparent)}
.alarm-check{width:18px;height:18px;accent-color:var(--sample-accent)}
.alarm-row input[type=time]{font-variant-numeric:tabular-nums}
.new-row span{width:18px;height:18px;border-radius:999px;background:color-mix(in srgb,var(--sample-accent) 16%,transparent)}
.row-danger,.row-add{height:32px;padding:0 10px;border-radius:10px;border:1px solid var(--sample-line);font-size:12px;font-weight:950;background:color-mix(in srgb,var(--sample-surface) 78%,transparent);color:var(--sample-text)}
.row-danger{border-color:color-mix(in srgb,#ef4444 36%,transparent);color:#ef4444}
.row-add{border-color:color-mix(in srgb,var(--sample-accent) 44%,transparent);color:var(--sample-accent)}
.modal-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.primary-action,.secondary-action{height:36px;padding:0 14px;border-radius:12px;border:1px solid var(--sample-line);font-size:13px;font-weight:950;color:var(--sample-text);background:color-mix(in srgb,var(--sample-surface) 80%,transparent)}
.primary-action{border-color:color-mix(in srgb,var(--sample-accent) 44%,transparent);background:var(--sample-accent);color:#fff}
@media(max-width:640px){.time-dock{grid-template-columns:1fr}.alarm-row{grid-template-columns:24px 1fr}.alarm-row input:nth-child(4),.alarm-row button{grid-column:2}}
`;

const clockSettingsSchema = JSON.stringify({
    type: 'object',
    additionalProperties: true,
    properties: {
        panelTitle: {
            type: 'string',
            title: '看板标题',
            default: '时间看板',
            maxLength: 24,
        },
        note: {
            type: 'string',
            title: '说明',
            default: '点击卡片可维护闹钟和计划；到点时会尝试发送本地通知。',
            maxLength: 160,
        },
    },
}, null, 2);

const counterCode = `// 习惯进度：点击封面记录一次，详情里可调整目标、撤销或重置今天。
const HABIT_KEY = 'habit-progress-v2';

VoidWidget.define({
  async mount(ctx) {
    const button = document.createElement('button');
    button.className = 'habit-card';
    button.type = 'button';
    ctx.root.appendChild(button);

    const state = {button, data: await loadHabit(ctx)};
    this._state = state;
    paint(ctx, state);

    button.addEventListener('click', async () => {
      ensureToday(state.data);
      addHabitRecord(state.data, '');
      state.data.updatedAt = new Date().toISOString();
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state);
    });
  },
  async modalEvent(ctx, event) {
    const state = this._state;
    if (!state) return;
    ensureToday(state.data);
    if (event.name === 'save-habit-settings') {
      state.data.title = readText(event.data, 'habitTitle', state.data.title).slice(0, 24);
      state.data.target = clampNumber(readText(event.data, 'target', state.data.target), 1, 12);
      state.data.minutes = clampNumber(readText(event.data, 'minutes', state.data.minutes), 5, 180);
      state.data.count = Math.min(state.data.count, state.data.target);
      state.data.updatedAt = new Date().toISOString();
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state, '设置已保存', true, '[data-vt-section="habit-settings"]');
      return;
    }
    if (event.name === 'add-habit-record') {
      addHabitRecord(state.data, readText(event.data, 'newRecordNote', ''));
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state, '已新增一条记录', true, '[data-vt-section="add-record"]');
      return;
    }
    if (event.name === 'delete-habit-record') {
      const id = event.source && event.source.dataset ? String(event.source.dataset.id || '') : '';
      state.data.records = (state.data.records || []).filter((record) => record.id !== id);
      state.data.count = state.data.records.length;
      state.data.updatedAt = new Date().toISOString();
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state, '已删除该记录', true, '[data-vt-section="habit-records"]');
      return;
    }
    if (event.name === 'undo-habit') {
      state.data.records = (state.data.records || []).slice(0, -1);
      state.data.count = state.data.records.length;
      state.data.updatedAt = new Date().toISOString();
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state, '已撤销一次记录', true, '[data-vt-section="habit-records"]');
      return;
    }
    if (event.name === 'reset-habit') {
      state.data.records = [];
      state.data.count = 0;
      state.data.updatedAt = new Date().toISOString();
      await saveHabit(ctx, state.data);
      paint(ctx, state);
      openDetail(ctx, state, '今天已重置', true, '[data-vt-section="habit-records"]');
    }
  },
});

function todayKey() {
  return new Date().toLocaleDateString('zh-CN');
}

function defaultHabit(ctx) {
  const title = ctx.settings && typeof ctx.settings.habitTitle === 'string' ? ctx.settings.habitTitle.trim() : '';
  return {day: todayKey(), title: title || '今日专注', count: 0, target: 4, minutes: 25, updatedAt: '', records: []};
}

function normalizeHabit(value, ctx) {
  const base = defaultHabit(ctx);
  const source = value && typeof value === 'object' ? value : {};
  const next = {
    day: String(source.day || base.day),
    title: String(source.title || base.title).slice(0, 24),
    count: clampNumber(source.count, 0, 99),
    target: clampNumber(source.target || base.target, 1, 12),
    minutes: clampNumber(source.minutes || base.minutes, 5, 180),
    updatedAt: String(source.updatedAt || ''),
    records: normalizeRecords(source.records),
  };
  if (!next.records.length && next.count > 0) {
    next.records = Array.from({length: Math.min(next.count, 24)}, (_, index) => ({
      id: 'legacy-' + index,
      at: next.updatedAt || new Date().toISOString(),
      note: '',
    }));
  }
  next.count = next.records.length;
  ensureToday(next);
  return next;
}

function normalizeRecords(records) {
  const list = Array.isArray(records) ? records : [];
  return list.map((record, index) => ({
    id: String(record && record.id || ('record-' + index + '-' + Date.now())),
    at: String(record && record.at || new Date().toISOString()),
    note: String(record && record.note || '').slice(0, 80),
  })).slice(0, 48);
}

async function loadHabit(ctx) {
  try {
    return normalizeHabit(await ctx.storage.get(HABIT_KEY), ctx);
  } catch (e) {
    return defaultHabit(ctx);
  }
}

async function saveHabit(ctx, data) {
  try {
    await ctx.storage.set(HABIT_KEY, data);
  } catch (e) {}
}

function ensureToday(data) {
  const day = todayKey();
  if (data.day !== day) {
    data.day = day;
    data.count = 0;
    data.records = [];
    data.updatedAt = '';
  }
}

function addHabitRecord(data, note) {
  ensureToday(data);
  data.records = normalizeRecords(data.records);
  if (data.records.length >= 48) data.records = data.records.slice(-47);
  const now = new Date().toISOString();
  data.records.push({id: 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), at: now, note: String(note || '').trim().slice(0, 80)});
  data.count = data.records.length;
  data.updatedAt = now;
}

function clampNumber(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function readText(data, key, fallback) {
  const value = data && data[key];
  return String(Array.isArray(value) ? value[0] : value || fallback || '').trim();
}

function paint(ctx, state) {
  const data = state.data;
  ensureToday(data);
  data.records = normalizeRecords(data.records);
  data.count = data.records.length;
  const done = Math.min(data.count, data.target);
  const percent = Math.round(done / data.target * 100);
  const placement = ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
  state.button.classList.toggle('is-compact', placement.w <= 1 || placement.h <= 1);
  state.button.classList.toggle('is-complete', done >= data.target);
  state.button.style.setProperty('--progress', percent + '%');
  state.button.innerHTML =
    '<span class="habit-kicker">' + escapeText(data.title) + '</span>' +
    '<strong>' + done + '<small>/' + data.target + '</small></strong>' +
    '<span class="habit-bar"><i></i></span>' +
    '<span class="habit-foot">' + (done >= data.target ? '目标完成' : '点击记录一次') + ' · ' + (done * data.minutes) + ' 分钟</span>';
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function buildHabitRows(data) {
  const esc = VoidTabDesigner.escapeHtml;
  const records = normalizeRecords(data.records).slice().reverse();
  if (!records.length) return '<p class="console-empty">今天还没有记录。</p>';
  return records.map((record) => {
    const time = record.at ? new Date(record.at).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '--:--';
    return '<div class="habit-record-row"><span>' + esc(time) + '</span><b>' + esc(record.note || '完成一次') + '</b><button type="button" class="row-danger" data-vt-action="delete-habit-record" data-id="' + esc(record.id) + '">删除</button></div>';
  }).join('');
}

function openDetail(ctx, state, notice, updateOnly, scrollTarget) {
  const data = state.data;
  ensureToday(data);
  data.records = normalizeRecords(data.records);
  data.count = data.records.length;
  const done = Math.min(data.count, data.target);
  const percent = Math.round(done / data.target * 100);
  const remaining = Math.max(0, data.target - done);
  const esc = VoidTabDesigner.escapeHtml;
  const updatedText = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '尚未记录';
  const rows = buildHabitRows(data);
  const html =
    '<main class="modal-card habit-detail">' +
      '<header class="sample-hero"><div><span>' + esc(data.title) + '</span><h1>' + done + ' / ' + data.target + '</h1><p>' + (remaining ? '还差 ' + remaining + ' 次完成今日目标' : '今日目标已经完成') + '</p></div><i class="hero-badge">' + percent + '%</i></header>' +
      '<section class="habit-meter"><b style="width:' + percent + '%"></b></section>' +
      '<section class="habit-stats">' +
        '<article><span>完成率</span><b>' + percent + '%</b></article>' +
        '<article><span>累计时长</span><b>' + (done * data.minutes) + ' 分钟</b></article>' +
        '<article><span>最后记录</span><b>' + esc(updatedText) + '</b></article>' +
      '</section>' +
      '<form class="habit-settings" data-vt-action="save-habit-settings">' +
        '<section data-vt-section="habit-settings">' + (notice ? '<p class="section-notice">' + esc(notice) + '</p>' : '') + '<section class="inline-fields"><label class="inline-field"><span>习惯名称</span><input name="habitTitle" value="' + esc(data.title) + '"></label><label class="inline-field"><span>今日目标</span><input name="target" type="number" min="1" max="12" value="' + data.target + '"></label></section></section>' +
        '<label class="inline-field"><span>单次时长（分钟）</span><input name="minutes" type="number" min="5" max="180" value="' + data.minutes + '"></label>' +
        '<section class="sample-section" data-vt-section="habit-records"><div class="section-head"><h2>今日记录</h2><span>可删除任意一条</span></div><div class="habit-records">' + rows + '</div></section>' +
        '<section class="sample-section add-record" data-vt-section="add-record"><div class="section-head"><h2>新增记录</h2><span>保存到本实例</span></div><label class="inline-field"><span>备注</span><input name="newRecordNote" placeholder="例如：阅读 25 分钟 / 完成训练"></label><button type="button" class="primary-action" data-vt-action="add-habit-record">新增记录</button></section>' +
        '<div class="modal-actions"><button type="submit" class="primary-action" data-vt-action="save-habit-settings">保存设置</button><button type="button" class="secondary-action" data-vt-action="undo-habit">撤销最后一次</button><button type="button" class="secondary-action" data-vt-action="reset-habit">重置今天</button></div>' +
      '</form>' +
      '<p class="habit-note">封面点击会立刻记录并保存到本组件实例；目标和时长可在这里调整。</p>' +
    '</main>';
  const payload = {title: '习惯进度', html: html, scrollTarget: scrollTarget || ''};
  return updateOnly ? VoidTabDesigner.updateModal(ctx, payload) : VoidTabDesigner.openModal(ctx, payload);
}`;

const counterStyles = `${themedCoverBaseStyles}
.habit-card{
  padding:16px;border:0;
  display:grid;grid-template-rows:auto 1fr auto auto;gap:9px;
}
.habit-kicker,.habit-foot{font-size:11px;font-weight:900;color:var(--sample-muted)}
.habit-card strong{align-self:end;font-size:clamp(32px,18cqw,68px);line-height:.92;font-weight:950;letter-spacing:0;font-variant-numeric:tabular-nums}
.habit-card strong small{font-size:.42em;color:var(--sample-muted)}
.habit-bar{height:10px;border-radius:999px;background:color-mix(in srgb,var(--sample-text) 11%,transparent);overflow:hidden}
.habit-bar i{display:block;width:var(--progress,0%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--sample-accent),color-mix(in srgb,var(--sample-accent) 40%,#fff));transition:width .18s ease}
.habit-foot{color:var(--sample-accent)}
.habit-card.is-complete{--sample-accent:#22c55e}
.habit-card.is-compact{place-items:center;text-align:center;padding:12px}.habit-card.is-compact .habit-kicker,.habit-card.is-compact .habit-foot{display:none}.habit-card.is-compact .habit-bar{width:100%}
`;

const counterModalHtml = `<main class="modal-card habit-detail">
  <header class="sample-hero">
    <div>
      <span>HABIT TRACKER</span>
      <h1>3 / 4</h1>
      <p>还差 1 次完成今日目标。</p>
    </div>
    <i class="hero-badge">75%</i>
  </header>
  <section class="habit-meter"><b style="width:75%"></b></section>
  <section class="habit-stats">
    <article><span>完成率</span><b>75%</b></article>
    <article><span>累计时长</span><b>75 分钟</b></article>
    <article><span>最后记录</span><b>09:41</b></article>
  </section>
  <section class="inline-fields">
    <label class="inline-field"><span>今日目标</span><input type="number" min="1" value="4"></label>
    <label class="inline-field"><span>单次时长</span><input type="number" min="5" value="25"></label>
  </section>
  <section class="sample-section">
    <div class="section-head"><h2>今日记录</h2><span>可删除任意一条</span></div>
    <div class="habit-records">
      <div class="habit-record-row"><span>09:41</span><b>专注完成</b><button type="button" class="row-danger">删除</button></div>
      <div class="habit-record-row"><span>08:55</span><b>晨间阅读</b><button type="button" class="row-danger">删除</button></div>
    </div>
  </section>
  <section class="sample-section add-record"><div class="section-head"><h2>新增记录</h2><span>保存到本实例</span></div><label class="inline-field"><span>备注</span><input placeholder="例如：阅读 25 分钟"></label><button type="button" class="primary-action">新增记录</button></section>
  <p class="habit-note">点击封面会记录一次进度，并用实例存储保存当天状态。</p>
</main>`;

const counterModalStyles = `${themedModalBaseStyles}
.section-notice{margin:0 0 10px!important;padding:8px 10px;border-radius:12px;border:1px solid color-mix(in srgb,var(--sample-accent) 30%,transparent);background:color-mix(in srgb,var(--sample-accent) 9%,transparent);color:var(--sample-accent)!important;font-size:12px;font-weight:850}
.habit-settings{margin-top:14px}
.habit-records{display:grid;gap:8px}
.habit-record-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px;border-radius:14px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 70%,transparent)}
.habit-record-row span{font-size:12px;font-weight:950;color:var(--sample-accent);font-variant-numeric:tabular-nums}
.habit-record-row b{min-width:0;font-size:13px;line-height:1.25;overflow-wrap:anywhere}
.add-record{display:grid;gap:10px}
.modal-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.primary-action,.secondary-action{height:36px;padding:0 14px;border-radius:12px;border:1px solid var(--sample-line);font-size:13px;font-weight:950;color:var(--sample-text);background:color-mix(in srgb,var(--sample-surface) 80%,transparent)}
.primary-action{border-color:color-mix(in srgb,var(--sample-accent) 44%,transparent);background:var(--sample-accent);color:#fff}
.row-danger{height:32px;padding:0 10px;border-radius:10px;border:1px solid color-mix(in srgb,#ef4444 36%,transparent);font-size:12px;font-weight:950;background:color-mix(in srgb,var(--sample-surface) 78%,transparent);color:#ef4444}
@media(max-width:560px){.habit-record-row{grid-template-columns:1fr}.habit-record-row button{width:max-content}}
`;

const counterSettingsSchema = JSON.stringify({
    type: 'object',
    additionalProperties: true,
    properties: {
        habitTitle: {
            type: 'string',
            title: '习惯名称',
            default: '今日专注',
            maxLength: 24,
        },
    },
}, null, 2);

const fetchCode = `// 网络名片：展示出口 IP、位置和运营商，支持缓存与手动刷新。
const NETWORK_CACHE_KEY = 'network-card-cache-v2';

VoidWidget.define({
  async mount(ctx) {
    const card = document.createElement('button');
    card.className = 'net-card is-loading';
    card.type = 'button';
    card.innerHTML =
      '<div class="net-pulse"></div>' +
      '<div class="net-copy"><span>网络</span><strong>加载中</strong><small>等待请求返回</small></div>';
    ctx.root.appendChild(card);

    const state = {card, loading: false, snapshot: loadingSnapshot(), pins: [], label: '', note: ''};
    this._state = state;
    card.addEventListener('click', () => openDetail(ctx, state));

    try {
      const cached = await ctx.storage.get(NETWORK_CACHE_KEY);
      const normalized = normalizeCache(cached);
      state.snapshot = normalized.snapshot;
      state.pins = normalized.pins;
      state.label = normalized.label;
      state.note = normalized.note;
    } catch (e) {}
    paint(ctx, state);
    await refreshNetwork(ctx, state, false);
  },
  async modalEvent(ctx, event) {
    const state = this._state;
    if (!state) return;
    if (event.name === 'refresh-network') {
      await refreshNetwork(ctx, state, true);
      return;
    }
    if (event.name === 'save-network-note') {
      state.label = readText(event.data, 'label', state.label).slice(0, 36);
      state.note = readText(event.data, 'note', state.note).slice(0, 140);
      await saveNetworkState(ctx, state);
      openDetail(ctx, state, '备注已保存', true, '[data-vt-section="network-note"]');
      return;
    }
    if (event.name === 'pin-network') {
      state.pins = [createPin(state), ...state.pins].slice(0, 8);
      await saveNetworkState(ctx, state);
      openDetail(ctx, state, '已收藏当前网络快照', true, '[data-vt-section="network-pins"]');
      return;
    }
    if (event.name === 'delete-network-pin') {
      const id = event.source && event.source.dataset ? String(event.source.dataset.id || '') : '';
      state.pins = state.pins.filter((pin) => pin.id !== id);
      await saveNetworkState(ctx, state);
      openDetail(ctx, state, '已删除该快照', true, '[data-vt-section="network-pins"]');
    }
  },
});

function loadingSnapshot() {
  return {
    ok: false,
    ip: '加载中',
    place: '网络',
    isp: '正在请求网络信息',
    timezone: '',
    country: '',
    countryCode: '',
    continent: '',
    organization: '',
    asn: '',
    coordinate: '',
    updatedAt: '',
    error: '',
  };
}

function normalizeSnapshot(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ok: source.ok === true,
    ip: String(source.ip || '未知 IP'),
    place: String(source.place || '未知位置'),
    isp: String(source.isp || '未知运营商'),
    timezone: String(source.timezone || ''),
    country: String(source.country || ''),
    countryCode: String(source.countryCode || ''),
    continent: String(source.continent || ''),
    organization: String(source.organization || ''),
    asn: String(source.asn || ''),
    coordinate: String(source.coordinate || ''),
    updatedAt: String(source.updatedAt || ''),
    error: String(source.error || ''),
  };
}

function normalizePin(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(source.id || ('pin-' + Date.now())),
    ip: String(source.ip || '未知 IP'),
    place: String(source.place || '未知位置'),
    isp: String(source.isp || '未知运营商'),
    at: String(source.at || new Date().toISOString()),
  };
}

function normalizeCache(raw) {
  if (raw && raw.ip) {
    return {snapshot: normalizeSnapshot(raw), pins: [], label: '', note: ''};
  }
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    snapshot: source.snapshot ? normalizeSnapshot(source.snapshot) : loadingSnapshot(),
    pins: Array.isArray(source.pins) ? source.pins.map(normalizePin).slice(0, 8) : [],
    label: String(source.label || '').slice(0, 36),
    note: String(source.note || '').slice(0, 140),
  };
}

function readText(data, key, fallback) {
  const value = data && data[key];
  return String(Array.isArray(value) ? value[0] : value || fallback || '').trim();
}

function createPin(state) {
  return normalizePin({
    id: 'pin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    ip: state.snapshot.ip,
    place: state.snapshot.place,
    isp: state.snapshot.isp,
    at: new Date().toISOString(),
  });
}

async function saveNetworkState(ctx, state) {
  try {
    await ctx.storage.set(NETWORK_CACHE_KEY, {
      snapshot: state.snapshot,
      pins: state.pins.slice(0, 8),
      label: state.label,
      note: state.note,
    });
  } catch (e) {}
}

function paint(ctx, state) {
  const snapshot = state.snapshot;
  const placement = ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
  state.card.className = 'net-card ' + (state.loading ? 'is-loading' : snapshot.ok ? 'is-ok' : 'is-bad') + (placement.w <= 1 || placement.h <= 1 ? ' is-compact' : '');
  state.card.querySelector('strong').textContent = state.loading && !snapshot.ok ? '刷新中' : snapshot.ip;
  state.card.querySelector('span').textContent = snapshot.place;
  state.card.querySelector('small').textContent = state.loading ? '正在更新网络信息' : snapshot.isp;
}

async function refreshNetwork(ctx, state, showModal) {
  state.loading = true;
  paint(ctx, state);
  try {
    const res = await ctx.network.fetch('https://api.ip.sb/geoip');
    const data = JSON.parse(res.body || '{}');
    state.snapshot = normalizeSnapshot({
      ok: true,
      ip: data.ip || '未知 IP',
      place: [data.city, data.country].filter(Boolean).join(' / ') || '当前位置',
      isp: data.isp || data.organization || data.asn_organization || 'api.ip.sb',
      timezone: data.timezone || '',
      country: data.country || '',
      countryCode: data.country_code || '',
      continent: data.continent_code || '',
      organization: data.organization || data.asn_organization || '',
      asn: data.asn_organization || '',
      coordinate: [data.latitude, data.longitude].filter((item) => item !== undefined && item !== null).join(', '),
      updatedAt: new Date().toISOString(),
      error: '',
    });
    await saveNetworkState(ctx, state);
  } catch (e) {
    state.snapshot = normalizeSnapshot({
      ...state.snapshot,
      ok: false,
      ip: state.snapshot.ip === '加载中' ? '请求失败' : state.snapshot.ip,
      place: state.snapshot.place || '网络',
      isp: state.snapshot.isp || '网络请求失败',
      error: (e && e.message) || String(e),
      updatedAt: state.snapshot.updatedAt || new Date().toISOString(),
    });
  } finally {
    state.loading = false;
    paint(ctx, state);
    if (showModal) openDetail(ctx, state, state.snapshot.ok ? '网络信息已刷新' : '刷新失败，保留当前缓存', true, '[data-vt-section="network-summary"]');
  }
}

function buildNetworkPins(state) {
  const esc = VoidTabDesigner.escapeHtml;
  const pins = Array.isArray(state.pins) ? state.pins.slice(0, 8) : [];
  if (!pins.length) return '<p class="console-empty">还没有收藏网络快照。</p>';
  return pins.map((pin) => {
    const at = pin.at ? new Date(pin.at).toLocaleString('zh-CN', {hour12: false}) : '';
    return '<div class="network-pin-row"><div><b>' + esc(pin.ip) + '</b><span>' + esc(pin.place) + ' · ' + esc(pin.isp) + '</span><small>' + esc(at) + '</small></div><button type="button" class="row-danger" data-vt-action="delete-network-pin" data-id="' + esc(pin.id) + '">删除</button></div>';
  }).join('');
}

function openDetail(ctx, state, notice, updateOnly, scrollTarget) {
  const snapshot = state.snapshot;
  const esc = VoidTabDesigner.escapeHtml;
  const status = snapshot.ok ? '已连接' : (snapshot.error || '需要授权或网络不可用');
  const updated = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString('zh-CN', {hour12: false}) : '尚未刷新';
  const fields = [
    ['IP 地址', snapshot.ip],
    ['位置', snapshot.place],
    ['国家 / 地区', [snapshot.country, snapshot.countryCode].filter(Boolean).join(' / ') || '未知'],
    ['运营商', snapshot.isp],
    ['组织', snapshot.organization || snapshot.asn || '未知'],
    ['时区', snapshot.timezone || '未知'],
    ['坐标', snapshot.coordinate || '未知'],
    ['更新时间', updated]
  ].map((item) => '<div class="field-row"><span>' + esc(item[0]) + '</span><b>' + esc(item[1]) + '</b></div>').join('');
  const pins = buildNetworkPins(state);
  const html =
    '<main class="modal-card net-detail">' +
      '<header class="sample-hero"><div><span>网络名片</span><h1>' + esc(snapshot.ip) + '</h1><p>' + esc(status) + '</p></div><i class="hero-badge">' + (snapshot.ok ? 'ONLINE' : 'CACHE') + '</i></header>' +
      '<section class="net-grid">' +
        '<article><span>位置</span><b>' + esc(snapshot.place) + '</b></article>' +
        '<article><span>运营商</span><b>' + esc(snapshot.isp) + '</b></article>' +
        '<article><span>时区</span><b>' + esc(snapshot.timezone || '未知') + '</b></article>' +
      '</section>' +
      '<section class="sample-section" data-vt-section="network-summary"><div class="section-head"><h2>连接字段</h2><span>结构化展示</span></div>' + (notice ? '<p class="section-notice">' + esc(notice) + '</p>' : '') + '<div class="field-list">' + fields + '</div><div class="tag-row"><span>' + esc(snapshot.countryCode || 'N/A') + '</span><span>' + esc(snapshot.continent || 'N/A') + '</span><span>' + esc(snapshot.ok ? '已刷新' : '缓存/失败') + '</span></div></section>' +
      '<form class="network-note-form" data-vt-action="save-network-note"><section class="sample-section" data-vt-section="network-note"><div class="section-head"><h2>备注</h2><span>保存到本实例</span></div><section class="inline-fields"><label class="inline-field"><span>标签</span><input name="label" value="' + esc(state.label) + '" placeholder="家里 / 公司 / 热点"></label><label class="inline-field"><span>说明</span><input name="note" value="' + esc(state.note) + '" placeholder="补充说明"></label></section></section><div class="modal-actions"><button type="submit" class="primary-action" data-vt-action="save-network-note">保存备注</button><button type="button" class="secondary-action" data-vt-action="pin-network">收藏当前快照</button><button type="button" class="secondary-action" data-vt-action="refresh-network">刷新网络信息</button></div></form>' +
      '<section class="sample-section" data-vt-section="network-pins"><div class="section-head"><h2>已收藏快照</h2><span>可删除</span></div><div class="network-pins">' + pins + '</div></section>' +
    '</main>';
  const payload = {title: '网络名片', html: html, scrollTarget: scrollTarget || ''};
  return updateOnly ? VoidTabDesigner.updateModal(ctx, payload) : VoidTabDesigner.openModal(ctx, payload);
}`;

const fetchStyles = `${themedCoverBaseStyles}
.net-card{
  padding:14px 16px;border:0;
  display:grid;grid-template-columns:auto 1fr;align-items:center;gap:14px;text-align:left;
}
.net-pulse{width:44px;height:44px;border-radius:16px;background:var(--sample-accent);box-shadow:0 0 0 8px color-mix(in srgb,var(--sample-accent) 16%,transparent),0 12px 24px color-mix(in srgb,var(--sample-accent) 20%,transparent)}
.net-copy{min-width:0;display:grid;gap:3px}
.net-copy span{font-size:11px;font-weight:900;color:var(--sample-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.net-copy strong{font-size:clamp(16px,7cqw,26px);line-height:1.05;font-weight:950;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.net-copy small{font-size:11px;line-height:1.25;color:var(--sample-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.net-card.is-bad{--sample-accent:#ef4444}
.net-card.is-loading{--sample-accent:#0ea5e9}
.net-card.is-loading .net-pulse{animation:netPulse 1.3s ease-in-out infinite}
.net-card.is-compact{place-items:center;grid-template-columns:1fr;text-align:center;padding:12px}.net-card.is-compact .net-pulse{width:38px;height:38px}.net-card.is-compact small{display:none}
@keyframes netPulse{0%,100%{transform:scale(1);opacity:.78}50%{transform:scale(1.08);opacity:1}}
}`;

const fetchModalHtml = `<main class="modal-card net-detail">
  <header class="sample-hero">
    <div>
      <span>NETWORK CARD</span>
      <h1>203.0.113.42</h1>
      <p>已连接 · 请求返回后会展示真实 IP 和位置。</p>
    </div>
    <i class="hero-badge">ONLINE</i>
  </header>
  <section class="net-grid">
    <article><span>位置</span><b>Shanghai / CN</b></article>
    <article><span>运营商</span><b>Example ISP</b></article>
    <article><span>时区</span><b>Asia/Shanghai</b></article>
  </section>
  <section class="sample-section">
    <div class="section-head"><h2>连接字段</h2><span>结构化展示</span></div>
    <div class="field-list">
      <div class="field-row"><span>IP 地址</span><b>203.0.113.42</b></div>
      <div class="field-row"><span>位置</span><b>Shanghai / CN</b></div>
      <div class="field-row"><span>运营商</span><b>Example ISP</b></div>
      <div class="field-row"><span>组织</span><b>Example Network</b></div>
    </div>
    <div class="tag-row"><span>CN</span><span>AS</span><span>授权成功</span></div>
  </section>
  <section class="sample-section"><div class="section-head"><h2>备注</h2><span>保存到本实例</span></div><section class="inline-fields"><label class="inline-field"><span>标签</span><input value="公司网络"></label><label class="inline-field"><span>说明</span><input value="办公 Wi-Fi"></label></section></section>
  <div class="modal-actions"><button type="button" class="primary-action">保存备注</button><button type="button" class="secondary-action">收藏当前快照</button><button type="button" class="secondary-action">刷新网络信息</button></div>
  <section class="sample-section"><div class="section-head"><h2>已收藏快照</h2><span>可删除</span></div><div class="network-pins"><div class="network-pin-row"><div><b>203.0.113.42</b><span>Shanghai / CN · Example ISP</span><small>2026/6/27 09:41:00</small></div><button type="button" class="row-danger">删除</button></div></div></section>
</main>`;

const fetchModalStyles = `${themedModalBaseStyles}
.section-notice{margin:0 0 10px!important;padding:8px 10px;border-radius:12px;border:1px solid color-mix(in srgb,var(--sample-accent) 30%,transparent);background:color-mix(in srgb,var(--sample-accent) 9%,transparent);color:var(--sample-accent)!important;font-size:12px;font-weight:850}
.modal-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.primary-action,.secondary-action{height:36px;padding:0 14px;border-radius:12px;border:1px solid var(--sample-line);font-size:13px;font-weight:950;color:var(--sample-text);background:color-mix(in srgb,var(--sample-surface) 80%,transparent)}
.primary-action{border-color:color-mix(in srgb,var(--sample-accent) 44%,transparent);background:var(--sample-accent);color:#fff}
.network-note-form{margin-top:14px}
.network-pins{display:grid;gap:8px}
.network-pin-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border-radius:14px;border:1px solid var(--sample-line);background:color-mix(in srgb,var(--sample-surface) 70%,transparent)}
.network-pin-row div{min-width:0;display:grid;gap:2px}
.network-pin-row b{font-size:14px;line-height:1.2;overflow-wrap:anywhere}
.network-pin-row span,.network-pin-row small{font-size:11px;color:var(--sample-muted);overflow-wrap:anywhere}
.row-danger{height:32px;padding:0 10px;border-radius:10px;border:1px solid color-mix(in srgb,#ef4444 36%,transparent);font-size:12px;font-weight:950;background:color-mix(in srgb,var(--sample-surface) 78%,transparent);color:#ef4444}
@media(max-width:560px){.network-pin-row{grid-template-columns:1fr}.network-pin-row button{width:max-content}}
`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'clock',
        label: '时间看板',
        description: '时间、日期、闹钟与今日计划，适合放在桌面第一屏。',
        draft: () => ({
            id: `my.clock-${Math.random().toString(36).slice(2, 6)}`,
            label: '时间看板',
            description: '查看时间日期，维护闹钟和今日计划。',
            icon: 'Clock',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 4, h: 3}},
            permissions: ['storage', 'notifications'],
            networkHosts: [],
            entryCode: clockCode,
            styles: clockStyles,
            modalHtml: clockModalHtml,
            modalStyles: clockModalStyles,
            modalWidth: '820px',
            modalHeight: '680px',
            html: '',
            settingsSchemaText: clockSettingsSchema,
        }),
    },
    {
        id: 'counter',
        label: '习惯进度',
        description: '点击记录今日进度，并写入实例存储。',
        draft: () => ({
            id: `my.counter-${Math.random().toString(36).slice(2, 6)}`,
            label: '习惯进度',
            description: '记录每日专注次数。',
            icon: 'Cursor',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 4, h: 3}},
            permissions: ['storage'],
            networkHosts: [],
            entryCode: counterCode,
            styles: counterStyles,
            modalHtml: counterModalHtml,
            modalStyles: counterModalStyles,
            modalWidth: '760px',
            modalHeight: '640px',
            html: '',
            settingsSchemaText: counterSettingsSchema,
        }),
    },
    {
        id: 'fetch',
        label: '网络名片',
        description: '展示出口 IP、位置和运营商，带缓存与手动刷新。',
        draft: () => ({
            id: `my.ipinfo-${Math.random().toString(36).slice(2, 6)}`,
            label: '网络名片',
            description: '展示当前出口 IP、位置和运营商。',
            icon: 'Globe',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 6, h: 3}},
            permissions: ['storage', 'network'],
            networkHosts: ['api.ip.sb'],
            entryCode: fetchCode,
            styles: fetchStyles,
            modalHtml: fetchModalHtml,
            modalStyles: fetchModalStyles,
            modalWidth: '820px',
            modalHeight: '620px',
            html: '',
            settingsSchemaText: '',
        }),
    },
];
