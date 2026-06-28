(() => {
const SANDBOX_BRIDGE_CHANNEL = 'voidtab:sandbox:v1' as const;

interface SandboxThemeTokens {
    text: string;
    muted: string;
    accent: string;
    surface: string;
    scheme: 'light' | 'dark';
}

interface SandboxBootPayload {
    channel: typeof SANDBOX_BRIDGE_CHANNEL;
    nonce: string;
    debug?: boolean;
    theme?: SandboxThemeTokens;
    packageId: string;
    tile: {
        id: string;
        title: string;
        settings: Record<string, unknown>;
        layouts: unknown;
        size?: Record<string, unknown>;
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
    host: Record<string, unknown>;
}

interface SandboxModalBootPayload {
    channel: typeof SANDBOX_BRIDGE_CHANNEL;
    nonce: string;
    title: string;
    html: string;
    styles: string;
    theme?: SandboxThemeTokens;
}

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: number;
};

type WidgetContext = Readonly<{
    root: HTMLElement;
    settings: Readonly<Record<string, unknown>>;
    tile: Readonly<Record<string, unknown>>;
    size: Readonly<Record<string, unknown>>;
    host: Readonly<Record<string, unknown>>;
    package: Readonly<Record<string, unknown>>;
    storage: Readonly<{
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<unknown>;
        remove: (key: string) => Promise<unknown>;
    }>;
    openUrl: (url: string) => Promise<unknown>;
    copyText: (text: string) => Promise<unknown>;
    network: Readonly<{
        fetch: (url: string, init?: unknown) => Promise<unknown>;
    }>;
    notify: (title: string, options?: unknown) => Promise<unknown>;
    modal: Readonly<{
        open: (payload: unknown) => Promise<unknown>;
        update: (payload: unknown) => Promise<unknown>;
    }>;
    emit: (name: string, data?: unknown) => void;
}>;

type WidgetDefinition = Record<string, unknown> & {
    mount?: (ctx: WidgetContext) => unknown;
    update?: (ctx: WidgetContext) => unknown;
    pause?: (ctx: WidgetContext, payload?: unknown) => unknown;
    resume?: (ctx: WidgetContext, payload?: unknown) => unknown;
    unmount?: (ctx: WidgetContext, payload?: unknown) => unknown;
    modalEvent?: (ctx: WidgetContext, payload?: unknown) => unknown;
};

type SandboxWindow = Window & {
    VoidWidget?: Readonly<{
        define: (definition: unknown) => void;
    }>;
    VoidTabDesigner?: Readonly<{
        modal: unknown;
        escapeHtml: (value: unknown) => string;
        openModal: (ctx: WidgetContext, overrides?: Record<string, unknown>) => Promise<unknown>;
        updateModal: (ctx: WidgetContext, overrides?: Record<string, unknown>) => Promise<unknown>;
    }>;
};

const sandboxWindow = window as SandboxWindow;

const root = document.getElementById('root') || document.body;
const query = new URLSearchParams(window.location.search);
const pageScope = query.get('scope') || 'tile';
const pageNonce = query.get('nonce') || '';
const pending = new Map<string, PendingRequest>();

let activeNonce = '';
let activeMode: 'tile' | 'modal' | '' = '';
let widget: WidgetDefinition | null = null;
let tileContext: WidgetContext | null = null;
let mounted = false;
let paused = false;
let requestSeq = 0;
let tileBooted = false;
let scriptEvaluationBlocked = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const cleanText = (value: unknown) => String(value == null ? '' : value).slice(0, 1200);

const cleanLong = (value: unknown, max: number) => String(value == null ? '' : value).slice(0, max);

const safeCssToken = (value: unknown, fallback: string) => {
    const next = String(value || '').trim();
    if (!next || next.length > 140 || /[<>{};\r\n]/.test(next)) return fallback;
    return next;
};

const escapeHtml = (value: unknown) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[char] || char);

const cleanError = (error: unknown) => {
    const source = isRecord(error) ? error : {};
    const message = source.message ? String(source.message) : String(error || 'Sandbox error');
    const stack = source.stack ? String(source.stack) : '';
    return {
        message: message.slice(0, 500),
        ...(stack ? {stack: stack.slice(0, 1200)} : {}),
    };
};

const post = (kind: string, payload?: unknown, requestId?: string) => {
    if (!activeNonce) return;
    window.parent.postMessage({
        channel: SANDBOX_BRIDGE_CHANNEL,
        nonce: activeNonce,
        kind,
        ...(requestId ? {requestId} : {}),
        ...(payload === undefined ? {} : {payload}),
    }, '*');
};

const request = (type: string, payload?: unknown) => new Promise((resolve, reject) => {
    const requestId = `req-${++requestSeq}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Host request timed out'));
    }, 3000);
    pending.set(requestId, {resolve, reject, timer});
    window.parent.postMessage({
        channel: SANDBOX_BRIDGE_CHANNEL,
        nonce: activeNonce,
        kind: 'request',
        requestId,
        request: {type, payload},
    }, '*');
});

const applyTheme = (theme: SandboxThemeTokens | undefined) => {
    const scheme = theme?.scheme === 'light' ? 'light' : 'dark';
    const style = document.documentElement.style;
    style.setProperty('--vt-text', safeCssToken(theme?.text, scheme === 'dark' ? '#f8fafc' : '#1f2937'));
    style.setProperty('--vt-muted', safeCssToken(theme?.muted, scheme === 'dark' ? 'rgba(248,250,252,0.66)' : 'rgba(31,41,55,0.62)'));
    style.setProperty('--vt-accent', safeCssToken(theme?.accent, '#3b82f6'));
    style.setProperty('--vt-surface', safeCssToken(theme?.surface, scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.06)'));
    style.setProperty('color-scheme', scheme);
};

const callWidgetLifecycle = (method: keyof WidgetDefinition, payload?: unknown) => {
    if (!widget || !tileContext) return;
    const fn = widget[method];
    if (typeof fn !== 'function') return;
    Promise.resolve(fn.call(widget, tileContext, payload)).catch((error) => post('error', cleanError(error)));
};

const createWidgetContext = (boot: SandboxBootPayload): WidgetContext => Object.freeze({
    root,
    settings: Object.freeze(cloneJson(boot.tile.settings || {})),
    tile: Object.freeze({id: boot.tile.id, title: boot.tile.title, layouts: cloneJson(boot.tile.layouts)}),
    size: Object.freeze(cloneJson(boot.tile.size || {
        placement: {x: 0, y: 0, w: 1, h: 1},
        breakpoint: 'mini',
        profile: 'desktop',
        cols: 1,
        unit: 0,
        gap: 0,
        width: 0,
        height: 0,
    })),
    host: Object.freeze(cloneJson(boot.host)),
    package: Object.freeze({id: boot.package.id, version: boot.package.version, label: boot.package.label}),
    storage: Object.freeze({
        get: (key: string) => request('storage.get', {key}),
        set: (key: string, value: unknown) => request('storage.set', {key, value}),
        remove: (key: string) => request('storage.remove', {key}),
    }),
    openUrl: (url: string) => request('openUrl', {url}),
    copyText: (text: string) => request('clipboard.write', {text}),
    network: Object.freeze({
        fetch: (url: string, init?: unknown) => request('network.fetch', {url, init}),
    }),
    notify: (title: string, options?: unknown) => request('notification.show', {title, options}),
    modal: Object.freeze({
        open: (payload: unknown) => request('modal.open', payload),
        update: (payload: unknown) => request('modal.update', payload),
    }),
    emit: (name: string, data?: unknown) => post('event', {name, data}),
});

const installDebugConsole = (enabled: boolean) => {
    if (!enabled) return;
    const fmt = (args: unknown[]) => args.map((item) => {
        if (typeof item === 'string') return item;
        try {
            return JSON.stringify(item);
        } catch {
            return String(item);
        }
    }).join(' ').slice(0, 500);

    (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
        const original = console[level];
        console[level] = (...args: unknown[]) => {
            try {
                post('log', {level, text: fmt(args)});
            } catch {
                // Logging must never break widget execution.
            }
            original.apply(console, args);
        };
    });
};

const installVoidWidgetApi = () => {
    sandboxWindow.VoidWidget = Object.freeze({
        define(definition: unknown) {
            widget = isRecord(definition) ? definition as WidgetDefinition : {};
            if (mounted || !tileContext) return;
            mounted = true;
            const mount = widget.mount;
            Promise.resolve(typeof mount === 'function' ? mount.call(widget, tileContext) : undefined)
                .then(() => post('mounted'))
                .catch((error) => post('error', cleanError(error)));
        },
    });
};

const installDesignerHelper = (modalDefaults: unknown = {}) => {
    sandboxWindow.VoidTabDesigner = Object.freeze({
        modal: modalDefaults,
        escapeHtml,
        openModal(ctx: WidgetContext, overrides?: Record<string, unknown>) {
            const next = Object.assign({}, modalDefaults, overrides || {});
            return ctx.modal.open(next);
        },
        updateModal(ctx: WidgetContext, overrides?: Record<string, unknown>) {
            const next = Object.assign({}, modalDefaults, overrides || {});
            return ctx.modal.update ? ctx.modal.update(next) : ctx.modal.open(next);
        },
    });
};

const runPackageScript = (path: string, source: string) => {
    const sourceUrl = `voidtab-sandbox/${encodeURIComponent(path)}`;
    const execute = new Function(`${source}\n//# sourceURL=${sourceUrl}`);
    execute.call(window);
};

const canEvaluatePackageScripts = () => {
    try {
        new Function('return 1')();
        return true;
    } catch (error) {
        scriptEvaluationBlocked = true;
        const detail = cleanError(error);
        post('error', {
            message: 'Sandbox CSP 阻止了组件脚本执行。扩展环境必须通过 manifest.sandbox.pages 加载 sandbox.html，并允许 unsafe-eval。',
            ...(detail.message ? {stack: detail.message} : {}),
        });
        return false;
    }
};

const bootTile = (boot: SandboxBootPayload) => {
    if (tileBooted || boot.channel !== SANDBOX_BRIDGE_CHANNEL || boot.nonce !== activeNonce) return;
    tileBooted = true;
    activeMode = 'tile';
    applyTheme(boot.theme);
    installDebugConsole(boot.debug === true);
    installVoidWidgetApi();

    tileContext = createWidgetContext(boot);
    root.innerHTML = boot.package.html || '';

    if (boot.package.styles) {
        const style = document.createElement('style');
        style.id = 'voidtab-package-style';
        style.textContent = boot.package.styles;
        document.head.appendChild(style);
    }

    const modalMatch = String(boot.package.scripts[boot.package.entry] || '').match(/__VOIDTAB_DESIGNER_MODAL__\s*=\s*JSON\.parse\((["'][\s\S]*?["'])\)/);
    if (modalMatch) {
        try {
            installDesignerHelper(JSON.parse(JSON.parse(modalMatch[1])));
        } catch {
            installDesignerHelper();
        }
    } else {
        installDesignerHelper();
    }

    post('ready');

    if (!canEvaluatePackageScripts()) return;

    const scripts = boot.package.scripts || {};
    const entry = boot.package.entry;
    const paths = Object.keys(scripts).filter((path) => path !== entry).sort();
    if (entry) paths.push(entry);

    for (const path of paths) {
        const source = scripts[path];
        if (typeof source !== 'string') continue;
        try {
            runPackageScript(path, source);
        } catch (error) {
            post('error', cleanError(error));
        }
    }

    window.setTimeout(() => {
        if (!mounted && !scriptEvaluationBlocked) post('error', {message: 'Sandbox package did not call VoidWidget.define()'});
    }, 0);
};

const upsertModalStyle = (styles: string) => {
    let style = document.getElementById('voidtab-modal-dynamic-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'voidtab-modal-dynamic-style';
        document.head.appendChild(style);
    }
    style.textContent = styles;
};

const setModalBody = (payload: Record<string, unknown>) => {
    const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const maxBefore = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const keepBottom = maxBefore - scrollY <= 80;

    if (payload.styles !== undefined) upsertModalStyle(cleanLong(payload.styles, 16000));
    document.body.innerHTML = cleanLong(payload.html, 24000) || '<main style="padding:24px">No modal content</main>';

    window.requestAnimationFrame(() => {
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const targetSelector = cleanText(payload.scrollTarget).slice(0, 160);
        let target: Element | null = null;
        if (targetSelector) {
            try {
                target = document.querySelector(targetSelector);
            } catch {
                target = null;
            }
        }

        if (target) {
            const rect = target.getBoundingClientRect();
            if (rect.top < 24 || rect.bottom > window.innerHeight - 24) {
                target.scrollIntoView({block: 'center'});
                return;
            }
        }
        window.scrollTo(0, keepBottom ? maxY : Math.min(scrollY, maxY));
    });
};

const bootModal = (boot: SandboxModalBootPayload) => {
    if (boot.channel !== SANDBOX_BRIDGE_CHANNEL || boot.nonce !== activeNonce) return;
    activeMode = 'modal';
    applyTheme(boot.theme);
    document.title = boot.title || 'Details';
    document.body.style.overflow = 'auto';
    setModalBody({html: boot.html, styles: boot.styles});
};

const serializeForm = (form: HTMLFormElement | null) => {
    const data: Record<string, string | string[]> = {};
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

    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]'))) {
        const key = cleanText(input.name).slice(0, 80);
        if (key && !Object.prototype.hasOwnProperty.call(data, key)) data[key] = input.checked ? 'on' : '';
    }
    return data;
};

const readSourcePayload = (source: Element | null) => {
    if (!source) return {};
    const dataset: Record<string, string> = {};
    for (const [key, value] of Object.entries((source as HTMLElement).dataset || {})) {
        dataset[cleanText(key).slice(0, 80)] = cleanText(value);
    }
    const value = source instanceof HTMLInputElement
        || source instanceof HTMLTextAreaElement
        || source instanceof HTMLSelectElement
        ? source.value
        : '';
    return {
        tag: source.tagName.toLowerCase(),
        text: cleanText(source.textContent || '').slice(0, 240),
        value: cleanText(value),
        dataset,
    };
};

const getElementForm = (source: Element | null) => {
    if (!source) return null;
    if (source instanceof HTMLButtonElement || source instanceof HTMLInputElement) return source.form;
    return source.closest('form') as HTMLFormElement | null;
};

const emitModalAction = (action: string | null, source: Element | null) => {
    const name = cleanText(action || '').slice(0, 80);
    if (!name) return;
    post('modal.event', {
        name,
        data: serializeForm(getElementForm(source)),
        source: readSourcePayload(source),
    });
    if (source?.hasAttribute('data-vt-close')) post('modal.close');
};

const handleModalMessage = (data: Record<string, unknown>) => {
    if (data.kind !== 'modal.update') return;
    const payload = isRecord(data.payload) ? data.payload : {};
    setModalBody(payload);
};

const handleTileMessage = (data: Record<string, unknown>) => {
    if (data.kind === 'response' && typeof data.requestId === 'string' && pending.has(data.requestId)) {
        const item = pending.get(data.requestId);
        if (!item) return;
        pending.delete(data.requestId);
        window.clearTimeout(item.timer);
        if (data.ok) item.resolve(data.payload);
        else item.reject(new Error(String(data.error || 'Host request failed')));
        return;
    }
    if (data.kind === 'update') {
        callWidgetLifecycle('update');
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
};

window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (!isRecord(data) || data.channel !== SANDBOX_BRIDGE_CHANNEL) return;

    if (data.kind === 'boot' && typeof data.nonce === 'string') {
        activeNonce = data.nonce;
        if (data.mode === 'tile' && isRecord(data.payload)) bootTile(data.payload as unknown as SandboxBootPayload);
        if (data.mode === 'modal' && isRecord(data.payload)) bootModal(data.payload as unknown as SandboxModalBootPayload);
        return;
    }

    if (!activeNonce || data.nonce !== activeNonce) return;
    if (activeMode === 'tile') handleTileMessage(data);
    else if (activeMode === 'modal') handleModalMessage(data);
});

window.addEventListener('error', (event) => post('error', cleanError(event.error || event.message)));
window.addEventListener('unhandledrejection', (event) => post('error', cleanError(event.reason)));

window.addEventListener('contextmenu', (event) => {
    if (activeMode !== 'tile') return;
    event.preventDefault();
    post('event', {name: 'contextmenu', data: {x: event.clientX, y: event.clientY}});
});

window.addEventListener('keydown', (event) => {
    if (activeMode !== 'modal' || event.key !== 'Escape') return;
    event.preventDefault();
    post('modal.escape');
});

document.addEventListener('submit', (event) => {
    if (activeMode !== 'modal') return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const submitter = event.submitter instanceof Element ? event.submitter : null;
    emitModalAction(submitter?.getAttribute('data-vt-action') || form.getAttribute('data-vt-action') || 'submit', submitter || form);
});

document.addEventListener('click', (event) => {
    if (activeMode !== 'modal' || !(event.target instanceof Element)) return;
    if (event.target.closest('input, select, textarea, option')) return;
    const source = event.target.closest('[data-vt-action]');
    if (!source) return;
    const tag = source.tagName.toLowerCase();
    if (tag === 'form') return;
    const type = (source.getAttribute('type') || '').toLowerCase();
    if (tag === 'button' && (!type || type === 'submit')) return;
    event.preventDefault();
    emitModalAction(source.getAttribute('data-vt-action'), source);
});

window.parent.postMessage({
    channel: SANDBOX_BRIDGE_CHANNEL,
    kind: 'sandbox-page-ready',
    scope: pageScope,
    ...(pageNonce ? {nonce: pageNonce} : {}),
}, '*');
})();
