import type {
    CapabilityRequirement,
    JsonValue,
    PackageSignature,
    SandboxTileDefinition,
    SandboxTilePackageWire,
    SandboxTileSource,
    TilePackageResources,
    TileCompatibility,
    TileInstallRecord,
    TileManifestWire,
    TileSize,
    TileStyleableToken,
} from './contracts.ts';
import {MAX_TILE_SPAN} from './gridMetrics.ts';
import {toExternalTileType} from './tileType.ts';
import {
    DECLARATIVE_TILE_PACKAGE_KIND,
    DECLARATIVE_TILE_PACKAGE_VERSION,
    TILE_PACKAGE_DIRECTORY_KIND,
} from './declarativePackage.ts';
import {assertTileImageAssetBudget} from './performancePolicy.ts';

type ParseResult = {
    tileType: ReturnType<typeof toExternalTileType>;
    install: TileInstallRecord;
    package: SandboxTilePackageWire;
};

const STYLEABLE_TOKENS: TileStyleableToken[] = [
    'radius',
    'accent',
    'surface',
    'iconScale',
    'density',
    'elevation',
];

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
const MAX_SCRIPT_COUNT = 16;
const MAX_SCRIPT_BYTES = 250_000;
const MAX_STYLE_BYTES = 40_000;
const MAX_HTML_BYTES = 40_000;
const MAX_RESOURCE_TEXT_BYTES = 80_000;
const MAX_README_BYTES = 40_000;
const MAX_ASSET_COUNT = 64;

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

const textBytes = (value: string) => new TextEncoder().encode(value).byteLength;

function normalizeAssetPath(raw: string) {
    const value = raw.trim().replace(/\\/g, '/');
    if (!/^assets\/[A-Za-z0-9._/-]{1,180}$/.test(value)) return '';
    if (value.includes('..') || value.endsWith('/')) return '';
    return value;
}

function sanitizePackageResources(raw: unknown): TilePackageResources | undefined {
    if (!isRecord(raw)) return undefined;
    const themeCss = typeof (raw.themeCss ?? raw['theme.css']) === 'string'
    && textBytes(String(raw.themeCss ?? raw['theme.css'])) <= MAX_RESOURCE_TEXT_BYTES
    && !/@import|url\s*\(|expression\s*\(|javascript:/i.test(String(raw.themeCss ?? raw['theme.css']))
        ? String(raw.themeCss ?? raw['theme.css']).trim()
        : '';
    const readme = typeof (raw.readme ?? raw['README.md']) === 'string'
    && textBytes(String(raw.readme ?? raw['README.md'])) <= MAX_README_BYTES
        ? String(raw.readme ?? raw['README.md']).trim()
        : '';
    const assetsInput = isRecord(raw.assets) ? raw.assets : {};
    const assets: Record<string, string> = {};
    for (const [key, value] of Object.entries(assetsInput).slice(0, MAX_ASSET_COUNT)) {
        const path = normalizeAssetPath(key);
        if (!path || typeof value !== 'string') continue;
        const asset = value.trim();
        if (!/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(asset)) continue;
        if (assertTileImageAssetBudget(asset, {label: path}).ok) assets[path] = asset;
    }
    const resources = {
        ...(themeCss ? {themeCss} : {}),
        ...(readme ? {readme} : {}),
        ...(Object.keys(assets).length ? {assets} : {}),
    };
    return Object.keys(resources).length ? resources : undefined;
}

function normalizeDirectoryPackage(raw: Record<string, unknown>): Record<string, unknown> {
    if (raw.kind !== TILE_PACKAGE_DIRECTORY_KIND || !isRecord(raw.files)) return raw;
    const files = raw.files;
    const assets: Record<string, string> = {};
    for (const [path, value] of Object.entries(files)) {
        const normalizedPath = normalizeAssetPath(path);
        if (!normalizedPath || typeof value !== 'string') continue;
        const asset = value.trim();
        if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(asset)) assets[normalizedPath] = asset;
    }
    return {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: raw.packageVersion,
        manifest: files['manifest.json'],
        sandbox: files['sandbox.json'],
        defaultSettings: files['defaultSettings.json'],
        resources: {
            themeCss: files['theme.css'],
            readme: files['README.md'],
            assets,
        },
    };
}

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
    const capabilities: CapabilityRequirement[] = Array.isArray(value.capabilities)
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
        : [];

    if (!capabilities.some((entry) => entry.feature === 'sandboxRuntime')) {
        capabilities.push({
            feature: 'sandboxRuntime',
            level: 'required',
            fallback: 'placeholder',
        });
    }

    return {
        targets: targets.length ? targets : ['web', 'extension'],
        minHostVersion: cleanString(value.minHostVersion, '1.0.0') || '1.0.0',
        ...(isRecord(value.minBrowserVersion) ? {minBrowserVersion: cloneJson(value.minBrowserVersion) as TileCompatibility['minBrowserVersion']} : {}),
        capabilities,
        mobileSupport: value.mobileSupport === 'fallback-layout' || value.mobileSupport === 'desktop-only'
            ? value.mobileSupport
            : 'full',
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

function normalizePackagePath(raw: unknown, label: string) {
    const value = cleanString(raw).replace(/\\/g, '/');
    if (
        !value
        || value.startsWith('/')
        || value.includes('..')
        || !/^[a-z0-9][a-z0-9._/-]{0,120}$/i.test(value)
    ) {
        throw new TypeError(`sandbox 组件 ${label} 路径无效`);
    }
    return value;
}

function normalizeSandboxSource(raw: unknown, entryFromManifest: string): SandboxTileSource {
    if (!isRecord(raw)) throw new TypeError('sandbox 组件包缺少 sandbox 源码');
    const entry = normalizePackagePath(raw.entry || entryFromManifest, 'entry');
    const scriptsInput = isRecord(raw.scripts) ? raw.scripts : {};
    const scripts: Record<string, string> = {};
    let totalBytes = 0;

    for (const [rawPath, source] of Object.entries(scriptsInput).slice(0, MAX_SCRIPT_COUNT)) {
        if (typeof source !== 'string') continue;
        const scriptPath = normalizePackagePath(rawPath, 'script');
        const bytes = textBytes(source);
        totalBytes += bytes;
        if (bytes <= 0 || totalBytes > MAX_SCRIPT_BYTES) {
            throw new TypeError('sandbox 组件脚本体积超过本地实验限制');
        }
        scripts[scriptPath] = source;
    }

    if (!scripts[entry]) throw new TypeError(`sandbox 组件缺少入口脚本：${entry}`);

    const styles = typeof raw.styles === 'string' ? raw.styles : '';
    if (styles && textBytes(styles) > MAX_STYLE_BYTES) {
        throw new TypeError('sandbox 组件样式体积超过本地实验限制');
    }

    const html = typeof raw.html === 'string' ? raw.html : '';
    if (html && textBytes(html) > MAX_HTML_BYTES) {
        throw new TypeError('sandbox 组件 HTML 体积超过本地实验限制');
    }

    return {
        entry,
        scripts,
        ...(styles ? {styles} : {}),
        ...(html ? {html} : {}),
    };
}

export function parseSandboxTilePackage(raw: unknown, now = Date.now()): ParseResult {
    if (!isRecord(raw)) throw new TypeError('sandbox 组件包必须是 JSON 对象');
    raw = normalizeDirectoryPackage(raw);
    if (!isRecord(raw)) throw new TypeError('sandbox 组件包必须是 JSON 对象');
    if (raw.kind !== DECLARATIVE_TILE_PACKAGE_KIND) throw new TypeError('不是有效的 VoidTab 组件包');
    if (raw.packageVersion !== DECLARATIVE_TILE_PACKAGE_VERSION) throw new TypeError('组件包版本不受支持');
    if (!isRecord(raw.manifest)) throw new TypeError('sandbox 组件包缺少 manifest');

    const manifestInput = raw.manifest;
    if (manifestInput.manifestVersion !== 1 || manifestInput.apiVersion !== 1) {
        throw new TypeError('sandbox 组件 manifest 版本不受支持');
    }
    if (manifestInput.source !== 'sandbox') {
        throw new TypeError('parseSandboxTilePackage 仅允许 sandbox 组件');
    }
    const rendererInput = isRecord(manifestInput.renderer) ? manifestInput.renderer : {};
    if (rendererInput.kind !== 'sandbox' || typeof rendererInput.entry !== 'string') {
        throw new TypeError('sandbox 组件缺少 entry');
    }

    const packageId = cleanString(manifestInput.id);
    if (!/^[a-z0-9][a-z0-9._/-]{1,80}$/i.test(packageId)) {
        throw new TypeError('sandbox 组件 id 无效');
    }
    const entry = normalizePackagePath(rendererInput.entry, 'entry');
    const sandbox = normalizeSandboxSource(raw.sandbox, entry);
    const resources = sanitizePackageResources(raw.resources);
    const tileType = toExternalTileType(packageId);
    const metadataInput = isRecord(manifestInput.metadata) ? manifestInput.metadata : {};
    const sizesInput = isRecord(manifestInput.sizes) ? manifestInput.sizes : {};
    const min = normalizeSize(sizesInput.min, {w: 1, h: 1});
    const max = normalizeSize(sizesInput.max, {w: MAX_TILE_SPAN, h: MAX_TILE_SPAN});
    const defaultSize = normalizeSize(sizesInput.default, {w: Math.max(min.w, 2), h: Math.max(min.h, 2)});
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
        : stableHash({manifest: manifestInput, sandbox});
    const signature = normalizeSignature((manifestInput.integrity as {signature?: unknown} | undefined)?.signature);

    const manifest: TileManifestWire = {
        manifestVersion: 1,
        id: packageId,
        version: cleanString(manifestInput.version, '0.0.0') || '0.0.0',
        apiVersion: 1,
        source: 'sandbox',
        metadata: {
            label: cleanString(metadataInput.label, packageId) || packageId,
            ...(typeof metadataInput.description === 'string' ? {description: metadataInput.description.trim()} : {}),
            icon: cleanString(metadataInput.icon, 'Code') || 'Code',
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
            kind: 'sandbox',
            entry: sandbox.entry,
        },
        ...(sanitizedSettingsSchema !== undefined ? {settingsSchema: sanitizedSettingsSchema} : {}),
        ...(styleable?.length ? {styleable} : {}),
        ...(Array.isArray(manifestInput.capabilities) ? {capabilities: cloneJson(manifestInput.capabilities) as TileManifestWire['capabilities']} : {}),
        compatibility: normalizeCompatibility(manifestInput.compatibility),
        integrity: {
            sha256: hash,
            assets: isRecord((manifestInput.integrity as {assets?: unknown} | undefined)?.assets)
                ? cloneJson((manifestInput.integrity as {assets: Record<string, string>}).assets)
                : {},
            ...(signature ? {signature} : {}),
        },
    };

    const pack: SandboxTilePackageWire = {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
        manifest: manifest as SandboxTilePackageWire['manifest'],
        sandbox,
        ...(Object.keys(defaultSettings).length ? {defaultSettings} : {}),
        ...(resources ? {resources} : {}),
    };

    return {
        tileType,
        install: {
            tileType,
            version: manifest.version,
            source: 'local',
            runtime: 'sandbox',
            sha256: hash,
            enabled: true,
            installedAt: Math.round(now),
            updatedAt: Math.round(now),
            manifest,
            sandbox,
            defaultSettings,
            ...(resources ? {resources} : {}),
        },
        package: pack,
    };
}

export function normalizeSandboxTileInstallRecord(raw: unknown): TileInstallRecord | null {
    if (!isRecord(raw) || raw.runtime !== 'sandbox' || !raw.manifest || !raw.sandbox) return null;
    try {
        const parsed = parseSandboxTilePackage({
            kind: DECLARATIVE_TILE_PACKAGE_KIND,
            packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
            manifest: raw.manifest,
            sandbox: raw.sandbox,
            defaultSettings: raw.defaultSettings,
            resources: raw.resources,
        }, Number(raw.updatedAt) || Date.now());
        return {
            ...parsed.install,
            installedAt: clampInt(raw.installedAt, 0, Number.MAX_SAFE_INTEGER, parsed.install.installedAt),
            updatedAt: clampInt(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, parsed.install.updatedAt),
            enabled: raw.enabled !== false,
            pinnedVersion: raw.pinnedVersion === true,
            ...(parsed.install.resources ? {resources: parsed.install.resources} : {}),
        };
    } catch {
        return null;
    }
}

export function createSandboxTileDefinitionFromInstall(
    install: TileInstallRecord,
    options: {includeDisabled?: boolean} = {},
): SandboxTileDefinition | null {
    if (install.runtime !== 'sandbox' || !install.manifest || !install.sandbox) return null;
    if (install.enabled === false && !options.includeDisabled) return null;
    const tileType = toExternalTileType(install.manifest.id);
    return {
        id: tileType,
        source: 'sandbox',
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
        renderer: install.manifest.renderer.kind === 'sandbox'
            ? install.manifest.renderer
            : {kind: 'sandbox', entry: install.sandbox.entry},
        sandbox: install.sandbox,
        defaultSettings: install.defaultSettings || {},
        packageHash: install.sha256,
        ...(install.audit ? {audit: install.audit} : {}),
        ...(install.resources ? {resources: cloneJson(install.resources)} : {}),
    };
}

export function createSandboxTilePackageExport(install: TileInstallRecord): SandboxTilePackageWire | null {
    if (install.runtime !== 'sandbox' || !install.manifest || !install.sandbox) return null;
    return {
        kind: DECLARATIVE_TILE_PACKAGE_KIND,
        packageVersion: DECLARATIVE_TILE_PACKAGE_VERSION,
        manifest: cloneJson(install.manifest) as SandboxTilePackageWire['manifest'],
        sandbox: cloneJson(install.sandbox),
        ...(install.defaultSettings ? {defaultSettings: cloneJson(install.defaultSettings)} : {}),
        ...(install.resources ? {resources: cloneJson(install.resources)} : {}),
    };
}
