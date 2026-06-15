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
