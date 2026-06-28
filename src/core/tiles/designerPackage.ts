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
// AI assist — build prompts for an external/in-app model and map the model's
// JSON reply back onto an editable draft. Kept here (not in the Vue panel) so
// the prompt contract and the parser stay testable and in sync with the draft.
// ---------------------------------------------------------------------------

/** The fixed runtime contract a generated widget must follow. Shown verbatim to the model. */
export const DESIGNER_AI_SYSTEM_PROMPT = `你是 VoidTab「组件设计器」的代码生成助手。VoidTab 的自定义组件运行在隔离的 iframe 沙箱里，使用固定的 VoidWidget 运行时 API。请根据用户描述生成一个完整、可直接运行、弹窗可正常交互的组件，并以严格 JSON 返回。

══════ 最重要（弹窗交互，违反必然无法交互）══════
A. 弹窗 HTML 里【绝对不能】写任何 JavaScript：禁止 <script>、onclick、oninput、onsubmit、href="javascript:" 等。这些会被 CSP 拦截、静默失效，是「弹窗点了没反应」的头号原因。
B. 弹窗与封面交互的【唯一】方式：在弹窗 HTML 的可点击元素上加属性 data-vt-action="动作名"，宿主会把点击转成对封面 modalEvent(ctx, event) 的回调。所有逻辑都写在封面 JS 的 modalEvent 里。
C. 只要弹窗里出现了任意 data-vt-action，封面就【必须】定义 modalEvent(ctx, event)，并为每一个动作名写处理分支；处理完数据后【必须】调用 VoidTabDesigner.updateModal(ctx, {...}) 重新渲染弹窗，否则界面不会更新。
D. 触发规则：
   - 普通按钮用 <button type="button" data-vt-action="x">，点击即触发。
   - 表单用 <form data-vt-action="save">，在提交时（含其内 <button type="submit">）触发，并把表单字段一起带出。
   - 【不要】给 input / select / textarea 本身加 data-vt-action（会被忽略，且会破坏原生时间/日期/下拉选择器）。
E. 回调参数 event = { name, data, source }：
   - name：动作名（data-vt-action 的值）。
   - data：离触发点最近的 <form> 的字段，键是 input/select/textarea 的 name，值是字符串；同名多值是数组；复选框勾选为 'on'、未勾选为 ''。
   - source.dataset：被点击元素的 data-* 集合（如删除某行时用 data-id="..."，在 event.source.dataset.id 读取）。
F. 弹窗 DOM 在每次 updateModal 时整体替换，因此【不要】缓存弹窗内的节点引用；每次都用数据重新生成完整 HTML。所有插入 HTML 的动态文本必须用 VoidTabDesigner.escapeHtml(value) 转义。

══════ 运行时契约 ══════
1. 封面 JS 必须调用 VoidWidget.define({ ... })，在 mount(ctx) 里创建 DOM 挂到 ctx.root。可选生命周期：update(ctx)、pause()、resume()、unmount()、modalEvent(ctx, event)。状态存在 this 上（如 this._state、this._timer）。有定时器/轮询必须在 pause 停、resume 启、unmount 清理。
2. ctx：ctx.root（封面根节点）、ctx.size.placement.w/h（当前格子尺寸，用于自适应 1×1 / 2×2 / 宽卡）、ctx.settings（实例设置对象）、ctx.storage.get/set/remove(key[,value])（异步、本实例私有、单值约 8KB，返回 Promise，用 await）、ctx.network.fetch(url,init)（需声明 network 能力且域名在白名单，仅 GET/HEAD）、ctx.openUrl(url)、ctx.copyText(text)、ctx.notify(title,options)、ctx.emit(name,data)。这些 Promise 调用都计入每分钟配额，不要放进每秒定时器。
3. 弹窗助手（系统已注入，禁止自行定义 VoidTabDesigner）：VoidTabDesigner.openModal(ctx, {title, html, width, height, scrollTarget}) 首次打开；VoidTabDesigner.updateModal(ctx, {title, html, scrollTarget}) 原地刷新（不重载、保留滚动）。强烈建议写一个 openDetail(ctx, self, updateOnly) 函数：updateOnly 为假走 openModal、为真走 updateModal；封面点击时 openDetail(ctx, this)，modalEvent 处理完 openDetail(ctx, this, true)。
4. 禁止外部依赖、import、远程脚本；全部逻辑写进封面 JS，只用普通 DOM API。
5. 样式适配主题变量：--vt-accent、--vt-text、--vt-muted、--vt-surface；封面根节点宽高 100%、已 border-box。

══════ 视觉设计（务必遵循，否则界面会很丑）══════
颜色：一律用主题变量派生，禁止写死纯黑/纯白或随意取色。
- 表面 = color-mix(in srgb, var(--vt-surface) 90%, transparent)
- 描边 = color-mix(in srgb, var(--vt-text) 12%, transparent)
- 次要文字 = var(--vt-muted)；强调/高亮 = var(--vt-accent)；正文 = var(--vt-text)
间距与圆角：卡片内边距 14–18px、元素间距 8–12px；圆角卡片 16–18px、控件 10–12px、标签 999px。
字号：标题 13–15px/900，正文 12–13px，辅助 11px；时间和数字加 font-variant-numeric: tabular-nums。
封面：根节点 width/height:100%，用 grid 布局，按 ctx.size.placement.w/h 自适应（小尺寸隐藏次要信息）；卡片用「渐变 + 半透明表面 + 1px 描边 + 轻微内阴影」，hover 要有细微反馈。务必填满卡片、不要留大片空白或裸文字。
弹窗：信息较多时优先「主从布局」——左列列表（约 240px）+ 右列详情（flex:1），窄屏（max-width:640px）塌成单列。列表项要有 hover 和选中态 .is-active；要有空状态占位；输入框/按钮统一风格，按钮分 主(实心 accent) / 次(描边) / 危险(红) 三类；标签用 chip 小圆角。
可直接采用的参考 CSS（按需改类名）：
.detail-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px;height:100%;min-height:0}
.list{display:grid;gap:6px;align-content:start;overflow:auto;padding-right:2px}
.list-item{display:grid;gap:3px;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--vt-text) 12%,transparent);background:color-mix(in srgb,var(--vt-surface) 78%,transparent);cursor:pointer;text-align:left}
.list-item:hover{border-color:color-mix(in srgb,var(--vt-accent) 40%,transparent)}
.list-item.is-active{border-color:var(--vt-accent);background:color-mix(in srgb,var(--vt-accent) 12%,transparent)}
.pane{display:flex;flex-direction:column;gap:10px;min-width:0}
.input,.textarea{width:100%;border:1px solid color-mix(in srgb,var(--vt-text) 12%,transparent);border-radius:10px;background:color-mix(in srgb,var(--vt-surface) 82%,transparent);color:var(--vt-text);font:inherit;outline:none}
.input{height:34px;padding:0 10px}.textarea{min-height:160px;padding:10px;resize:vertical;line-height:1.6}
.input:focus,.textarea:focus{border-color:var(--vt-accent)}
.btn{height:34px;padding:0 14px;border-radius:10px;font-weight:800;cursor:pointer;border:1px solid color-mix(in srgb,var(--vt-text) 12%,transparent);background:color-mix(in srgb,var(--vt-surface) 80%,transparent);color:var(--vt-text)}
.btn.primary{border-color:transparent;background:var(--vt-accent);color:#fff}
.btn.danger{border-color:color-mix(in srgb,#ef4444 40%,transparent);color:#ef4444}
.chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--vt-text) 12%,transparent);background:color-mix(in srgb,var(--vt-surface) 74%,transparent);font-size:11px;color:var(--vt-muted)}
.empty{display:grid;place-items:center;height:100%;color:var(--vt-muted);font-size:12px}
@media(max-width:640px){.detail-layout{grid-template-columns:1fr}}

══════ 完整可运行示例（必须照此结构生成，尤其是 modalEvent + openDetail 的闭环）══════
// 一个可增删的「今日待办」：封面显示数量，点击打开弹窗增删。
VoidWidget.define({
  async mount(ctx) {
    this._root = document.createElement('button');
    this._root.type = 'button';
    this._root.className = 'todo-card';
    ctx.root.appendChild(this._root);
    this._items = await loadItems(ctx);
    renderCover(this);
    this._root.addEventListener('click', () => openDetail(ctx, this));
  },
  async modalEvent(ctx, event) {
    if (event.name === 'add') {
      const text = readValue(event.data, 'newText');
      if (text) this._items.push({ id: 'i' + Date.now(), text: text });
    } else if (event.name === 'delete') {
      const id = event.source && event.source.dataset ? event.source.dataset.id : '';
      this._items = this._items.filter((it) => it.id !== id);
    }
    await saveItems(ctx, this._items);
    renderCover(this);
    openDetail(ctx, this, true); // 关键：处理完用 updateModal 原地刷新弹窗
  },
});

function readValue(data, key) {
  const v = data && data[key];
  return String(Array.isArray(v) ? v[0] : (v || '')).trim();
}
async function loadItems(ctx) {
  const saved = await ctx.storage.get('items');
  return Array.isArray(saved) ? saved : [];
}
async function saveItems(ctx, items) {
  try { await ctx.storage.set('items', items); } catch (e) {}
}
function renderCover(self) {
  self._root.textContent = '待办 ' + self._items.length + ' 项';
}
function openDetail(ctx, self, updateOnly) {
  const esc = VoidTabDesigner.escapeHtml;
  const rows = self._items.map((it) =>
    '<li class="row"><span>' + esc(it.text) + '</span>' +
    '<button type="button" data-vt-action="delete" data-id="' + esc(it.id) + '">删除</button></li>'
  ).join('') || '<li class="empty">还没有待办</li>';
  const html =
    '<main class="todo-detail">' +
      '<ul class="list">' + rows + '</ul>' +
      '<form class="add" data-vt-action="add">' +
        '<input name="newText" placeholder="新增一项待办">' +
        '<button type="submit">添加</button>' +
      '</form>' +
    '</main>';
  const payload = { title: '今日待办', html: html };
  return updateOnly ? VoidTabDesigner.updateModal(ctx, payload) : VoidTabDesigner.openModal(ctx, payload);
}

══════ 生成前自检（务必满足）══════
- 弹窗里每个可交互元素都用 data-vt-action，没有任何内联 JS / <script>。
- modalEvent 覆盖了弹窗里出现的每一个 data-vt-action 动作名。
- 每个分支改完数据后都调用了 updateModal（或经 openDetail(..., true)）刷新。
- 需要持久化就声明 storage 并用 await ctx.storage 读写。
- entryCode 是合法的 JS；返回的整体是合法 JSON（字符串里的换行、引号、反斜杠都正确转义）。

══════ 输出格式 ══════
只返回一个 JSON 对象（可放在 \`\`\`json 代码块中），不要输出任何解释文字。字段：
{
  "label": "组件名（中文）",
  "description": "一句话描述",
  "icon": "Phosphor 图标名，如 Clock / ListChecks / ChartLine",
  "entryCode": "封面 JS，含 VoidWidget.define(...) 与 modalEvent；不要包含 VoidTabDesigner 的定义",
  "styles": "封面 CSS",
  "modalHtml": "弹窗默认 HTML（静态示例即可，运行时由 openModal/updateModal 覆盖；同样禁止内联 JS）",
  "modalStyles": "弹窗 CSS",
  "modalWidth": "如 760px 或 80vw",
  "modalHeight": "如 620px 或 72vh",
  "permissions": ["storage"],
  "networkHosts": [],
  "settingsSchema": null
}
permissions 仅可从 ["storage","network","openExternal","clipboard.write","notifications"] 中选取，按需声明，不需要就给 []。settingsSchema 为可选 JSON Schema 对象，不需要就给 null。`;

/** Sections surfaced in the AI panel so the user can read/copy each prompt piece. */
export interface DesignerAiPromptSection {
    id: string;
    label: string;
    text: string;
}

/** The per-request prompt describing what the user wants, plus the draft's fixed context. */
export function buildDesignerAiUserPrompt(description: string, draft: DesignerDraft): string {
    const want = description.trim() || '一个实用的小组件';
    const d = draft.sizes.default;
    const min = draft.sizes.min;
    return `请为 VoidTab 设计一个组件。需求：${want}

约束：
- 组件 ID 固定为「${draft.id.trim() || 'my.widget'}」，请勿更改。
- 默认尺寸 ${d.w}×${d.h}，最小 ${min.w}×${min.h}，请让封面在该范围内自适应。
- 界面用中文，视觉精致，配色走主题变量。
- 提供配套弹窗用于查看/编辑数据：弹窗里所有交互都用 data-vt-action（禁止内联 JS / <script>），并在封面 modalEvent 里为每个动作写处理分支，处理后用 updateModal 刷新弹窗（参考系统示例的 openDetail 闭环）。
- 若需要持久化数据，请声明 storage 能力并用 await ctx.storage 读写。`;
}

/** The full copy-paste prompt (system + request) for use on an external AI platform. */
export function buildDesignerAiFullPrompt(description: string, draft: DesignerDraft): string {
    return `${DESIGNER_AI_SYSTEM_PROMPT}\n\n———— 需求 ————\n${buildDesignerAiUserPrompt(description, draft)}`;
}

/** Prompt pieces for the "查看/复制提示词" UI. */
export function buildDesignerAiPromptSections(description: string, draft: DesignerDraft): DesignerAiPromptSection[] {
    return [
        {id: 'system', label: '系统提示词（运行时契约）', text: DESIGNER_AI_SYSTEM_PROMPT},
        {id: 'request', label: '需求提示词', text: buildDesignerAiUserPrompt(description, draft)},
        {id: 'full', label: '完整提示词（粘贴到外部 AI）', text: buildDesignerAiFullPrompt(description, draft)},
    ];
}

const AI_PERMISSION_SET = new Set<SandboxRuntimePermission>([
    'storage', 'network', 'openExternal', 'clipboard.write', 'notifications',
]);

/** Pull the first JSON object out of a model reply (handles ```json fences and surrounding prose). */
function extractJsonObject(text: string): string | null {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fence ? fence[1] : text).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return candidate.slice(start, end + 1);
}

export interface DesignerAiParseResult {
    ok: boolean;
    error?: string;
    draftPatch?: Partial<DesignerDraft>;
}

/** Parse a model reply into a draft patch (does not mutate). Validate the merged draft via compileDraft. */
export function parseDesignerAiResponse(text: string): DesignerAiParseResult {
    const json = extractJsonObject(String(text || ''));
    if (!json) return {ok: false, error: '未在回复中找到 JSON 内容'};

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(json) as Record<string, unknown>;
    } catch {
        return {ok: false, error: 'AI 返回的 JSON 无法解析，请检查格式或重试'};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {ok: false, error: 'AI 返回的不是一个对象'};
    }

    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    const patch: Partial<DesignerDraft> = {};

    if (typeof parsed.label === 'string' && parsed.label.trim()) patch.label = parsed.label.trim().slice(0, 60);
    if (typeof parsed.description === 'string') patch.description = parsed.description.trim().slice(0, 200);
    if (typeof parsed.icon === 'string' && parsed.icon.trim()) patch.icon = parsed.icon.trim().slice(0, 40);
    if (typeof parsed.entryCode === 'string') patch.entryCode = parsed.entryCode;
    if (typeof parsed.styles === 'string') patch.styles = parsed.styles;
    if (typeof parsed.html === 'string') patch.html = parsed.html;
    if (typeof parsed.modalHtml === 'string') patch.modalHtml = parsed.modalHtml;
    if (typeof parsed.modalStyles === 'string') patch.modalStyles = parsed.modalStyles;
    if (typeof parsed.modalWidth === 'string' && parsed.modalWidth.trim()) patch.modalWidth = parsed.modalWidth.trim();
    if (typeof parsed.modalHeight === 'string' && parsed.modalHeight.trim()) patch.modalHeight = parsed.modalHeight.trim();

    if (Array.isArray(parsed.permissions)) {
        patch.permissions = parsed.permissions
            .map((item) => str(item).trim() as SandboxRuntimePermission)
            .filter((item) => AI_PERMISSION_SET.has(item));
    }
    if (Array.isArray(parsed.networkHosts)) {
        patch.networkHosts = parsed.networkHosts.map((item) => str(item).trim()).filter(Boolean);
    }
    if (parsed.settingsSchema && typeof parsed.settingsSchema === 'object' && !Array.isArray(parsed.settingsSchema)) {
        patch.settingsSchemaText = JSON.stringify(parsed.settingsSchema, null, 2);
    }

    if (!patch.entryCode || !patch.entryCode.includes('VoidWidget.define')) {
        return {ok: false, error: 'AI 回复缺少有效的封面 JS（需包含 VoidWidget.define）'};
    }
    return {ok: true, draftPatch: patch};
}

/** Merge an AI patch onto a draft, keeping identity fields (id/version/sizes/category) from the base. */
export function applyDesignerAiPatch(base: DesignerDraft, patch: Partial<DesignerDraft>): DesignerDraft {
    return {
        ...base,
        ...patch,
        id: base.id,
        version: base.version,
        category: base.category,
        sizes: {
            default: cloneSize(base.sizes.default),
            min: cloneSize(base.sizes.min),
            max: cloneSize(base.sizes.max),
        },
    };
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

const memoCode = `// 备忘录：封面显示备忘条数与当前时间；点击打开主从布局弹窗（左列列表 / 右侧详情），支持新增、编辑、删除。
const MEMO_KEY = 'memo-notes-v1';

VoidWidget.define({
  async mount(ctx) {
    const root = document.createElement('button');
    root.className = 'memo-cover';
    root.type = 'button';
    root.innerHTML =
      '<div class="mc-head"><span class="mc-kicker">备忘录</span><b class="mc-count">0</b></div>' +
      '<div class="mc-clock"><strong class="mc-time">--:--</strong><small class="mc-date"></small></div>' +
      '<div class="mc-foot"><span class="mc-latest">还没有备忘</span></div>';
    ctx.root.appendChild(root);

    const state = {root, notes: await loadNotes(ctx), activeId: ''};
    if (state.notes.length) state.activeId = state.notes[0].id;
    this._state = state;
    this._render = () => renderCover(ctx, state);
    root.addEventListener('click', () => openDetail(ctx, state));
    this._render();
    this._timer = setInterval(this._render, 1000);
  },
  pause() { if (this._timer) clearInterval(this._timer); this._timer = null; },
  resume() {
    if (this._timer || !this._render) return;
    this._render();
    this._timer = setInterval(this._render, 1000);
  },
  unmount() { if (this._timer) clearInterval(this._timer); this._timer = null; },
  async modalEvent(ctx, event) {
    const state = this._state;
    if (!state) return;
    if (event.name === 'select-note') {
      const id = event.source && event.source.dataset ? event.source.dataset.id : '';
      if (id) state.activeId = id;
      openDetail(ctx, state, true);
      return;
    }
    if (event.name === 'add-note') {
      const note = {
        id: 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        title: '新备忘',
        content: '',
        tags: [],
        updatedAt: new Date().toISOString(),
      };
      state.notes.unshift(note);
      state.activeId = note.id;
      await saveNotes(ctx, state.notes);
      renderCover(ctx, state);
      openDetail(ctx, state, true, '[data-vt-field="title"]');
      return;
    }
    if (event.name === 'save-note') {
      const note = findNote(state, state.activeId);
      if (note) {
        note.title = readValue(event.data, 'title').trim().slice(0, 60) || '未命名';
        note.content = readValue(event.data, 'content').slice(0, 4000);
        note.tags = parseTags(readValue(event.data, 'tags'));
        note.updatedAt = new Date().toISOString();
        state.notes = sortNotes(state.notes);
        state.activeId = note.id;
      }
      await saveNotes(ctx, state.notes);
      renderCover(ctx, state);
      openDetail(ctx, state, true);
      return;
    }
    if (event.name === 'delete-note') {
      const id = event.source && event.source.dataset ? event.source.dataset.id : '';
      state.notes = state.notes.filter((n) => n.id !== id);
      if (state.activeId === id) state.activeId = state.notes.length ? state.notes[0].id : '';
      await saveNotes(ctx, state.notes);
      renderCover(ctx, state);
      openDetail(ctx, state, true);
    }
  },
});

function normalizeNote(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(s.id || ('n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))),
    title: String(s.title || '未命名').slice(0, 60),
    content: String(s.content || '').slice(0, 4000),
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [],
    updatedAt: String(s.updatedAt || new Date().toISOString()),
  };
}

function sortNotes(notes) {
  return notes.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function normalizeNotes(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return sortNotes(list.map(normalizeNote)).slice(0, 100);
}

async function loadNotes(ctx) {
  try { return normalizeNotes(await ctx.storage.get(MEMO_KEY)); } catch (e) { return []; }
}

async function saveNotes(ctx, notes) {
  try { await ctx.storage.set(MEMO_KEY, notes); } catch (e) {}
}

function findNote(state, id) {
  return state.notes.find((n) => n.id === id) || null;
}

function readValue(data, key) {
  const v = data && data[key];
  return String(Array.isArray(v) ? v[0] : (v || ''));
}

function parseTags(text) {
  return String(text || '').split(/[,，\\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 6);
}

function fmtClock(date) {
  return date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
}
function fmtDate(date) {
  return date.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'short'});
}
function fmtUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function renderCover(ctx, state) {
  if (!state.root) return;
  const now = new Date();
  const p = ctx.size && ctx.size.placement ? ctx.size.placement : {w: 2, h: 2};
  state.root.classList.toggle('is-compact', p.w <= 1 || p.h <= 1);
  state.root.querySelector('.mc-count').textContent = String(state.notes.length);
  state.root.querySelector('.mc-time').textContent = fmtClock(now);
  state.root.querySelector('.mc-date').textContent = fmtDate(now);
  const latest = state.notes[0];
  state.root.querySelector('.mc-latest').textContent = latest ? ('最近：' + latest.title) : '还没有备忘，点击新增';
}

function openDetail(ctx, state, updateOnly, scrollTarget) {
  const esc = VoidTabDesigner.escapeHtml;
  const count = state.notes.length;
  const active = findNote(state, state.activeId);

  const list = count
    ? state.notes.map((n) => {
        const meta = [fmtUpdated(n.updatedAt)].concat(n.tags.slice(0, 2)).filter(Boolean).join(' · ');
        return '<button type="button" class="list-item memo-item' + (n.id === state.activeId ? ' is-active' : '') + '" data-vt-action="select-note" data-id="' + esc(n.id) + '">' +
            '<b class="memo-item-title">' + esc(n.title || '未命名') + '</b>' +
            '<span class="memo-item-meta">' + esc(meta || '尚未编辑') + '</span>' +
          '</button>';
      }).join('')
    : '<div class="empty">还没有备忘</div>';

  const pane = active
    ? '<form class="pane memo-form" data-vt-action="save-note">' +
        '<input class="input memo-title-input" name="title" data-vt-field="title" value="' + esc(active.title) + '" placeholder="标题" maxlength="60" autocomplete="off">' +
        '<div class="memo-updated">更新于 ' + esc(fmtUpdated(active.updatedAt) || '—') + '</div>' +
        '<textarea class="textarea" name="content" placeholder="在这里输入备忘内容...">' + esc(active.content) + '</textarea>' +
        '<input class="input" name="tags" value="' + esc(active.tags.join(', ')) + '" placeholder="标签，用逗号分隔" autocomplete="off">' +
        (active.tags.length ? '<div class="memo-tags">' + active.tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' : '') +
        '<div class="memo-actions">' +
          '<button type="submit" class="btn primary" data-vt-action="save-note">保存</button>' +
          '<button type="button" class="btn danger" data-vt-action="delete-note" data-id="' + esc(active.id) + '">删除</button>' +
        '</div>' +
      '</form>'
    : '<div class="pane"><div class="empty">从左侧选择一条备忘，或点击右上角「新增」</div></div>';

  const html =
    '<main class="memo-detail">' +
      '<header class="memo-bar">' +
        '<div class="memo-bar-title"><b>备忘录</b><span>' + count + ' 条</span></div>' +
        '<button type="button" class="btn primary" data-vt-action="add-note">＋ 新增</button>' +
      '</header>' +
      '<div class="detail-layout">' +
        '<div class="list memo-list">' + list + '</div>' +
        pane +
      '</div>' +
    '</main>';

  const payload = {title: '备忘录', html: html, scrollTarget: scrollTarget || ''};
  return updateOnly ? VoidTabDesigner.updateModal(ctx, payload) : VoidTabDesigner.openModal(ctx, payload);
}`;

const memoStyles = `.memo-cover{
  position:relative;overflow:hidden;width:100%;height:100%;box-sizing:border-box;
  display:grid;grid-template-rows:auto 1fr auto;gap:10px;padding:16px;text-align:left;cursor:pointer;
  border:1px solid color-mix(in srgb,var(--vt-text,#e8eaed) 12%,transparent);border-radius:inherit;color:var(--vt-text,#e8eaed);
  background:
    linear-gradient(135deg,color-mix(in srgb,var(--vt-accent,#3b82f6) 14%,transparent),transparent 56%),
    color-mix(in srgb,var(--vt-surface,rgba(255,255,255,.08)) 92%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 16%,transparent);
  transition:transform .16s ease,border-color .16s ease;
}
.memo-cover:hover{border-color:color-mix(in srgb,var(--vt-accent,#3b82f6) 42%,transparent)}
.memo-cover:active{transform:scale(.99)}
.mc-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mc-kicker{font-size:11px;font-weight:900;color:var(--vt-accent,#3b82f6)}
.mc-count{min-width:26px;height:24px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:13px;font-weight:950;font-variant-numeric:tabular-nums;background:color-mix(in srgb,var(--vt-accent,#3b82f6) 16%,transparent);color:var(--vt-accent,#3b82f6)}
.mc-clock{display:flex;align-items:baseline;gap:8px;min-width:0}
.mc-time{font-size:clamp(30px,22vw,54px);line-height:1;font-weight:950;font-variant-numeric:tabular-nums}
.mc-date{font-size:12px;font-weight:800;color:var(--vt-muted,rgba(232,234,237,.66));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-foot{min-width:0}
.mc-latest{display:block;font-size:12px;line-height:1.35;color:var(--vt-muted,rgba(232,234,237,.66));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.memo-cover.is-compact{grid-template-rows:auto auto;gap:6px;padding:12px;place-content:center;text-align:center}
.memo-cover.is-compact .mc-foot,.memo-cover.is-compact .mc-date{display:none}
.memo-cover.is-compact .mc-clock{justify-content:center}
`;

const memoModalHtml = `<main class="memo-detail">
  <header class="memo-bar">
    <div class="memo-bar-title"><b>备忘录</b><span>2 条</span></div>
    <button type="button" class="btn primary" data-vt-action="add-note">＋ 新增</button>
  </header>
  <div class="detail-layout">
    <div class="list memo-list">
      <button type="button" class="list-item memo-item is-active" data-vt-action="select-note" data-id="demo1"><b class="memo-item-title">购物清单</b><span class="memo-item-meta">06-28 21:40 · 生活</span></button>
      <button type="button" class="list-item memo-item" data-vt-action="select-note" data-id="demo2"><b class="memo-item-title">会议要点</b><span class="memo-item-meta">06-28 18:02 · 工作</span></button>
    </div>
    <form class="pane memo-form" data-vt-action="save-note">
      <input class="input memo-title-input" name="title" data-vt-field="title" value="购物清单" placeholder="标题" maxlength="60">
      <div class="memo-updated">更新于 06-28 21:40</div>
      <textarea class="textarea" name="content" placeholder="在这里输入备忘内容...">牛奶、鸡蛋、面包；周末去超市补货。</textarea>
      <input class="input" name="tags" value="生活, 待办" placeholder="标签，用逗号分隔">
      <div class="memo-tags"><span class="chip">生活</span><span class="chip">待办</span></div>
      <div class="memo-actions">
        <button type="submit" class="btn primary" data-vt-action="save-note">保存</button>
        <button type="button" class="btn danger" data-vt-action="delete-note" data-id="demo1">删除</button>
      </div>
    </form>
  </div>
</main>`;

const memoModalStyles = `.memo-detail{display:flex;flex-direction:column;gap:14px;height:100%;min-height:0;padding:18px;color:var(--vt-text,#e8eaed)}
.memo-bar{display:flex;align-items:center;justify-content:space-between;gap:12px}
.memo-bar-title{display:flex;align-items:baseline;gap:8px}
.memo-bar-title b{font-size:16px;font-weight:950}
.memo-bar-title span{font-size:12px;color:var(--vt-muted,rgba(232,234,237,.66))}
.detail-layout{flex:1;min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px}
.list{display:grid;gap:6px;align-content:start;overflow:auto;padding-right:2px}
.list-item{display:grid;gap:3px;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--vt-text,#e8eaed) 12%,transparent);background:color-mix(in srgb,var(--vt-surface,rgba(255,255,255,.08)) 78%,transparent);cursor:pointer;text-align:left}
.list-item:hover{border-color:color-mix(in srgb,var(--vt-accent,#3b82f6) 40%,transparent)}
.list-item.is-active{border-color:var(--vt-accent,#3b82f6);background:color-mix(in srgb,var(--vt-accent,#3b82f6) 12%,transparent)}
.memo-item-title{font-size:13px;font-weight:800;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.memo-item-meta{font-size:11px;color:var(--vt-muted,rgba(232,234,237,.66));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane{display:flex;flex-direction:column;gap:10px;min-width:0}
.input,.textarea{width:100%;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--vt-text,#e8eaed) 12%,transparent);border-radius:10px;background:color-mix(in srgb,var(--vt-surface,rgba(255,255,255,.08)) 82%,transparent);color:var(--vt-text,#e8eaed);font:inherit;outline:none}
.input{height:36px;padding:0 12px;font-weight:700}
.memo-title-input{font-size:15px;font-weight:900}
.textarea{flex:1;min-height:160px;padding:12px;resize:none;line-height:1.6;font-size:13px}
.input:focus,.textarea:focus{border-color:var(--vt-accent,#3b82f6)}
.memo-updated{font-size:11px;color:var(--vt-muted,rgba(232,234,237,.66))}
.memo-tags{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--vt-text,#e8eaed) 12%,transparent);background:color-mix(in srgb,var(--vt-surface,rgba(255,255,255,.08)) 74%,transparent);font-size:11px;color:var(--vt-muted,rgba(232,234,237,.66))}
.memo-actions{display:flex;gap:9px;margin-top:2px}
.btn{height:36px;padding:0 16px;border-radius:10px;font-size:13px;font-weight:850;cursor:pointer;border:1px solid color-mix(in srgb,var(--vt-text,#e8eaed) 12%,transparent);background:color-mix(in srgb,var(--vt-surface,rgba(255,255,255,.08)) 80%,transparent);color:var(--vt-text,#e8eaed)}
.btn.primary{border-color:transparent;background:var(--vt-accent,#3b82f6);color:#fff}
.btn.danger{border-color:color-mix(in srgb,#ef4444 40%,transparent);color:#ef4444;background:color-mix(in srgb,#ef4444 8%,transparent)}
.empty{display:grid;place-items:center;height:100%;min-height:120px;color:var(--vt-muted,rgba(232,234,237,.66));font-size:12px;text-align:center;padding:16px}
@media(max-width:640px){.detail-layout{grid-template-columns:1fr;overflow:auto}.list{max-height:160px}}
`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'memo',
        label: '备忘录',
        description: '封面看条数与时间，弹窗左列列表 / 右侧详情，支持增删改与标签。',
        draft: () => ({
            id: `my.memo-${Math.random().toString(36).slice(2, 6)}`,
            label: '备忘录',
            description: '记录备忘标题、内容、时间与标签，主从布局编辑。',
            icon: 'NotePencil',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 4, h: 3}},
            permissions: ['storage'],
            networkHosts: [],
            entryCode: memoCode,
            styles: memoStyles,
            modalHtml: memoModalHtml,
            modalStyles: memoModalStyles,
            modalWidth: '880px',
            modalHeight: '620px',
            html: '',
            settingsSchemaText: '',
        }),
    },
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
