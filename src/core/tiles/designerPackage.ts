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
        permissions: [],
        networkHosts: [],
        entryCode: starter.entryCode,
        styles: starter.styles,
        modalHtml: starter.modalHtml,
        modalStyles: starter.modalStyles,
        modalWidth: starter.modalWidth,
        modalHeight: starter.modalHeight,
        html: '',
        settingsSchemaText: '',
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

const clockCode = `// 时间看板：封面展示当前时间，点击时生成实时详情弹窗。
VoidWidget.define({
  mount(ctx) {
    const root = document.createElement('button');
    root.className = 'focus-clock';
    root.type = 'button';
    root.innerHTML =
      '<div class="clock-top"><span></span><i></i></div>' +
      '<div class="clock-time"></div>' +
      '<div class="clock-date"></div>' +
      '<div class="clock-band"><span></span><b><i></i></b></div>' +
      '<div class="clock-hint"></div>';
    ctx.root.appendChild(root);

    const timeEl = root.querySelector('.clock-time');
    const dateEl = root.querySelector('.clock-date');
    const phaseEl = root.querySelector('.clock-top span');
    const hintEl = root.querySelector('.clock-hint');
    const progressTextEl = root.querySelector('.clock-band span');
    const progressBarEl = root.querySelector('.clock-band i');

    const render = () => {
      const now = new Date();
      const placement = getPlacement(ctx);
      const phase = getPhase(now, ctx);
      const compact = placement.w <= 1 || placement.h <= 1;
      const wide = placement.w >= 3;
      root.classList.toggle('is-compact', compact);
      root.classList.toggle('is-wide', wide);

      timeEl.textContent = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
      dateEl.textContent = now.toLocaleDateString('zh-CN', {weekday: 'long', month: 'short', day: 'numeric'});
      phaseEl.textContent = compact ? '现在' : phase.name;
      hintEl.textContent = phase.tip;
      const progress = dayProgress(now);
      progressTextEl.textContent = '今日 ' + progress + '%';
      progressBarEl.style.width = progress + '%';
    };

    root.addEventListener('click', () => openDetail(ctx));
    render();

    this._timer = setInterval(render, 1000);
    this._render = render;
  },
  pause() {
    clearInterval(this._timer);
    this._timer = null;
  },
  resume() {
    if (!this._render || this._timer) return;
    this._render();
    this._timer = setInterval(this._render, 1000);
  },
  unmount() { clearInterval(this._timer); },
});

function getPlacement(ctx) {
  return ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
}

function dayProgress(now) {
  return Math.round((now.getHours() * 60 + now.getMinutes()) / 1440 * 100);
}

function weekProgress(now) {
  const day = now.getDay() || 7;
  return Math.min(100, Math.round(((day - 1) * 1440 + now.getHours() * 60 + now.getMinutes()) / (7 * 1440) * 100));
}

function getTextSetting(ctx, key, fallback) {
  const value = ctx.settings && typeof ctx.settings[key] === 'string' ? ctx.settings[key].trim() : '';
  return value || fallback;
}

function getPanelTitle(ctx) {
  return getTextSetting(ctx, 'panelTitle', '时间看板');
}

function defaultTimeline() {
  return [
    {time: '06:00', title: '启动', detail: '计划与轻量整理'},
    {time: '09:00', title: '专注', detail: '核心任务窗口'},
    {time: '12:00', title: '调整', detail: '午间恢复'},
    {time: '14:00', title: '推进', detail: '协作与处理'},
    {time: '18:00', title: '收尾', detail: '复盘与清理'},
    {time: '22:00', title: '休息', detail: '降低刺激'}
  ];
}

function parseTimelineText(value) {
  const text = typeof value === 'string' ? value : '';
  const rows = text.split(/\\n+/).map((line) => line.trim()).filter(Boolean);
  const items = rows.map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    return {
      time: /^\\d{1,2}:\\d{2}$/.test(parts[0] || '') ? parts[0] : '',
      title: parts[1] || '',
      detail: parts[2] || ''
    };
  }).filter((item) => item.time && item.title);
  return items.length ? items : defaultTimeline();
}

function getTimelineItems(ctx) {
  return parseTimelineText(ctx.settings ? ctx.settings.timelineText : '');
}

function hourOf(time) {
  const match = String(time || '').match(/^(\\d{1,2}):/);
  return match ? Math.max(0, Math.min(24, Number(match[1]) || 0)) : 0;
}

function getPhase(now, ctx) {
  const hour = now.getHours();
  const items = getTimelineItems(ctx);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const next = items[index + 1] ? hourOf(items[index + 1].time) : 24;
    if (hour >= hourOf(item.time) && hour < next) return {name: item.title, tip: item.detail || getPanelTitle(ctx)};
  }
  const first = items[0] || {title: getPanelTitle(ctx), detail: '当前状态'};
  return {name: first.title, tip: first.detail || '当前状态'};
}

function buildTimeline(now, ctx) {
  const hour = now.getHours();
  const items = getTimelineItems(ctx);
  const esc = VoidTabDesigner.escapeHtml;
  return items.map((item, index) => {
    const next = items[index + 1] ? hourOf(items[index + 1].time) : 24;
    const active = hour >= hourOf(item.time) && hour < next;
    return '<label class="edit-row ' + (active ? 'is-active' : '') + '">' +
      '<span class="row-time">' + esc(item.time) + '</span>' +
      '<input value="' + esc(item.title) + '" aria-label="' + esc(item.time) + ' 阶段名称">' +
      '<input value="' + esc(item.detail) + '" aria-label="' + esc(item.time) + ' 阶段说明">' +
    '</label>';
  }).join('');
}

function openDetail(ctx) {
  const now = new Date();
  const phase = getPhase(now, ctx);
  const placement = getPlacement(ctx);
  const esc = VoidTabDesigner.escapeHtml;
  const title = getPanelTitle(ctx);
  const reminder = getTextSetting(ctx, 'reminderLabel', '桌面卡片');
  const note = getTextSetting(ctx, 'note', '这里可以填写今日计划、会议提醒或快捷记录。');
  const time = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const date = now.toLocaleDateString('zh-CN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
  const html =
    '<main class="modal-card time-detail">' +
      '<header class="sample-hero time-hero"><div><span>' + esc(title) + '</span><h1>' + esc(time) + '</h1><p>' + esc(date) + '</p></div><i class="hero-badge">' + placement.w + '×' + placement.h + '</i></header>' +
      '<section class="status-strip time-state"><div><b>' + esc(phase.name) + '</b><span>' + esc(phase.tip) + '</span></div><i class="hero-badge">实时</i></section>' +
      '<section class="metric-grid">' +
        '<article><span>今日进度</span><b>' + dayProgress(now) + '%</b><em><i style="width:' + dayProgress(now) + '%"></i></em></article>' +
        '<article><span>本周进度</span><b>' + weekProgress(now) + '%</b><em><i style="width:' + weekProgress(now) + '%"></i></em></article>' +
      '</section>' +
      '<section class="sample-section"><div class="section-head"><h2>今日节奏</h2><span>来自实例设置</span></div><div class="editable-list">' + buildTimeline(now, ctx) + '</div></section>' +
      '<section class="inline-fields"><label class="inline-field"><span>本日主题</span><input value="' + esc(phase.name) + '"></label><label class="inline-field"><span>提醒方式</span><input value="' + esc(reminder) + '"></label></section>' +
      '<label class="inline-field"><span>备注</span><textarea>' + esc(note) + '</textarea></label>' +
    '</main>';
  VoidTabDesigner.openModal(ctx, {title: title, html: html});
}`;

const clockStyles = `${themedCoverBaseStyles}
.focus-clock{
  padding:18px;border:0;
  display:flex;flex-direction:column;justify-content:space-between;gap:10px;
}
.clock-top,.clock-band{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:850;color:var(--sample-muted)}
.clock-top i{width:9px;height:9px;border-radius:999px;background:var(--sample-accent);box-shadow:0 0 0 5px color-mix(in srgb,var(--sample-accent) 18%,transparent)}
.clock-time{font-size:clamp(34px,18cqw,76px);line-height:.95;font-weight:950;letter-spacing:0;font-variant-numeric:tabular-nums}
.clock-date{font-size:clamp(12px,5cqw,18px);font-weight:800;color:var(--sample-muted)}
.clock-band{gap:8px}
.clock-band b{height:7px;flex:1;border-radius:999px;background:color-mix(in srgb,var(--sample-text) 11%,transparent);overflow:hidden}
.clock-band i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--sample-accent),color-mix(in srgb,var(--sample-accent) 36%,#fff));transition:width .2s ease}
.clock-hint{font-size:11px;line-height:1.25;font-weight:800;color:var(--sample-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.focus-clock.is-compact{align-items:center;justify-content:center;text-align:center;padding:12px}
.focus-clock.is-compact .clock-top,.focus-clock.is-compact .clock-date,.focus-clock.is-compact .clock-hint{display:none}
.focus-clock.is-compact .clock-band{width:100%}
.focus-clock.is-wide .clock-time{font-size:clamp(40px,15cqw,88px)}
}`;

const clockModalHtml = `<main class="modal-card time-detail">
  <header class="sample-hero time-hero">
    <div>
      <span>TIME BOARD</span>
      <h1>09:41:26</h1>
      <p>6月27日 星期六 · 桌面尺寸 2×2</p>
    </div>
    <i class="hero-badge">2×2</i>
  </header>
  <section class="status-strip time-state">
    <div><b>深度工作</b><span>处理最重要的任务，保持输入克制。</span></div>
    <i class="hero-badge">实时</i>
  </section>
  <section class="metric-grid">
    <article><span>今日进度</span><b>41%</b><em><i style="width:41%"></i></em></article>
    <article><span>本周进度</span><b>72%</b><em><i style="width:72%"></i></em></article>
  </section>
  <section class="sample-section">
    <div class="section-head"><h2>今日节奏</h2><span>可编辑列表</span></div>
    <div class="editable-list">
      <label class="edit-row is-active"><span class="row-time">09:00</span><input value="专注"><input value="核心任务窗口"></label>
      <label class="edit-row"><span class="row-time">14:00</span><input value="推进"><input value="协作与处理"></label>
      <label class="edit-row"><span class="row-time">18:00</span><input value="收尾"><input value="复盘与清理"></label>
    </div>
  </section>
  <section class="inline-fields">
    <label class="inline-field"><span>本日主题</span><input value="深度工作"></label>
    <label class="inline-field"><span>提醒方式</span><input value="桌面卡片"></label>
  </section>
  <label class="inline-field"><span>备注</span><textarea>这里可以填写今日计划、会议提醒或快捷记录。</textarea></label>
</main>`;

const clockModalStyles = themedModalBaseStyles;

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
        reminderLabel: {
            type: 'string',
            title: '提醒方式',
            default: '桌面卡片',
            maxLength: 24,
        },
        note: {
            type: 'string',
            title: '备注',
            default: '这里可以填写今日计划、会议提醒或快捷记录。',
            maxLength: 180,
        },
        timelineText: {
            type: 'string',
            title: '今日节奏',
            description: '每行一项：时间|标题|说明',
            default: [
                '06:00|启动|计划与轻量整理',
                '09:00|专注|核心任务窗口',
                '12:00|调整|午间恢复',
                '14:00|推进|协作与处理',
                '18:00|收尾|复盘与清理',
                '22:00|休息|降低刺激',
            ].join('\n'),
            maxLength: 600,
        },
    },
}, null, 2);

const counterCode = `// 习惯进度：封面点击记录一次，并弹出当天进度详情。
VoidWidget.define({
  async mount(ctx) {
    const button = document.createElement('button');
    button.className = 'habit-card';
    button.type = 'button';
    ctx.root.appendChild(button);

    const target = 4;
    const focusMinutes = 25;
    let count = 0;
    let updatedAt = '';

    try {
      const savedDay = await ctx.storage.get('focus-day');
      if (savedDay === todayKey()) {
        count = Number(await ctx.storage.get('focus-count')) || 0;
        updatedAt = String(await ctx.storage.get('focus-updated-at') || '');
      }
    } catch (e) {}

    const paint = () => {
      const done = Math.min(count, target);
      const percent = Math.round(done / target * 100);
      const placement = ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
      button.classList.toggle('is-compact', placement.w <= 1 || placement.h <= 1);
      button.style.setProperty('--progress', percent + '%');
      button.innerHTML =
        '<span class="habit-kicker">今日专注</span>' +
        '<strong>' + done + '/' + target + '</strong>' +
        '<span class="habit-bar"><i></i></span>' +
        '<span class="habit-foot">' + (done >= target ? '目标完成' : '点击记录一次') + '</span>';
    };
    paint();

    button.addEventListener('click', async () => {
      count = Math.min(target, count + 1);
      updatedAt = new Date().toISOString();
      paint();
      try {
        await ctx.storage.set('focus-day', todayKey());
        await ctx.storage.set('focus-count', count);
        await ctx.storage.set('focus-updated-at', updatedAt);
      } catch (e) {}
      openDetail(ctx, count, target, focusMinutes, updatedAt);
    });
  },
});

function todayKey() {
  return new Date().toLocaleDateString('zh-CN');
}

function openDetail(ctx, count, target, focusMinutes, updatedAt) {
  const done = Math.min(count, target);
  const percent = Math.round(done / target * 100);
  const remaining = Math.max(0, target - done);
  const esc = VoidTabDesigner.escapeHtml;
  const updatedText = updatedAt ? new Date(updatedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '尚未记录';
  const html =
    '<main class="modal-card habit-detail">' +
      '<header class="sample-hero"><div><span>HABIT TRACKER</span><h1>' + done + ' / ' + target + '</h1><p>' + (remaining ? '还差 ' + remaining + ' 次完成今日目标' : '今日目标已经完成') + '</p></div><i class="hero-badge">' + percent + '%</i></header>' +
      '<section class="habit-meter"><b style="width:' + percent + '%"></b></section>' +
      '<section class="habit-stats">' +
        '<article><span>完成率</span><b>' + percent + '%</b></article>' +
        '<article><span>累计时长</span><b>' + (done * focusMinutes) + ' 分钟</b></article>' +
        '<article><span>最后记录</span><b>' + esc(updatedText) + '</b></article>' +
      '</section>' +
      '<section class="inline-fields"><label class="inline-field"><span>今日目标</span><input type="number" min="1" value="' + target + '"></label><label class="inline-field"><span>单次时长</span><input type="number" min="5" value="' + focusMinutes + '"></label></section>' +
      '<section class="sample-section"><div class="section-head"><h2>记录项</h2><span>常规列表</span></div><div class="editable-list">' +
        '<label class="edit-row is-active"><span class="row-time">现在</span><input value="专注完成"><input value="点击封面自动记录一次"></label>' +
        '<label class="edit-row"><span class="row-time">下一步</span><input value="继续专注"><input value="可以把这里改成自己的任务"></label>' +
      '</div></section>' +
      '<p class="habit-note">这是功能型示例：封面负责记录和摘要，弹窗根据存储状态生成详情。</p>' +
    '</main>';
  VoidTabDesigner.openModal(ctx, {title: '习惯进度', html: html});
}`;

const counterStyles = `${themedCoverBaseStyles}
.habit-card{
  padding:16px;border:0;
  display:grid;grid-template-rows:auto 1fr auto auto;gap:9px;
}
.habit-kicker,.habit-foot{font-size:11px;font-weight:900;color:var(--sample-muted)}
.habit-card strong{align-self:end;font-size:clamp(32px,18cqw,68px);line-height:.92;font-weight:950;letter-spacing:0;font-variant-numeric:tabular-nums}
.habit-bar{height:10px;border-radius:999px;background:color-mix(in srgb,var(--sample-text) 11%,transparent);overflow:hidden}
.habit-bar i{display:block;width:var(--progress,0%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--sample-accent),color-mix(in srgb,var(--sample-accent) 40%,#fff));transition:width .18s ease}
.habit-foot{color:var(--sample-accent)}
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
    <div class="section-head"><h2>记录项</h2><span>常规列表</span></div>
    <div class="editable-list">
      <label class="edit-row is-active"><span class="row-time">现在</span><input value="专注完成"><input value="点击封面自动记录一次"></label>
      <label class="edit-row"><span class="row-time">下一步</span><input value="继续专注"><input value="可以把这里改成自己的任务"></label>
    </div>
  </section>
  <p class="habit-note">点击封面会记录一次进度，并用实例存储保存当天状态。</p>
</main>`;

const counterModalStyles = themedModalBaseStyles;

const fetchCode = `// 网络名片：拉取 IP 信息，点击封面查看完整网络详情。
VoidWidget.define({
  async mount(ctx) {
    const card = document.createElement('button');
    card.className = 'net-card is-loading';
    card.type = 'button';
    card.innerHTML =
      '<div class="net-pulse"></div>' +
      '<div class="net-copy"><span>网络</span><strong>加载中</strong><small>等待授权或请求返回</small></div>';
    ctx.root.appendChild(card);

    let snapshot = {
      ok: false,
      ip: '加载中',
      place: '网络',
      isp: '等待授权或请求返回',
      timezone: '',
      country: '',
      countryCode: '',
      continent: '',
      organization: '',
      asn: '',
      coordinate: ''
    };

    const paint = () => {
      const placement = ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
      card.className = 'net-card ' + (snapshot.ok ? 'is-ok' : 'is-bad') + (placement.w <= 1 || placement.h <= 1 ? ' is-compact' : '');
      card.querySelector('strong').textContent = snapshot.ip;
      card.querySelector('span').textContent = snapshot.place;
      card.querySelector('small').textContent = snapshot.isp;
    };

    card.addEventListener('click', () => openDetail(ctx, snapshot));

    try {
      const res = await ctx.network.fetch('https://api.ip.sb/geoip');
      const data = JSON.parse(res.body);
      snapshot = {
        ok: true,
        ip: data.ip || '未知 IP',
        place: [data.city, data.country].filter(Boolean).join(' / ') || '当前位置',
        isp: data.isp || data.organization || 'api.ip.sb',
        timezone: data.timezone || '',
        country: data.country || '',
        countryCode: data.country_code || '',
        continent: data.continent_code || '',
        organization: data.organization || data.asn_organization || '',
        asn: data.asn_organization || '',
        coordinate: [data.latitude, data.longitude].filter((item) => item !== undefined && item !== null).join(', ')
      };
    } catch (e) {
      snapshot = {
        ok: false,
        ip: '请求失败',
        place: '网络',
        isp: (e && e.message) || String(e),
        timezone: '',
        country: '',
        countryCode: '',
        continent: '',
        organization: '',
        asn: '',
        coordinate: ''
      };
    }
    paint();
  },
});

function openDetail(ctx, snapshot) {
  const esc = VoidTabDesigner.escapeHtml;
  const status = snapshot.ok ? '已连接' : '需要授权或网络不可用';
  const fields = [
    ['IP 地址', snapshot.ip],
    ['位置', snapshot.place],
    ['国家 / 地区', [snapshot.country, snapshot.countryCode].filter(Boolean).join(' / ') || '未知'],
    ['运营商', snapshot.isp],
    ['组织', snapshot.organization || snapshot.asn || '未知'],
    ['时区', snapshot.timezone || '未知'],
    ['坐标', snapshot.coordinate || '未知']
  ].map((item) => '<div class="field-row"><span>' + esc(item[0]) + '</span><b>' + esc(item[1]) + '</b></div>').join('');
  const html =
    '<main class="modal-card net-detail">' +
      '<header class="sample-hero"><div><span>NETWORK CARD</span><h1>' + esc(snapshot.ip) + '</h1><p>' + esc(status) + '</p></div><i class="hero-badge">' + (snapshot.ok ? 'ONLINE' : 'ERROR') + '</i></header>' +
      '<section class="net-grid">' +
        '<article><span>位置</span><b>' + esc(snapshot.place) + '</b></article>' +
        '<article><span>运营商</span><b>' + esc(snapshot.isp) + '</b></article>' +
        '<article><span>时区</span><b>' + esc(snapshot.timezone || '未知') + '</b></article>' +
      '</section>' +
      '<section class="sample-section"><div class="section-head"><h2>连接字段</h2><span>结构化展示</span></div><div class="field-list">' + fields + '</div><div class="tag-row"><span>' + esc(snapshot.countryCode || 'N/A') + '</span><span>' + esc(snapshot.continent || 'N/A') + '</span><span>' + esc(snapshot.ok ? '授权成功' : '待授权') + '</span></div></section>' +
    '</main>';
  VoidTabDesigner.openModal(ctx, {title: '网络名片', html: html});
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
.net-card.is-compact{place-items:center;grid-template-columns:1fr;text-align:center;padding:12px}.net-card.is-compact .net-pulse{width:38px;height:38px}.net-card.is-compact small{display:none}
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
</main>`;

const fetchModalStyles = themedModalBaseStyles;

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'clock',
        label: '时间看板',
        description: '日期、时间与轻量状态展示，适合放在桌面第一屏。',
        draft: () => ({
            id: `my.clock-${Math.random().toString(36).slice(2, 6)}`,
            label: '时间看板',
            description: '带日期和节奏提示的桌面时间卡。',
            icon: 'Clock',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 4, h: 3}},
            permissions: [],
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
            settingsSchemaText: '',
        }),
    },
    {
        id: 'fetch',
        label: '网络名片',
        description: '拉取当前出口 IP 与位置，展示 network 能力用法。',
        draft: () => ({
            id: `my.ipinfo-${Math.random().toString(36).slice(2, 6)}`,
            label: '网络名片',
            description: '展示当前出口 IP、位置和运营商。',
            icon: 'Globe',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 6, h: 3}},
            permissions: ['network'],
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
