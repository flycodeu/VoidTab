import type {
    ComponentTile,
    HostCapabilities,
    JsonValue,
    SandboxTileDefinition,
} from './contracts.ts';

export const SANDBOX_BRIDGE_CHANNEL = 'voidtab:sandbox:v1' as const;
export const SANDBOX_BRIDGE_MAX_MESSAGE_BYTES = 16_384;

export type SandboxBridgeRequestType =
    | 'storage.get'
    | 'storage.set'
    | 'storage.remove'
    | 'openUrl'
    | 'clipboard.write'
    | 'network.fetch'
    | 'notification.show';

export interface SandboxBridgeRequest {
    type: SandboxBridgeRequestType;
    payload?: unknown;
}

export type SandboxFrameMessage =
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'ready' | 'mounted'}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'error'; payload?: {message?: string; stack?: string}}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'event'; payload?: {name?: string; data?: unknown}}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'request'; requestId: string; request: SandboxBridgeRequest};

export interface SandboxBootPayload {
    channel: typeof SANDBOX_BRIDGE_CHANNEL;
    nonce: string;
    packageId: string;
    tile: {
        id: string;
        title: string;
        settings: Record<string, JsonValue>;
        layouts: ComponentTile['layouts'];
    };
    package: {
        id: string;
        version: string;
        label: string;
        entry: string;
        scripts: Record<string, string>;
        styles: string;
        html: string;
    };
    host: {
        target: HostCapabilities['target'];
        hostVersion: string;
        browser: HostCapabilities['browser'];
        features: HostCapabilities['features'];
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const messageBytes = (value: unknown) => {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
};

const safeJsonForHtml = (value: unknown) => JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const randomHex = () => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
};

export function createSandboxNonce() {
    return `sandbox-${randomHex()}`;
}

export function createSandboxBootPayload(input: {
    definition: SandboxTileDefinition;
    tile: ComponentTile;
    nonce: string;
    host: HostCapabilities;
}): SandboxBootPayload {
    const {definition, tile, nonce, host} = input;
    return {
        channel: SANDBOX_BRIDGE_CHANNEL,
        nonce,
        packageId: definition.id,
        tile: {
            id: tile.id,
            title: tile.title || definition.label,
            settings: cloneJson(tile.settings || {}),
            layouts: cloneJson(tile.layouts),
        },
        package: {
            id: definition.id,
            version: definition.version,
            label: definition.label,
            entry: definition.sandbox.entry,
            scripts: cloneJson(definition.sandbox.scripts),
            styles: definition.sandbox.styles || '',
            html: definition.sandbox.html || '',
        },
        host: {
            target: host.target,
            hostVersion: host.hostVersion,
            browser: cloneJson(host.browser),
            features: cloneJson(host.features),
        },
    };
}

const bootstrapScript = `
(() => {
  const boot = JSON.parse(document.getElementById('voidtab-boot').textContent || '{}');
  const channel = boot.channel;
  const nonce = boot.nonce;
  const root = document.getElementById('root');
  const pending = new Map();
  let widget = null;
  let mounted = false;
  let paused = false;
  let requestSeq = 0;

  const post = (kind, payload, requestId) => {
    window.parent.postMessage({channel, nonce, kind, ...(requestId ? {requestId} : {}), ...(payload === undefined ? {} : {payload})}, '*');
  };

  const cleanError = (error) => ({
    message: error && error.message ? String(error.message).slice(0, 500) : String(error || 'Sandbox error').slice(0, 500),
    stack: error && error.stack ? String(error.stack).slice(0, 1200) : undefined,
  });

  const request = (type, payload) => new Promise((resolve, reject) => {
    const requestId = 'req-' + (++requestSeq) + '-' + Math.random().toString(36).slice(2, 8);
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('Host request timed out'));
    }, 3000);
    pending.set(requestId, {resolve, reject, timer});
    window.parent.postMessage({channel, nonce, kind: 'request', requestId, request: {type, payload}}, '*');
  });

  const ctx = Object.freeze({
    root,
    settings: Object.freeze(boot.tile.settings || {}),
    tile: Object.freeze({id: boot.tile.id, title: boot.tile.title, layouts: boot.tile.layouts}),
    host: Object.freeze(boot.host),
    package: Object.freeze({id: boot.package.id, version: boot.package.version, label: boot.package.label}),
    storage: Object.freeze({
      get: (key) => request('storage.get', {key}),
      set: (key, value) => request('storage.set', {key, value}),
      remove: (key) => request('storage.remove', {key}),
    }),
    openUrl: (url) => request('openUrl', {url}),
    copyText: (text) => request('clipboard.write', {text}),
    network: Object.freeze({
      fetch: (url, init) => request('network.fetch', {url, init}),
    }),
    notify: (title, options) => request('notification.show', {title, options}),
    emit: (name, data) => post('event', {name, data}),
  });

  const callWidgetLifecycle = (method) => {
    if (!widget || typeof widget[method] !== 'function') return;
    Promise.resolve(widget[method](ctx)).catch((error) => post('error', cleanError(error)));
  };

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (!data || data.channel !== channel || data.nonce !== nonce) return;
    if (data.kind === 'response' && data.requestId && pending.has(data.requestId)) {
      const item = pending.get(data.requestId);
      pending.delete(data.requestId);
      window.clearTimeout(item.timer);
      if (data.ok) item.resolve(data.payload);
      else item.reject(new Error(String(data.error || 'Host request failed')));
      return;
    }
    if (data.kind === 'update' && widget && typeof widget.update === 'function') {
      Promise.resolve(widget.update(ctx)).catch((error) => post('error', cleanError(error)));
      return;
    }
    if (data.kind === 'pause') {
      if (!paused) {
        paused = true;
        callWidgetLifecycle('pause');
      }
      return;
    }
    if (data.kind === 'resume') {
      if (paused) {
        paused = false;
        callWidgetLifecycle('resume');
      }
      return;
    }
    if (data.kind === 'unmount') {
      callWidgetLifecycle('unmount');
      widget = null;
    }
  });

  window.addEventListener('error', (event) => post('error', cleanError(event.error || event.message)));
  window.addEventListener('unhandledrejection', (event) => post('error', cleanError(event.reason)));

  window.VoidWidget = Object.freeze({
    define(definition) {
      widget = definition || {};
      if (mounted) return;
      mounted = true;
      Promise.resolve(widget.mount ? widget.mount(ctx) : undefined)
        .then(() => post('mounted'))
        .catch((error) => post('error', cleanError(error)));
    },
  });

  if (boot.package.html) root.innerHTML = boot.package.html;
  if (boot.package.styles) {
    const style = document.createElement('style');
    style.textContent = boot.package.styles;
    document.head.appendChild(style);
  }

  post('ready');

  const scripts = boot.package.scripts || {};
  const entry = boot.package.entry;
  const paths = Object.keys(scripts).filter((path) => path !== entry).sort().concat(entry);
  for (const path of paths) {
    const source = scripts[path];
    if (typeof source !== 'string') continue;
    const script = document.createElement('script');
    script.textContent = source + '\\n//# sourceURL=voidtab-sandbox/' + encodeURIComponent(path);
    document.body.appendChild(script);
  }

  window.setTimeout(() => {
    if (!mounted) post('error', {message: 'Sandbox package did not call VoidWidget.define()'});
  }, 0);
})();
`;

export function buildSandboxSrcDoc(input: {
    definition: SandboxTileDefinition;
    tile: ComponentTile;
    nonce: string;
    host: HostCapabilities;
}) {
    const boot = createSandboxBootPayload(input);
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:; connect-src 'none';">
<style>
html,body,#root{width:100%;height:100%;margin:0;min-width:0;min-height:0;overflow:hidden;}
body{font:12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc;background:transparent;}
button,input,select,textarea{font:inherit;}
*,*::before,*::after{box-sizing:border-box;}
</style>
</head>
<body>
<div id="root"></div>
<script id="voidtab-boot" type="application/json">${safeJsonForHtml(boot)}</script>
<script>${bootstrapScript}</script>
</body>
</html>`;
}

export function parseSandboxFrameMessage(raw: unknown, nonce: string): SandboxFrameMessage | null {
    if (!isRecord(raw)) return null;
    if (raw.channel !== SANDBOX_BRIDGE_CHANNEL || raw.nonce !== nonce) return null;
    if (messageBytes(raw) > SANDBOX_BRIDGE_MAX_MESSAGE_BYTES) return null;
    if (raw.kind === 'ready' || raw.kind === 'mounted') {
        return {channel: SANDBOX_BRIDGE_CHANNEL, nonce, kind: raw.kind};
    }
    if (raw.kind === 'error') {
        const payload = isRecord(raw.payload) ? raw.payload : {};
        return {
            channel: SANDBOX_BRIDGE_CHANNEL,
            nonce,
            kind: 'error',
            payload: {
                ...(typeof payload.message === 'string' ? {message: payload.message.slice(0, 500)} : {}),
                ...(typeof payload.stack === 'string' ? {stack: payload.stack.slice(0, 1200)} : {}),
            },
        };
    }
    if (raw.kind === 'event') {
        const payload = isRecord(raw.payload) ? raw.payload : {};
        return {
            channel: SANDBOX_BRIDGE_CHANNEL,
            nonce,
            kind: 'event',
            payload: {
                ...(typeof payload.name === 'string' ? {name: payload.name.slice(0, 80)} : {}),
                ...(payload.data !== undefined ? {data: payload.data} : {}),
            },
        };
    }
    if (raw.kind === 'request' && typeof raw.requestId === 'string' && raw.requestId.length <= 80 && isRecord(raw.request)) {
        const type = raw.request.type;
        if (
            type !== 'storage.get'
            && type !== 'storage.set'
            && type !== 'storage.remove'
            && type !== 'openUrl'
            && type !== 'clipboard.write'
            && type !== 'network.fetch'
            && type !== 'notification.show'
        ) return null;
        return {
            channel: SANDBOX_BRIDGE_CHANNEL,
            nonce,
            kind: 'request',
            requestId: raw.requestId,
            request: {
                type,
                ...(raw.request.payload !== undefined ? {payload: raw.request.payload} : {}),
            },
        };
    }
    return null;
}
