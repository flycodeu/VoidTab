import type {Config} from './types';

type RecordLike = Record<string, any>;

export interface ConfigImportValidationSummary {
    groupCount: number;
    itemCount: number;
    siteCount: number;
    widgetCount: number;
    sensitiveFields: string[];
}

export interface ConfigImportValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    summary: ConfigImportValidationSummary;
}

const KNOWN_CONFIG_KEYS = [
    'version',
    'sync',
    'layout',
    'theme',
    'searchEngines',
    'currentEngineId',
    'ai',
    'focusMode',
    'runtime',
] as const;

const SENSITIVE_FIELD_LABELS = [
    {path: 'sync.password', label: 'WebDAV 密码'},
    {path: 'ai.apiKey', label: 'AI Key'},
    {path: 'runtime.auth.jwtToken', label: '临时 Token'},
] as const;

const MAX_MESSAGES = 12;
const SYNC_PROVIDERS = new Set(['webdav', 'none']);
const THEME_MODES = new Set(['light', 'dark', 'system']);
const SIDEBAR_POSITIONS = new Set(['left', 'right', 'top', 'bottom']);
const DENSITIES = new Set(['compact', 'normal', 'comfortable']);
const SITE_LAYOUT_MODES = new Set(['icon', 'card']);
const GROUP_SORT_KEYS = new Set(['custom', 'name', 'lastVisited']);
const ITEM_KINDS = new Set(['site', 'widget']);
const ICON_TYPES = new Set(['auto', 'text', 'icon']);
const TERMINAL_THEMES = new Set(['dark', 'light', 'hacker']);

const isRecord = (value: unknown): value is RecordLike =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const getByPath = (root: RecordLike, path: string): unknown =>
    path.split('.').reduce((acc, key) => acc?.[key], root);

const addLimited = (list: string[], message: string) => {
    if (list.length < MAX_MESSAGES) list.push(message);
};

const warnStringField = (root: RecordLike, key: string, label: string, warnings: string[]) => {
    if (key in root && typeof root[key] !== 'string') addLimited(warnings, `${label} 不是字符串，将被规范化`);
};

const warnNumberField = (root: RecordLike, key: string, label: string, warnings: string[]) => {
    if (key in root && !Number.isFinite(Number(root[key]))) addLimited(warnings, `${label} 不是有效数字，将使用默认值`);
};

const warnBooleanField = (root: RecordLike, key: string, label: string, warnings: string[]) => {
    if (key in root && typeof root[key] !== 'boolean') addLimited(warnings, `${label} 不是布尔值，将使用默认值`);
};

const warnEnumField = (
    root: RecordLike,
    key: string,
    label: string,
    allowed: Set<string>,
    warnings: string[]
) => {
    if (key in root && !allowed.has(String(root[key]))) addLimited(warnings, `${label} 无法识别，将使用默认值`);
};

const validateObjectSection = (
    root: RecordLike,
    key: string,
    errors: string[],
    warnings: string[],
    required = false
) => {
    if (!(key in root)) {
        if (required) addLimited(errors, `缺少必要字段 ${key}`);
        return;
    }
    if (!isRecord(root[key])) addLimited(errors, `${key} 必须是对象`);
    else if (Object.keys(root[key]).length === 0) addLimited(warnings, `${key} 为空，将使用默认值补齐`);
};

export function validateImportedConfig(raw: unknown): ConfigImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const summary: ConfigImportValidationSummary = {
        groupCount: 0,
        itemCount: 0,
        siteCount: 0,
        widgetCount: 0,
        sensitiveFields: [],
    };

    if (!isRecord(raw)) {
        return {
            ok: false,
            errors: ['根节点必须是 JSON 对象'],
            warnings,
            summary,
        };
    }

    const knownKeys = KNOWN_CONFIG_KEYS.filter((key) => key in raw);
    const knownPayloadKeys = knownKeys.filter((key) => key !== 'version');
    if (knownPayloadKeys.length === 0) {
        addLimited(errors, '未检测到 VoidTab 配置字段（layout/theme/sync 等）');
    }

    if ('version' in raw && typeof raw.version !== 'number') {
        addLimited(warnings, 'version 不是数字，将按旧版配置尝试迁移');
    }

    validateObjectSection(raw, 'sync', errors, warnings);
    validateObjectSection(raw, 'theme', errors, warnings);
    validateObjectSection(raw, 'ai', errors, warnings);
    validateObjectSection(raw, 'runtime', errors, warnings);

    if (isRecord(raw.sync)) {
        const provider = raw.sync.provider;
        if (provider !== undefined && !SYNC_PROVIDERS.has(String(provider))) {
            addLimited(warnings, 'sync.provider 无法识别，将使用默认 WebDAV 配置补齐');
        }
        warnBooleanField(raw.sync, 'enabled', 'sync.enabled', warnings);
        warnBooleanField(raw.sync, 'autoSync', 'sync.autoSync', warnings);
        warnNumberField(raw.sync, 'lastSyncTime', 'sync.lastSyncTime', warnings);
        warnNumberField(raw.sync, 'intervalMinutes', 'sync.intervalMinutes', warnings);
        warnStringField(raw.sync, 'url', 'sync.url', warnings);
        warnStringField(raw.sync, 'username', 'sync.username', warnings);
        warnStringField(raw.sync, 'password', 'sync.password', warnings);
        warnStringField(raw.sync, 'folder', 'sync.folder', warnings);
        warnStringField(raw.sync, 'filename', 'sync.filename', warnings);
    }

    if (isRecord(raw.theme)) {
        warnEnumField(raw.theme, 'mode', 'theme.mode', THEME_MODES, warnings);
        warnEnumField(raw.theme, 'sidebarPos', 'theme.sidebarPos', SIDEBAR_POSITIONS, warnings);
        warnEnumField(raw.theme, 'density', 'theme.density', DENSITIES, warnings);
        warnEnumField(raw.theme, 'siteLayoutMode', 'theme.siteLayoutMode', SITE_LAYOUT_MODES, warnings);
        warnBooleanField(raw.theme, 'showSidebar', 'theme.showSidebar', warnings);
        warnBooleanField(raw.theme, 'showTime', 'theme.showTime', warnings);
        warnBooleanField(raw.theme, 'showAllGroupsInMain', 'theme.showAllGroupsInMain', warnings);
        warnNumberField(raw.theme, 'iconSize', 'theme.iconSize', warnings);
        warnNumberField(raw.theme, 'radius', 'theme.radius', warnings);
        warnNumberField(raw.theme, 'gap', 'theme.gap', warnings);
        warnNumberField(raw.theme, 'gridMaxWidth', 'theme.gridMaxWidth', warnings);
        if ('siteCard' in raw.theme && !isRecord(raw.theme.siteCard)) addLimited(warnings, 'theme.siteCard 必须是对象，将使用默认值');
        if ('readability' in raw.theme && !isRecord(raw.theme.readability)) addLimited(warnings, 'theme.readability 必须是对象，将使用默认值');
    }

    if ('focusMode' in raw && typeof raw.focusMode !== 'boolean') {
        addLimited(warnings, 'focusMode 不是布尔值，将使用默认值');
    }

    if ('currentEngineId' in raw && typeof raw.currentEngineId !== 'string') {
        addLimited(warnings, 'currentEngineId 不是字符串，将使用默认搜索引擎');
    }

    if (isRecord(raw.ai)) {
        warnStringField(raw.ai, 'baseUrl', 'ai.baseUrl', warnings);
        warnStringField(raw.ai, 'apiKey', 'ai.apiKey', warnings);
        warnStringField(raw.ai, 'model', 'ai.model', warnings);
        warnNumberField(raw.ai, 'temperature', 'ai.temperature', warnings);
        warnNumberField(raw.ai, 'maxHistory', 'ai.maxHistory', warnings);
    }

    if (isRecord(raw.runtime)) {
        if ('auth' in raw.runtime && !isRecord(raw.runtime.auth)) addLimited(warnings, 'runtime.auth 必须是对象，将使用默认值');
        if (isRecord(raw.runtime.auth)) warnStringField(raw.runtime.auth, 'jwtToken', 'runtime.auth.jwtToken', warnings);
        if ('siteIcons' in raw.runtime && !isRecord(raw.runtime.siteIcons)) addLimited(warnings, 'runtime.siteIcons 必须是对象，将使用默认缓存');
        if (isRecord(raw.runtime.siteIcons) && 'records' in raw.runtime.siteIcons && !isRecord(raw.runtime.siteIcons.records)) {
            addLimited(warnings, 'runtime.siteIcons.records 必须是对象，将使用空缓存');
        }
    }

    if ('searchEngines' in raw && !Array.isArray(raw.searchEngines)) {
        addLimited(errors, 'searchEngines 必须是数组');
    } else if (Array.isArray(raw.searchEngines)) {
        if (raw.searchEngines.length === 0) addLimited(warnings, 'searchEngines 为空，将使用默认搜索引擎');
        raw.searchEngines.forEach((engine, engineIndex) => {
            if (!isRecord(engine)) {
                addLimited(errors, `searchEngines[${engineIndex}] 必须是对象`);
                return;
            }
            warnStringField(engine, 'id', `searchEngines[${engineIndex}].id`, warnings);
            warnStringField(engine, 'name', `searchEngines[${engineIndex}].name`, warnings);
            warnStringField(engine, 'url', `searchEngines[${engineIndex}].url`, warnings);
            warnStringField(engine, 'icon', `searchEngines[${engineIndex}].icon`, warnings);
            if (!('url' in engine) || (typeof engine.url === 'string' && !engine.url.trim())) {
                addLimited(warnings, `searchEngines[${engineIndex}].url 为空，导入后可能无法搜索`);
            }
        });
    }

    if (!('layout' in raw)) {
        addLimited(warnings, '未包含 layout，导入后会使用默认分组补齐');
    } else if (!Array.isArray(raw.layout)) {
        addLimited(errors, 'layout 必须是数组');
    } else {
        summary.groupCount = raw.layout.length;
        if (raw.layout.length === 0) addLimited(warnings, 'layout 为空，导入后不会保留分组');

        raw.layout.forEach((group, groupIndex) => {
            if (!isRecord(group)) {
                addLimited(errors, `layout[${groupIndex}] 必须是对象`);
                return;
            }

            warnStringField(group, 'id', `layout[${groupIndex}].id`, warnings);
            warnStringField(group, 'title', `layout[${groupIndex}].title`, warnings);
            warnStringField(group, 'icon', `layout[${groupIndex}].icon`, warnings);
            warnEnumField(group, 'sortKey', `layout[${groupIndex}].sortKey`, GROUP_SORT_KEYS, warnings);

            if ('items' in group && !Array.isArray(group.items)) {
                addLimited(errors, `layout[${groupIndex}].items 必须是数组`);
                return;
            } else if (!('items' in group)) {
                addLimited(warnings, `layout[${groupIndex}].items 缺失，将按空分组导入`);
            }

            const items = Array.isArray(group.items) ? group.items : [];
            summary.itemCount += items.length;

            items.forEach((item, itemIndex) => {
                if (!isRecord(item)) {
                    addLimited(errors, `layout[${groupIndex}].items[${itemIndex}] 必须是对象`);
                    return;
                }

                if ('kind' in item && !ITEM_KINDS.has(String(item.kind))) {
                    addLimited(warnings, `layout[${groupIndex}].items[${itemIndex}].kind 无法识别，将作为站点导入`);
                }

                warnStringField(item, 'id', `layout[${groupIndex}].items[${itemIndex}].id`, warnings);
                warnStringField(item, 'title', `layout[${groupIndex}].items[${itemIndex}].title`, warnings);
                warnStringField(item, 'url', `layout[${groupIndex}].items[${itemIndex}].url`, warnings);
                warnEnumField(item, 'iconType', `layout[${groupIndex}].items[${itemIndex}].iconType`, ICON_TYPES, warnings);
                warnNumberField(item, 'w', `layout[${groupIndex}].items[${itemIndex}].w`, warnings);
                warnNumberField(item, 'h', `layout[${groupIndex}].items[${itemIndex}].h`, warnings);
                warnNumberField(item, 'createdAt', `layout[${groupIndex}].items[${itemIndex}].createdAt`, warnings);

                const isWidget = item.kind === 'widget';
                if (isWidget) summary.widgetCount += 1;
                else summary.siteCount += 1;

                if (isWidget && (item.widgetType === undefined || typeof item.widgetType !== 'string')) {
                    addLimited(warnings, `layout[${groupIndex}].items[${itemIndex}].widgetType 将被规范化`);
                }
                if (!isWidget && (!('url' in item) || (typeof item.url === 'string' && !item.url.trim()))) {
                    addLimited(warnings, `layout[${groupIndex}].items[${itemIndex}].url 为空，导入后会保留为空站点`);
                }
                if ('tags' in item && !Array.isArray(item.tags)) {
                    addLimited(warnings, `layout[${groupIndex}].items[${itemIndex}].tags 必须是数组，将被清理`);
                }
            });
        });
    }

    for (const field of SENSITIVE_FIELD_LABELS) {
        const value = getByPath(raw, field.path);
        if (typeof value === 'string' && value.trim()) summary.sensitiveFields.push(field.label);
    }

    if (summary.sensitiveFields.length > 0) {
        addLimited(warnings, `文件包含敏感字段：${summary.sensitiveFields.join('、')}，导入前请确认来源可信`);
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        summary,
    };
}

export interface ConfigSchemaValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export class ConfigSchemaValidationError extends Error {
    readonly errors: string[];
    readonly warnings: string[];

    constructor(result: ConfigSchemaValidationResult) {
        super(`配置 schema 校验失败：${result.errors.join('；')}`);
        this.name = 'ConfigSchemaValidationError';
        this.errors = result.errors;
        this.warnings = result.warnings;
    }
}

const requireRecordField = (root: RecordLike, key: string, errors: string[]) => {
    if (!isRecord(root[key])) {
        addLimited(errors, `${key} 必须是对象`);
        return null;
    }
    return root[key] as RecordLike;
};

const requireArrayField = (root: RecordLike, key: string, errors: string[]) => {
    if (!Array.isArray(root[key])) {
        addLimited(errors, `${key} 必须是数组`);
        return null;
    }
    return root[key] as unknown[];
};

const requireStringField = (root: RecordLike, key: string, label: string, errors: string[]) => {
    if (typeof root[key] !== 'string') addLimited(errors, `${label} 必须是字符串`);
};

const hasDefinedField = (root: RecordLike, key: string) => root[key] !== undefined;

const requireBooleanField = (root: RecordLike, key: string, label: string, errors: string[]) => {
    if (typeof root[key] !== 'boolean') addLimited(errors, `${label} 必须是布尔值`);
};

const requireNumberField = (root: RecordLike, key: string, label: string, errors: string[]) => {
    if (!Number.isFinite(root[key])) addLimited(errors, `${label} 必须是有效数字`);
};

const requireEnumField = (
    root: RecordLike,
    key: string,
    label: string,
    allowed: Set<string>,
    errors: string[]
) => {
    if (!allowed.has(String(root[key]))) addLimited(errors, `${label} 不在允许范围内`);
};

const validateThemeForSave = (theme: RecordLike, errors: string[]) => {
    requireEnumField(theme, 'mode', 'theme.mode', THEME_MODES, errors);
    requireEnumField(theme, 'sidebarPos', 'theme.sidebarPos', SIDEBAR_POSITIONS, errors);
    requireEnumField(theme, 'density', 'theme.density', DENSITIES, errors);
    requireEnumField(theme, 'siteLayoutMode', 'theme.siteLayoutMode', SITE_LAYOUT_MODES, errors);

    [
        ['accent', 'theme.accent'],
        ['wallpaper', 'theme.wallpaper'],
        ['icon', 'theme.icon'],
        ['customLogoText', 'theme.customLogoText'],
        ['techFontFamily', 'theme.techFontFamily'],
    ].forEach(([key, label]) => requireStringField(theme, key, label, errors));

    [
        ['showSidebar', 'theme.showSidebar'],
        ['showTime', 'theme.showTime'],
        ['techFont', 'theme.techFont'],
        ['breathingLight', 'theme.breathingLight'],
        ['neonGlow', 'theme.neonGlow'],
        ['showIconName', 'theme.showIconName'],
        ['showWidgetName', 'theme.showWidgetName'],
        ['showLogoText', 'theme.showLogoText'],
        ['showGroupCount', 'theme.showGroupCount'],
        ['enableHistory', 'theme.enableHistory'],
        ['enableTerminal', 'theme.enableTerminal'],
        ['showAllGroupsInMain', 'theme.showAllGroupsInMain'],
    ].forEach(([key, label]) => requireBooleanField(theme, key, label, errors));

    [
        ['gridMaxWidth', 'theme.gridMaxWidth'],
        ['blur', 'theme.blur'],
        ['opacity', 'theme.opacity'],
        ['iconSize', 'theme.iconSize'],
        ['radius', 'theme.radius'],
        ['gap', 'theme.gap'],
        ['iconTextSize', 'theme.iconTextSize'],
        ['breathingDuration', 'theme.breathingDuration'],
    ].forEach(([key, label]) => requireNumberField(theme, key, label, errors));

    const siteCard = requireRecordField(theme, 'siteCard', errors);
    if (siteCard) {
        requireNumberField(siteCard, 'w', 'theme.siteCard.w', errors);
        requireNumberField(siteCard, 'h', 'theme.siteCard.h', errors);
        requireBooleanField(siteCard, 'showRemark', 'theme.siteCard.showRemark', errors);
        requireBooleanField(siteCard, 'showDomain', 'theme.siteCard.showDomain', errors);
    }

    const readability = requireRecordField(theme, 'readability', errors);
    if (readability) {
        requireBooleanField(readability, 'enabled', 'theme.readability.enabled', errors);
        requireEnumField(readability, 'mode', 'theme.readability.mode', new Set(['auto', 'darken', 'lighten']), errors);
        requireNumberField(readability, 'strength', 'theme.readability.strength', errors);
        requireNumberField(readability, 'blur', 'theme.readability.blur', errors);
        requireNumberField(readability, 'desaturate', 'theme.readability.desaturate', errors);
        if (hasDefinedField(readability, 'tint') && typeof readability.tint !== 'string') {
            addLimited(errors, 'theme.readability.tint 必须是字符串');
        }
    }
};

const validateLayoutForSave = (layout: unknown[], errors: string[]) => {
    layout.forEach((group, groupIndex) => {
        if (!isRecord(group)) {
            addLimited(errors, `layout[${groupIndex}] 必须是对象`);
            return;
        }

        requireStringField(group, 'id', `layout[${groupIndex}].id`, errors);
        requireStringField(group, 'title', `layout[${groupIndex}].title`, errors);
        requireStringField(group, 'icon', `layout[${groupIndex}].icon`, errors);
        if (hasDefinedField(group, 'sortKey')) requireEnumField(group, 'sortKey', `layout[${groupIndex}].sortKey`, GROUP_SORT_KEYS, errors);

        if (!Array.isArray(group.items)) {
            addLimited(errors, `layout[${groupIndex}].items 必须是数组`);
            return;
        }

        group.items.forEach((item, itemIndex) => {
            const itemPath = `layout[${groupIndex}].items[${itemIndex}]`;
            if (!isRecord(item)) {
                addLimited(errors, `${itemPath} 必须是对象`);
                return;
            }

            requireStringField(item, 'id', `${itemPath}.id`, errors);
            if (hasDefinedField(item, 'kind')) requireEnumField(item, 'kind', `${itemPath}.kind`, ITEM_KINDS, errors);
            if (hasDefinedField(item, 'title')) requireStringField(item, 'title', `${itemPath}.title`, errors);
            if (hasDefinedField(item, 'url')) requireStringField(item, 'url', `${itemPath}.url`, errors);
            if (hasDefinedField(item, 'iconType')) requireEnumField(item, 'iconType', `${itemPath}.iconType`, ICON_TYPES, errors);
            if (hasDefinedField(item, 'iconValue')) requireStringField(item, 'iconValue', `${itemPath}.iconValue`, errors);
            if (hasDefinedField(item, 'bgColor')) requireStringField(item, 'bgColor', `${itemPath}.bgColor`, errors);
            if (hasDefinedField(item, 'remark')) requireStringField(item, 'remark', `${itemPath}.remark`, errors);
            if (hasDefinedField(item, 'widgetType')) requireStringField(item, 'widgetType', `${itemPath}.widgetType`, errors);
            if (hasDefinedField(item, 'w')) requireNumberField(item, 'w', `${itemPath}.w`, errors);
            if (hasDefinedField(item, 'h')) requireNumberField(item, 'h', `${itemPath}.h`, errors);
            if (hasDefinedField(item, 'createdAt')) requireNumberField(item, 'createdAt', `${itemPath}.createdAt`, errors);
            if (hasDefinedField(item, 'tags') && !Array.isArray(item.tags)) addLimited(errors, `${itemPath}.tags 必须是数组`);
            if (hasDefinedField(item, 'widgetConfig') && !isRecord(item.widgetConfig)) addLimited(errors, `${itemPath}.widgetConfig 必须是对象`);
        });
    });
};

const validateRuntimeForSave = (runtime: RecordLike, errors: string[]) => {
    ['cron', 'auth', 'terminal_buffer', 'siteState', 'siteIcons', 'widgets', 'widgetState', 'photo', 'siteList', 'terminal']
        .forEach((key) => {
            if (!isRecord(runtime[key])) addLimited(errors, `runtime.${key} 必须是对象`);
        });

    if (isRecord(runtime.auth)) requireStringField(runtime.auth, 'jwtToken', 'runtime.auth.jwtToken', errors);

    if (isRecord(runtime.siteIcons)) {
        requireNumberField(runtime.siteIcons, 'version', 'runtime.siteIcons.version', errors);
        if (!isRecord(runtime.siteIcons.records)) addLimited(errors, 'runtime.siteIcons.records 必须是对象');
    }

    if (isRecord(runtime.terminal)) {
        if (!Array.isArray(runtime.terminal.history)) addLimited(errors, 'runtime.terminal.history 必须是数组');
        requireEnumField(runtime.terminal, 'theme', 'runtime.terminal.theme', TERMINAL_THEMES, errors);
        requireBooleanField(runtime.terminal, 'isOpen', 'runtime.terminal.isOpen', errors);
    }

    if (isRecord(runtime.terminal_buffer)) {
        requireStringField(runtime.terminal_buffer, 'buffer', 'runtime.terminal_buffer.buffer', errors);
        requireStringField(runtime.terminal_buffer, 'theme', 'runtime.terminal_buffer.theme', errors);
        requireStringField(runtime.terminal_buffer, 'activeCategory', 'runtime.terminal_buffer.activeCategory', errors);
        if (!Array.isArray(runtime.terminal_buffer.categories)) addLimited(errors, 'runtime.terminal_buffer.categories 必须是数组');
        if (!Array.isArray(runtime.terminal_buffer.notes)) addLimited(errors, 'runtime.terminal_buffer.notes 必须是数组');
        if ('commands' in runtime.terminal_buffer && !Array.isArray(runtime.terminal_buffer.commands)) {
            addLimited(errors, 'runtime.terminal_buffer.commands 必须是数组');
        }
    }
};

export function validateConfigForSave(raw: unknown): ConfigSchemaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isRecord(raw)) {
        return {ok: false, errors: ['根节点必须是 JSON 对象'], warnings};
    }

    requireNumberField(raw, 'version', 'version', errors);
    requireStringField(raw, 'currentEngineId', 'currentEngineId', errors);
    requireBooleanField(raw, 'focusMode', 'focusMode', errors);

    const sync = requireRecordField(raw, 'sync', errors);
    const theme = requireRecordField(raw, 'theme', errors);
    const ai = requireRecordField(raw, 'ai', errors);
    const runtime = requireRecordField(raw, 'runtime', errors);
    const layout = requireArrayField(raw, 'layout', errors);
    const searchEngines = requireArrayField(raw, 'searchEngines', errors);

    if (sync) {
        requireEnumField(sync, 'provider', 'sync.provider', SYNC_PROVIDERS, errors);
        requireBooleanField(sync, 'enabled', 'sync.enabled', errors);
        requireBooleanField(sync, 'autoSync', 'sync.autoSync', errors);
        requireNumberField(sync, 'lastSyncTime', 'sync.lastSyncTime', errors);
        requireNumberField(sync, 'intervalMinutes', 'sync.intervalMinutes', errors);
        ['url', 'username', 'password', 'folder', 'filename'].forEach((key) => {
            if (key in sync) requireStringField(sync, key, `sync.${key}`, errors);
        });
    }

    if (theme) validateThemeForSave(theme, errors);

    if (ai) {
        requireStringField(ai, 'baseUrl', 'ai.baseUrl', errors);
        requireStringField(ai, 'apiKey', 'ai.apiKey', errors);
        requireStringField(ai, 'model', 'ai.model', errors);
        requireNumberField(ai, 'temperature', 'ai.temperature', errors);
        requireNumberField(ai, 'maxHistory', 'ai.maxHistory', errors);
    }

    if (runtime) validateRuntimeForSave(runtime, errors);
    if (layout) validateLayoutForSave(layout, errors);

    if (searchEngines) {
        if (searchEngines.length === 0) addLimited(errors, 'searchEngines 不能为空');
        searchEngines.forEach((engine, index) => {
            if (!isRecord(engine)) {
                addLimited(errors, `searchEngines[${index}] 必须是对象`);
                return;
            }
            requireStringField(engine, 'id', `searchEngines[${index}].id`, errors);
            requireStringField(engine, 'name', `searchEngines[${index}].name`, errors);
            requireStringField(engine, 'url', `searchEngines[${index}].url`, errors);
            requireStringField(engine, 'icon', `searchEngines[${index}].icon`, errors);
        });
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
    };
}

export function assertConfigValidForSave(raw: unknown): asserts raw is Config {
    const result = validateConfigForSave(raw);
    if (!result.ok) throw new ConfigSchemaValidationError(result);
}

export function createImportValidationMessages(result: ConfigImportValidationResult): string[] {
    const messages = [
        '导入操作将完全覆盖您当前的本地设置。',
        `已完成 schema 检查：检测到 ${result.summary.groupCount} 个分组、${result.summary.siteCount} 个站点、${result.summary.widgetCount} 个组件。`,
        '旧版字段会自动迁移和规范化；缺失的可选字段会使用默认值补齐。',
    ];

    if (result.warnings.length > 0) {
        messages.push(`提示：${result.warnings.slice(0, 2).join('；')}`);
    }

    messages.push('建议先导出当前 JSON 备份。');
    return messages;
}
