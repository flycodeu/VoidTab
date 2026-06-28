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

export interface SandboxModalBootPayload {
    channel: typeof SANDBOX_BRIDGE_CHANNEL;
    nonce: string;
    title: string;
    html: string;
    styles: string;
    theme?: SandboxThemeTokens;
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

export function createSandboxModalBootPayload(input: {
    title?: string;
    html?: string;
    styles?: string;
    theme?: SandboxThemeTokens;
    nonce: string;
}): SandboxModalBootPayload {
    return {
        channel: SANDBOX_BRIDGE_CHANNEL,
        nonce: input.nonce,
        title: String(input.title || '详情').slice(0, 80),
        html: String(input.html || '').slice(0, 24_000),
        styles: String(input.styles || '').slice(0, 16_000),
        ...(input.theme ? {theme: cloneJson(input.theme)} : {}),
    };
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
