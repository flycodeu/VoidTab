import type {
    CapabilityRequirement,
    DeclarativeTileDefinition,
    DeclarativeTilePackageWire,
    DeclarativeViewNode,
    JsonValue,
    PackageSignature,
    TileCompatibility,
    TileInstallRecord,
    TileManifestWire,
    TileSize,
    TileStyleableToken,
} from './contracts.ts';
import {MAX_TILE_SPAN} from './gridMetrics.ts';
import {toExternalTileType} from './tileType.ts';

export const DECLARATIVE_TILE_PACKAGE_KIND = 'voidtab.tile-package' as const;
export const DECLARATIVE_TILE_PACKAGE_VERSION = 1 as const;

type ParseResult = {
    tileType: ReturnType<typeof toExternalTileType>;
    install: TileInstallRecord;
    package: DeclarativeTilePackageWire;
};

const STYLEABLE_TOKENS: TileStyleableToken[] = [
    'radius',
    'accent',
    'surface',
    'iconScale',
    'density',
    'elevation',
];

const NODE_TYPES = new Set(['text', 'image', 'icon', 'button', 'stack', 'grid', 'dialog']);
const HOST_FEATURES = new Set([
    'indexedStorage',
    'syncStorage',
    'networkProxy',
    'clipboardWrite',
    'notifications',
    'openExternal',
    'contextMenus',
    'localFileImport',
    'sandboxRuntime',
]);
const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|token|secret|api[_-]?key|apikey|authorization|bearer|cookie|credential|jwt|private[_-]?key|access[_-]?key|refresh[_-]?token)/i;
const SENSITIVE_QUERY_KEY_RE = /(?:token|secret|api[_-]?key|apikey|authorization|bearer|cookie|credential|jwt|password|passwd|pwd|access[_-]?key|refresh[_-]?token)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

const cleanString = (value: unknown, fallback = '') =>
    typeof value === 'string' ? value.trim() : fallback;

function sanitizeUrl(raw: string) {
    const value = raw.trim();
    if (!/^https?:\/\//i.test(value)) return value;
    try {
        const url = new URL(value);
        url.username = '';
        url.password = '';
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_KEY_RE.test(key)) url.searchParams.delete(key);
        }
        return url.toString();
    } catch {
        return value.replace(/([?&](?:token|secret|api[_-]?key|apikey|authorization|password|passwd|pwd)=)[^&#\s]+/gi, '$1[redacted]');
    }
}

const isJsonSafe = (value: unknown): value is JsonValue => {
    try {
        JSON.stringify(value);
        return value === null
            || ['string', 'number', 'boolean'].includes(typeof value)
            || Array.isArray(value)
            || isRecord(value);
    } catch {
        return false;
    }
};

const stableHash = (value: unknown) => {
    const source = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `local-fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

function normalizeSize(raw: unknown, fallback: TileSize): TileSize {
    const value = isRecord(raw) ? raw : {};
    return {
        w: clampInt(value.w, 1, MAX_TILE_SPAN, fallback.w),
        h: clampInt(value.h, 1, MAX_TILE_SPAN, fallback.h),
    };
}

function normalizeCompatibility(raw: unknown): TileCompatibility {
    const value = isRecord(raw) ? raw : {};
    const targets = Array.isArray(value.targets)
        ? value.targets.filter((target): target is 'web' | 'extension' => target === 'web' || target === 'extension')
        : [];
    const capabilities: CapabilityRequirement[] | undefined = Array.isArray(value.capabilities)
        ? value.capabilities
            .filter(isRecord)
            .map((entry): CapabilityRequirement | null => {
                if (!HOST_FEATURES.has(String(entry.feature))) return null;
                if (entry.level !== 'required' && entry.level !== 'optional') return null;
                return {
                    feature: String(entry.feature) as CapabilityRequirement['feature'],
                    level: entry.level,
                    ...(entry.fallback === 'hide-control' || entry.fallback === 'read-only' || entry.fallback === 'placeholder'
                        ? {fallback: entry.fallback}
                        : {}),
                };
            })
            .filter((entry): entry is CapabilityRequirement => !!entry)
        : undefined;

    return {
        targets: targets.length ? targets : ['web', 'extension'],
        minHostVersion: cleanString(value.minHostVersion, '1.0.0') || '1.0.0',
        ...(isRecord(value.minBrowserVersion) ? {minBrowserVersion: cloneJson(value.minBrowserVersion) as TileCompatibility['minBrowserVersion']} : {}),
        ...(capabilities?.length ? {capabilities} : {}),
        mobileSupport: value.mobileSupport === 'fallback-layout' || value.mobileSupport === 'desktop-only'
            ? value.mobileSupport
            : 'full',
    };
}

function normalizeDeclarativeValue(raw: unknown): JsonValue {
    if (isRecord(raw) && (raw.from === 'settings' || raw.from === 'data' || raw.from === 'host') && typeof raw.path === 'string') {
        return {
            from: raw.from,
            path: raw.path,
            ...(isJsonSafe(raw.fallback) ? {fallback: cloneJson(raw.fallback)} : {}),
        } as unknown as JsonValue;
    }
    if (isJsonSafe(raw)) return cloneJson(raw);
    return '';
}

function normalizeAction(raw: unknown) {
    const value = isRecord(raw) ? raw : {};
    if (value.type === 'openUrl') return {type: 'openUrl' as const, url: normalizeDeclarativeValue(value.url)};
    if (value.type === 'dialog') return {type: 'dialog' as const, ...(typeof value.view === 'string' ? {view: value.view} : {})};
    return {type: 'none' as const};
}

function normalizeNode(raw: unknown, depth = 0): DeclarativeViewNode {
    if (depth > 8) return {type: 'text', text: ''};
    const value = isRecord(raw) ? raw : {};
    const type = NODE_TYPES.has(String(value.type)) ? String(value.type) : 'text';
    const common = {
        ...(typeof value.id === 'string' && value.id.trim() ? {id: value.id.trim()} : {}),
        ...(typeof value.className === 'string' && value.className.trim() ? {className: value.className.trim().slice(0, 80)} : {}),
        ...(value.hidden !== undefined ? {hidden: normalizeDeclarativeValue(value.hidden) as any} : {}),
    };

    if (type === 'image') {
        return {
            ...common,
            type: 'image',
            src: normalizeDeclarativeValue(value.src),
            ...(value.alt !== undefined ? {alt: normalizeDeclarativeValue(value.alt)} : {}),
            fit: value.fit === 'contain' ? 'contain' : 'cover',
            radius: clampInt(value.radius, 0, 36, 14),
        };
    }

    if (type === 'icon') {
        return {
            ...common,
            type: 'icon',
            name: normalizeDeclarativeValue(value.name || 'SquaresFour'),
            ...(value.label !== undefined ? {label: normalizeDeclarativeValue(value.label)} : {}),
            tone: value.tone === 'accent' || value.tone === 'muted' ? value.tone : 'default',
            size: value.size === 'sm' || value.size === 'lg' ? value.size : 'md',
        };
    }

    if (type === 'button') {
        return {
            ...common,
            type: 'button',
            label: normalizeDeclarativeValue(value.label),
            action: normalizeAction(value.action),
            tone: value.tone === 'secondary' || value.tone === 'ghost' ? value.tone : 'primary',
        };
    }

    if (type === 'stack') {
        return {
            ...common,
            type: 'stack',
            direction: value.direction === 'row' ? 'row' : 'column',
            gap: clampInt(value.gap, 0, 32, 10),
            align: value.align === 'start' || value.align === 'center' || value.align === 'end' || value.align === 'stretch'
                ? value.align
                : 'stretch',
            children: Array.isArray(value.children) ? value.children.slice(0, 32).map((child) => normalizeNode(child, depth + 1)) : [],
        };
    }

    if (type === 'grid') {
        return {
            ...common,
            type: 'grid',
            columns: clampInt(value.columns, 1, 6, 2),
            gap: clampInt(value.gap, 0, 32, 10),
            children: Array.isArray(value.children) ? value.children.slice(0, 48).map((child) => normalizeNode(child, depth + 1)) : [],
        };
    }

    if (type === 'dialog') {
        return {
            ...common,
            type: 'dialog',
            ...(value.title !== undefined ? {title: normalizeDeclarativeValue(value.title)} : {}),
            children: Array.isArray(value.children) ? value.children.slice(0, 48).map((child) => normalizeNode(child, depth + 1)) : [],
        };
    }

    return {
        ...common,
        type: 'text',
        text: normalizeDeclarativeValue(value.text),
        variant: value.variant === 'title' || value.variant === 'caption' || value.variant === 'metric'
            ? value.variant
            : 'body',
        align: value.align === 'center' || value.align === 'right' ? value.align : 'left',
    };
}

function deriveDefaultSettingsFromSchema(raw: unknown): Record<string, JsonValue> {
    const schema = isRecord(raw) ? raw : {};
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const settings: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(properties)) {
        if (!isRecord(value) || !('default' in value) || !isJsonSafe(value.default)) continue;
        settings[key] = cloneJson(value.default);
    }
    return settings;
}

function sanitizeDefaultSettings(raw: unknown): Record<string, JsonValue> {
    if (!isRecord(raw)) return {};
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (SENSITIVE_KEY_RE.test(key)) continue;
        if (typeof value === 'string') {
            out[key] = sanitizeUrl(value);
            continue;
        }
        if (Array.isArray(value)) {
            out[key] = value.map((item) => typeof item === 'string' ? sanitizeUrl(item) : isJsonSafe(item) ? cloneJson(item) : null);
            continue;
        }
        if (isRecord(value)) {
            out[key] = sanitizeDefaultSettings(value);
            continue;
        }
        if (isJsonSafe(value)) out[key] = cloneJson(value);
    }
    return out;
}

function sanitizeSettingsSchema(raw: unknown): JsonValue | undefined {
    if (raw === null || typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (typeof raw === 'string') return sanitizeUrl(raw);
    if (Array.isArray(raw)) {
        return raw.map((item) => sanitizeSettingsSchema(item) ?? null);
    }
    if (!isRecord(raw)) return undefined;

    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (SENSITIVE_KEY_RE.test(key)) continue;
        if (key === 'default') {
            const sanitizedDefault = sanitizeDefaultSettings({value}).value;
            if (sanitizedDefault !== undefined) out[key] = sanitizedDefault;
            continue;
        }
        const sanitized = sanitizeSettingsSchema(value);
        if (sanitized !== undefined) out[key] = sanitized;
    }
    return out;
}

function normalizeSignature(raw: unknown): PackageSignature | undefined {
    if (!isRecord(raw)) return undefined;
    if (raw.algorithm !== 'ed25519') return undefined;
    if (typeof raw.keyId !== 'string' || !raw.keyId.trim()) return undefined;
    if (typeof raw.value !== 'string' || !raw.value.trim()) return undefined;
    return {
        algorithm: 'ed25519',
        keyId: raw.keyId.trim(),
        value: raw.value.trim(),
    };
}

export function parseDeclarativeTilePackage(raw: unknown, now = Date.now()): ParseResult {
    if (!isRecord(raw)) throw new TypeError('声明式组件包必须是 JSON 对象');
    if (raw.kind !== DECLARATIVE_TILE_PACKAGE_KIND) throw new TypeError('不是有效的 VoidTab 声明式组件包');
    if (raw.packageVersion !== DECLARATIVE_TILE_PACKAGE_VERSION) throw new TypeError('声明式组件包版本不受支持');
    if (!isRecord(raw.manifest)) throw new TypeError('声明式组件包缺少 manifest');
    if (!isRecord(raw.views)) throw new TypeError('声明式组件包缺少 views');

    const manifestInput = raw.manifest;
    if (manifestInput.manifestVersion !== 1 || manifestInput.apiVersion !== 1) {
        throw new TypeError('声明式组件 manifest 版本不受支持');
    }
    if (manifestInput.source !== 'declarative') {
        throw new TypeError('P5 MVP 仅允许导入 declarative 组件，不执行 sandbox 代码');
    }
    const rendererInput = isRecord(manifestInput.renderer) ? manifestInput.renderer : {};
    if (rendererInput.kind !== 'declarative' || typeof rendererInput.coverView !== 'string') {
        throw new TypeError('声明式组件缺少 coverView');
    }

    const packageId = cleanString(manifestInput.id);
    if (!/^[a-z0-9][a-z0-9._/-]{1,80}$/i.test(packageId)) {
        throw new TypeError('声明式组件 id 无效');
    }
    const tileType = toExternalTileType(packageId);
    const metadataInput = isRecord(manifestInput.metadata) ? manifestInput.metadata : {};
    const sizesInput = isRecord(manifestInput.sizes) ? manifestInput.sizes : {};
    const min = normalizeSize(sizesInput.min, {w: 1, h: 1});
    const max = normalizeSize(sizesInput.max, {w: MAX_TILE_SPAN, h: MAX_TILE_SPAN});
    const defaultSize = normalizeSize(sizesInput.default, {w: Math.max(min.w, 2), h: Math.max(min.h, 2)});
    const views: Record<string, DeclarativeViewNode> = {};
    for (const [viewId, node] of Object.entries(raw.views)) {
        if (!viewId.trim()) continue;
        views[viewId] = normalizeNode(node);
    }
    if (!views[rendererInput.coverView]) throw new TypeError(`声明式组件缺少视图：${rendererInput.coverView}`);

    const sanitizedSettingsSchema = sanitizeSettingsSchema(manifestInput.settingsSchema);
    const settingsFromSchema = deriveDefaultSettingsFromSchema(sanitizedSettingsSchema);
    const defaultSettings = isRecord(raw.defaultSettings)
        ? sanitizeDefaultSettings({...settingsFromSchema, ...cloneJson(raw.defaultSettings) as Record<string, JsonValue>})
        : sanitizeDefaultSettings(settingsFromSchema);
    const styleable = Array.isArray(manifestInput.styleable)
        ? [...new Set(manifestInput.styleable.filter((token): token is TileStyleableToken =>
            STYLEABLE_TOKENS.includes(token as TileStyleableToken),
        ))]
        : undefined;
    const hash = isRecord(manifestInput.integrity) && typeof manifestInput.integrity.sha256 === 'string' && manifestInput.integrity.sha256.trim()
        ? manifestInput.integrity.sha256.trim()
        : stableHash({manifest: manifestInput, views});
    const signature = normalizeSignature((manifestInput.integrity as any)?.signature);

    const manifest: TileManifestWire = {
        manifestVersion: 1,
        id: packageId,
        version: cleanString(manifestInput.version, '0.0.0') || '0.0.0',
        apiVersion: 1,
        source: 'declarative',
        metadata: {
            label: cleanString(metadataInput.label, packageId) || packageId,
            ...(typeof metadataInput.description === 'string' ? {description: metadataInput.description.trim()} : {}),
            icon: cleanString(metadataInput.icon, 'SquaresFour') || 'SquaresFour',
            category: cleanString(metadataInput.category, 'local') || 'local',
        },
        sizes: {
            default: defaultSize,
            min,
            max,
            ...(Array.isArray(sizesInput.allowed) ? {allowed: sizesInput.allowed.map((item) => normalizeSize(item, defaultSize)).slice(0, 32)} : {}),
            ...(isRecord(sizesInput.mobileFallback) ? {mobileFallback: normalizeSize(sizesInput.mobileFallback, {w: 1, h: 1})} : {}),
        },
        renderer: {
            kind: 'declarative',
            coverView: rendererInput.coverView,
            ...(typeof rendererInput.dialogView === 'string' && views[rendererInput.dialogView] ? {dialogView: rendererInput.dialogView} : {}),
        },
        ...(sanitizedSettingsSchema !== undefined ? {settingsSchema: sanitizedSettingsSchema} : {}),
        ...(styleable?.length ? {styleable} : {}),
        ...(Array.isArray(manifestInput.capabilities) ? {capabilities: cloneJson(manifestInput.capabilities) as any} : {}),
        compatibility: normalizeCompatibility(manifestInput.compatibility),
        integrity: {
            sha256: hash,
            assets: isRecord((manifestInput.integrity as any)?.assets) ? cloneJson((manifestInput.integrity as any).assets) : {},
            ...(signature ? {signature} : {}),
        },
    };

    const pack: DeclarativeTilePackageWire = {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
        manifest,
        views,
        ...(Object.keys(defaultSettings).length ? {defaultSettings} : {}),
    };

    return {
        tileType,
        install: {
            tileType,
            version: manifest.version,
            source: 'local',
            runtime: 'declarative',
            sha256: hash,
            enabled: true,
            installedAt: Math.round(now),
            updatedAt: Math.round(now),
            manifest,
            views,
            defaultSettings,
        },
        package: pack,
    };
}

export function normalizeDeclarativeTileInstallRecord(raw: unknown): TileInstallRecord | null {
    if (!isRecord(raw) || raw.runtime !== 'declarative' || !raw.manifest || !raw.views) return null;
    try {
        const parsed = parseDeclarativeTilePackage({
            kind: DECLARATIVE_TILE_PACKAGE_KIND,
            packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
            manifest: raw.manifest,
            views: raw.views,
            defaultSettings: raw.defaultSettings,
        }, Number(raw.updatedAt) || Date.now());
        return {
            ...parsed.install,
            installedAt: clampInt(raw.installedAt, 0, Number.MAX_SAFE_INTEGER, parsed.install.installedAt),
            updatedAt: clampInt(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, parsed.install.updatedAt),
            enabled: raw.enabled !== false,
            pinnedVersion: raw.pinnedVersion === true,
        };
    } catch {
        return null;
    }
}

export function createDeclarativeTileDefinitionFromInstall(install: TileInstallRecord): DeclarativeTileDefinition | null {
    if (install.runtime !== 'declarative' || !install.manifest || !install.views || install.enabled === false) return null;
    const tileType = toExternalTileType(install.manifest.id);
    return {
        id: tileType,
        source: 'declarative',
        label: install.manifest.metadata.label,
        description: install.manifest.metadata.description,
        icon: install.manifest.metadata.icon,
        category: install.manifest.metadata.category,
        version: install.manifest.version,
        sizes: install.manifest.sizes,
        settingsSchema: install.manifest.settingsSchema,
        styleable: install.manifest.styleable,
        capabilities: install.manifest.capabilities,
        compatibility: install.manifest.compatibility,
        renderer: install.manifest.renderer.kind === 'declarative'
            ? install.manifest.renderer
            : {kind: 'declarative', coverView: 'cover'},
        views: install.views,
        defaultSettings: install.defaultSettings || {},
        packageHash: install.sha256,
        ...(install.audit ? {audit: install.audit} : {}),
    };
}

export function createDeclarativeTilePackageExport(install: TileInstallRecord): DeclarativeTilePackageWire | null {
    if (install.runtime !== 'declarative' || !install.manifest || !install.views) return null;
    return {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
        manifest: cloneJson(install.manifest),
        views: cloneJson(install.views),
        ...(install.defaultSettings ? {defaultSettings: cloneJson(install.defaultSettings)} : {}),
    };
}
