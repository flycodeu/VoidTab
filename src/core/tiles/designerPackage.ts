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
        entryCode: STARTER_TEMPLATES[0].draft(now).entryCode,
        styles: STARTER_TEMPLATES[0].draft(now).styles,
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
            scripts: {[DESIGNER_ENTRY_PATH]: draft.entryCode},
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
        entryCode: install.sandbox.scripts[entry] || '',
        styles: install.sandbox.styles || '',
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

const clockCode = `// 一个最小的时钟组件：mount 时渲染，并每秒刷新。
VoidWidget.define({
  mount(ctx) {
    const el = document.createElement('div');
    el.className = 'clock';
    ctx.root.appendChild(el);

    const render = () => {
      el.textContent = new Date().toLocaleTimeString();
    };
    render();
    // 保存定时器，pause/unmount 时清理，避免后台空跑。
    this._timer = setInterval(render, 1000);
  },
  pause() { clearInterval(this._timer); },
  resume(ctx) {
    this.mount(ctx);
  },
  unmount() { clearInterval(this._timer); },
});`;

const clockStyles = `.clock{
  width:100%;height:100%;
  display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:clamp(14px,7cqw,40px);
  letter-spacing:.04em;
}`;

const counterCode = `// 点击计数器：演示「1×1 显示」+「点击后改变内容」+ 实例存储。
VoidWidget.define({
  async mount(ctx) {
    const wrap = document.createElement('button');
    wrap.className = 'counter';
    ctx.root.appendChild(wrap);

    // 从实例存储读取（需要勾选 storage 能力并授权）。
    let count = 0;
    try { count = (await ctx.storage.get('count')) || 0; } catch (e) {}

    const paint = () => { wrap.textContent = '点了 ' + count + ' 次'; };
    paint();

    wrap.addEventListener('click', async () => {
      count += 1;
      paint();
      try { await ctx.storage.set('count', count); } catch (e) {}
    });
  },
});`;

const counterStyles = `.counter{
  width:100%;height:100%;border:0;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:clamp(12px,6cqw,22px);
  /* 使用宿主注入的主题变量，保证在任意壁纸 / 明暗主题下都清晰可读。 */
  color:var(--vt-text,inherit);background:var(--vt-surface,rgba(255,255,255,.06));border-radius:14px;
}
.counter:active{transform:scale(.97);}`;

const fetchCode = `// 取数展示：演示 ctx.network.fetch（需勾选 network 能力 + 声明域名 + 授权）。
VoidWidget.define({
  async mount(ctx) {
    const el = document.createElement('div');
    el.className = 'box';
    el.textContent = '加载中…';
    ctx.root.appendChild(el);
    try {
      const res = await ctx.network.fetch('https://api.ip.sb/geoip');
      const data = JSON.parse(res.body);
      el.textContent = (data.ip || '未知 IP') + ' · ' + (data.country || '');
    } catch (e) {
      el.textContent = '请求失败：' + (e && e.message || e);
    }
  },
});`;

const fetchStyles = `.box{
  width:100%;height:100%;padding:10px;
  display:flex;align-items:center;justify-content:center;text-align:center;
  font-size:clamp(11px,5cqw,16px);font-weight:700;overflow-wrap:anywhere;
}`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'clock',
        label: '时钟（最简）',
        description: '渲染 + 定时刷新 + 生命周期清理，最适合入门。',
        draft: () => ({
            id: `my.clock-${Math.random().toString(36).slice(2, 6)}`,
            label: '我的时钟',
            description: '一个每秒刷新的数字时钟。',
            icon: 'Clock',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 4, h: 2}},
            permissions: [],
            networkHosts: [],
            entryCode: clockCode,
            styles: clockStyles,
            html: '',
            settingsSchemaText: '',
        }),
    },
    {
        id: 'counter',
        label: '点击计数器（存储）',
        description: '点击改变内容并把次数存进实例存储，需要 storage 能力。',
        draft: () => ({
            id: `my.counter-${Math.random().toString(36).slice(2, 6)}`,
            label: '点击计数器',
            description: '点击累加，并记住次数。',
            icon: 'Cursor',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 2, h: 1}, min: {w: 1, h: 1}, max: {w: 4, h: 2}},
            permissions: ['storage'],
            networkHosts: [],
            entryCode: counterCode,
            styles: counterStyles,
            html: '',
            settingsSchemaText: '',
        }),
    },
    {
        id: 'fetch',
        label: '取数展示（网络）',
        description: '通过宿主网络代理拉取数据并展示，需要 network 能力并声明域名。',
        draft: () => ({
            id: `my.ipinfo-${Math.random().toString(36).slice(2, 6)}`,
            label: 'IP 信息',
            description: '展示当前出口 IP 与国家。',
            icon: 'Globe',
            category: 'local',
            version: '0.1.0',
            sizes: {default: {w: 3, h: 1}, min: {w: 2, h: 1}, max: {w: 6, h: 2}},
            permissions: ['network'],
            networkHosts: ['api.ip.sb'],
            entryCode: fetchCode,
            styles: fetchStyles,
            html: '',
            settingsSchemaText: '',
        }),
    },
];
