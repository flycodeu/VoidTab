import type {
    ComponentTile,
    HostCapabilities,
    JsonValue,
    SandboxTileDefinition,
    TileSizeContext,
} from './contracts.ts';

export const SANDBOX_BRIDGE_CHANNEL = 'voidtab:sandbox:v1' as const;
export const SANDBOX_BRIDGE_MAX_MESSAGE_BYTES = 65_536;

export type SandboxBridgeRequestType =
    | 'storage.get'
    | 'storage.set'
    | 'storage.remove'
    | 'openUrl'
    | 'clipboard.write'
    | 'network.fetch'
    | 'notification.show'
    | 'modal.open'
    | 'modal.update';

export interface SandboxBridgeRequest {
    type: SandboxBridgeRequestType;
    payload?: unknown;
}

export type SandboxFrameMessage =
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'ready' | 'mounted'}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'error'; payload?: {message?: string; stack?: string}}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'event'; payload?: {name?: string; data?: unknown}}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'log'; payload?: {level?: string; text?: string}}
    | {channel: typeof SANDBOX_BRIDGE_CHANNEL; nonce: string; kind: 'request'; requestId: string; request: SandboxBridgeRequest};

export interface SandboxThemeTokens {
    /** Primary readable text color for the current theme. */
    text: string;
    /** Secondary / muted text color. */
    muted: string;
    /** Accent color matching the host theme. */
    accent: string;
    /** Theme-fitting translucent surface for component backgrounds. */
    surface: string;
    /** Color scheme so the iframe form controls render in the right mode. */
    scheme: 'light' | 'dark';
}

export interface SandboxBootPayload {
    channel: typeof SANDBOX_BRIDGE_CHANNEL;
    nonce: string;
    /** Designer-preview only: forward console output to the host as `log` messages. */
    debug?: boolean;
    /** Host theme colors, exposed to the component as CSS vars (--vt-*). */
    theme?: SandboxThemeTokens;
    packageId: string;
    tile: {
        id: string;
        title: string;
        settings: Record<string, JsonValue>;
        layouts: ComponentTile['layouts'];
        size?: TileSizeContext;
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
    debug?: boolean;
    theme?: SandboxThemeTokens;
    size?: TileSizeContext;
}): SandboxBootPayload {
    const {definition, tile, nonce, host} = input;
    return {
        channel: SANDBOX_BRIDGE_CHANNEL,
        nonce,
        ...(input.debug ? {debug: true} : {}),
        ...(input.theme ? {theme: cloneJson(input.theme)} : {}),
        packageId: definition.id,
        tile: {
            id: tile.id,
            title: tile.title || definition.label,
            settings: cloneJson(tile.settings || {}),
            layouts: cloneJson(tile.layouts),
            ...(input.size ? {size: cloneJson(input.size)} : {}),
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
    size: Object.freeze(boot.tile.size || {placement:{x:0,y:0,w:1,h:1},breakpoint:'mini',profile:'desktop',cols:1,unit:0,gap:0,width:0,height:0}),
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
    modal: Object.freeze({
      open: (payload) => request('modal.open', payload),
      update: (payload) => request('modal.update', payload),
    }),
    emit: (name, data) => post('event', {name, data}),
  });

  const callWidgetLifecycle = (method, payload) => {
    if (!widget || typeof widget[method] !== 'function') return;
    Promise.resolve(widget[method](ctx, payload)).catch((error) => post('error', cleanError(error)));
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
    if (data.kind === 'modal.event') {
      callWidgetLifecycle('modalEvent', data.payload || {});
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

  // Right-click inside the iframe never reaches the host document, so forward it
  // up so VoidTab can open its own tile context menu (delete / move / resize…).
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    post('event', {name: 'contextmenu', data: {x: event.clientX, y: event.clientY}});
  });

  if (boot.debug) {
    const fmt = (args) => args.map((a) => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ').slice(0, 500);
    ['log', 'info', 'warn', 'error'].forEach((level) => {
      const orig = console[level];
      console[level] = (...args) => {
        try { post('log', {level, text: fmt(args)}); } catch (e) {}
        if (typeof orig === 'function') orig.apply(console, args);
      };
    });
  }

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

  if (boot.theme) {
    const t = boot.theme;
    const rs = document.documentElement.style;
    if (t.text) rs.setProperty('--vt-text', t.text);
    if (t.muted) rs.setProperty('--vt-muted', t.muted);
    if (t.accent) rs.setProperty('--vt-accent', t.accent);
    if (t.surface) rs.setProperty('--vt-surface', t.surface);
    if (t.scheme) rs.setProperty('color-scheme', t.scheme);
  }

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
    debug?: boolean;
    theme?: SandboxThemeTokens;
    size?: TileSizeContext;
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
body{font:12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--vt-text,#f8fafc);background:transparent;}
button,input,select,textarea{font:inherit;color:inherit;}
a{color:var(--vt-accent,#60a5fa);}
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

const safeCssForHtml = (value: string) => value.replace(/<\/style/gi, '<\\/style');

const safeCssToken = (value: string | undefined, fallback: string) => {
    const next = String(value || '').trim();
    if (!next || next.length > 140 || /[<>{};\r\n]/.test(next)) return fallback;
    return next;
};

const sandboxThemeCssVars = (theme: SandboxThemeTokens | undefined) => {
    const scheme = theme?.scheme === 'light' ? 'light' : 'dark';
    const text = safeCssToken(theme?.text, scheme === 'dark' ? '#f8fafc' : '#1f2937');
    const muted = safeCssToken(theme?.muted, scheme === 'dark' ? 'rgba(248,250,252,0.66)' : 'rgba(31,41,55,0.62)');
    const accent = safeCssToken(theme?.accent, '#3b82f6');
    const surface = safeCssToken(theme?.surface, scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.06)');
    return `:root{--vt-text:${text};--vt-muted:${muted};--vt-accent:${accent};--vt-surface:${surface};color-scheme:${scheme};}`;
};

export function buildSandboxModalSrcDoc(input: {
    title?: string;
    html?: string;
    styles?: string;
    theme?: SandboxThemeTokens;
    channel?: string;
    nonce?: string;
}) {
    const title = String(input.title || '详情').slice(0, 80);
    const html = String(input.html || '').slice(0, 24_000);
    const styles = safeCssForHtml(String(input.styles || '').slice(0, 16_000));
    const channel = input.channel === SANDBOX_BRIDGE_CHANNEL ? SANDBOX_BRIDGE_CHANNEL : '';
    const nonce = String(input.nonce || '').slice(0, 100);
    const scriptNonce = nonce ? `modal-${nonce}` : '';
    const scriptNonceAttr = scriptNonce ? safeJsonForHtml(scriptNonce).slice(1, -1) : '';
    const bridgeScript = channel && nonce ? `
<script nonce="${scriptNonceAttr}">
(() => {
  const channel = ${safeJsonForHtml(channel)};
  const nonce = ${safeJsonForHtml(nonce)};
    const post = (kind, payload) => {
      window.parent.postMessage({channel, nonce, kind, ...(payload === undefined ? {} : {payload})}, '*');
    };
    const cleanText = (value) => String(value == null ? '' : value).slice(0, 1200);
    const serializeForm = (form) => {
      const data = {};
      if (!form || typeof FormData === 'undefined') return data;
      const formData = new FormData(form);
      for (const [key, value] of formData.entries()) {
        const safeKey = cleanText(key).slice(0, 80);
        if (!safeKey) continue;
        const safeValue = value instanceof File ? value.name.slice(0, 240) : cleanText(value);
        if (Object.prototype.hasOwnProperty.call(data, safeKey)) {
          const current = data[safeKey];
          data[safeKey] = Array.isArray(current) ? current.concat(safeValue) : [current, safeValue];
        } else {
          data[safeKey] = safeValue;
        }
      }
      for (const input of Array.from(form.querySelectorAll('input[type="checkbox"][name]'))) {
        const key = cleanText(input.name).slice(0, 80);
        if (key && !Object.prototype.hasOwnProperty.call(data, key)) data[key] = input.checked ? 'on' : '';
      }
      return data;
    };
    const readSourcePayload = (source) => {
      if (!source || !(source instanceof Element)) return {};
      const dataset = {};
      for (const [key, value] of Object.entries(source.dataset || {})) {
        dataset[cleanText(key).slice(0, 80)] = cleanText(value);
      }
      return {
        tag: source.tagName.toLowerCase(),
        text: cleanText(source.textContent || '').slice(0, 240),
        value: cleanText(source.value || ''),
        dataset,
      };
    };
    const emitAction = (action, source) => {
      const name = cleanText(action || '').slice(0, 80);
      if (!name) return;
      const form = source && source.form ? source.form : source?.closest?.('form');
      post('modal.event', {name, data: serializeForm(form), source: readSourcePayload(source)});
      if (source?.hasAttribute?.('data-vt-close')) post('modal.close');
    };
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      post('modal.escape');
    });
    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (!data || data.channel !== channel || data.nonce !== nonce || data.kind !== 'modal.update') return;
      const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
      const cleanLong = (value, max) => String(value == null ? '' : value).slice(0, max);
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const maxBefore = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const keepBottom = maxBefore - scrollY <= 80;
      if (payload.styles !== undefined) {
        let style = document.getElementById('voidtab-modal-dynamic-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'voidtab-modal-dynamic-style';
          document.head.appendChild(style);
        }
        style.textContent = cleanLong(payload.styles || '', 16000);
      }
      document.body.innerHTML = cleanLong(payload.html || '', 24000) || '<main style="padding:24px">暂无弹窗内容</main>';
      requestAnimationFrame(() => {
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const targetSelector = cleanText(payload.scrollTarget || '').slice(0, 160);
        let target = null;
        if (targetSelector) {
          try { target = document.querySelector(targetSelector); } catch (e) { target = null; }
        }
        if (target) {
          const rect = target.getBoundingClientRect();
          if (rect.top < 24 || rect.bottom > window.innerHeight - 24) {
            target.scrollIntoView({block: 'center'});
          } else {
            window.scrollTo(0, Math.min(scrollY, maxY));
          }
        } else {
          window.scrollTo(0, keepBottom ? maxY : Math.min(scrollY, maxY));
        }
      });
    });
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      const submitter = event.submitter instanceof Element ? event.submitter : null;
      emitAction(submitter?.getAttribute('data-vt-action') || form.getAttribute('data-vt-action') || 'submit', submitter || form);
    });
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      // Never hijack clicks on native form controls; otherwise the time/date
      // picker, text fields and checkboxes can't be opened or focused, and a
      // stray "submit" action fires on every click inside a data-vt-action form.
      if (event.target.closest('input, select, textarea, option')) return;
      const source = event.target.closest('[data-vt-action]');
      if (!source) return;
      const tag = source.tagName.toLowerCase();
      if (tag === 'form') return; // forms emit on submit, not on plain clicks
      const type = (source.getAttribute('type') || '').toLowerCase();
      if (tag === 'button' && (!type || type === 'submit')) return;
      event.preventDefault();
      emitAction(source.getAttribute('data-vt-action'), source);
    });
})();
</script>` : '';
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${scriptNonce ? `script-src 'nonce-${scriptNonceAttr}';` : ''} style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:;">
<title>${safeJsonForHtml(title).slice(1, -1)}</title>
<style>
${sandboxThemeCssVars(input.theme)}
html,body{width:100%;min-height:100%;margin:0;background:transparent;color:var(--vt-text,#f8fafc);font:14px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
body{overflow:auto;}
*,*::before,*::after{box-sizing:border-box;}
a{color:var(--vt-accent,#60a5fa);}
${styles}
</style>
</head>
<body>${html || '<main style="padding:24px">暂无弹窗内容</main>'}${bridgeScript}</body>
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
    if (raw.kind === 'log') {
        const payload = isRecord(raw.payload) ? raw.payload : {};
        return {
            channel: SANDBOX_BRIDGE_CHANNEL,
            nonce,
            kind: 'log',
            payload: {
                ...(typeof payload.level === 'string' ? {level: payload.level.slice(0, 16)} : {}),
                ...(typeof payload.text === 'string' ? {text: payload.text.slice(0, 500)} : {}),
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
            && type !== 'modal.open'
            && type !== 'modal.update'
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
