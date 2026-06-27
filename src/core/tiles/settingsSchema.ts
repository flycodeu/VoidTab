import type {JsonValue} from './contracts.ts';

export type TileSettingsFieldType = 'string' | 'number' | 'boolean' | 'select';

export interface TileSettingsField {
    key: string;
    label: string;
    description?: string;
    type: TileSettingsFieldType;
    defaultValue: JsonValue;
    required: boolean;
    enum?: JsonValue[];
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
}

export interface TileSettingsIssue {
    path: string;
    message: string;
    severity: 'warning' | 'error';
}

export interface TileSettingsNormalizationResult {
    settings: Record<string, JsonValue>;
    issues: TileSettingsIssue[];
    changed: boolean;
}

export interface TileSettingsMigrationResult extends TileSettingsNormalizationResult {
    migrated: boolean;
    renamed: Array<{from: string; to: string}>;
    removed: string[];
    added: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const valuesEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const schemaType = (schema: Record<string, unknown>) => {
    if (schema.type === 'integer') return 'number';
    return typeof schema.type === 'string' ? schema.type : undefined;
};

const labelFor = (key: string, schema: Record<string, unknown>) =>
    typeof schema.title === 'string' && schema.title.trim() ? schema.title.trim() : key;

const descriptionFor = (schema: Record<string, unknown>) =>
    typeof schema.description === 'string' && schema.description.trim() ? schema.description.trim() : undefined;

function defaultForSchema(schema: Record<string, unknown>): JsonValue {
    if ('default' in schema && isJsonSafe(schema.default)) return cloneJson(schema.default);
    const type = schemaType(schema);
    if (type === 'boolean') return false;
    if (type === 'number') return 0;
    if (type === 'array') return [];
    if (type === 'object') return {};
    return '';
}

function normalizeNumber(value: unknown, schema: Record<string, unknown>, fallback: JsonValue) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const min = typeof schema.minimum === 'number' ? schema.minimum : -Number.MAX_SAFE_INTEGER;
    const max = typeof schema.maximum === 'number' ? schema.maximum : Number.MAX_SAFE_INTEGER;
    const rounded = schema.type === 'integer' ? Math.round(numeric) : numeric;
    return Math.max(min, Math.min(max, rounded));
}

function normalizeKnownValue(
    key: string,
    value: unknown,
    schema: Record<string, unknown>,
    fallback: JsonValue,
    issues: TileSettingsIssue[],
): JsonValue {
    const allowed = Array.isArray(schema.enum)
        ? schema.enum.filter(isJsonSafe).map((item) => cloneJson(item))
        : undefined;
    if (allowed?.length) {
        const matched = allowed.find((item) => valuesEqual(item, value));
        if (matched !== undefined) return cloneJson(matched);
        issues.push({path: key, message: `${key} 不在允许选项中，已回退默认值`, severity: 'warning'});
        return cloneJson(fallback);
    }

    const type = schemaType(schema);
    if (type === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === '1') return true;
        if (value === 'false' || value === '0') return false;
        issues.push({path: key, message: `${key} 需要布尔值，已回退默认值`, severity: 'warning'});
        return cloneJson(fallback);
    }
    if (type === 'number') {
        const normalized = normalizeNumber(value, schema, fallback);
        if (typeof normalized !== 'number') {
            issues.push({path: key, message: `${key} 需要数字，已回退默认值`, severity: 'warning'});
        }
        return normalized;
    }
    if (type === 'string' || type === undefined) {
        if (typeof value === 'string') {
            const maxLength = typeof schema.maxLength === 'number' ? Math.max(0, Math.round(schema.maxLength)) : undefined;
            return maxLength !== undefined ? value.slice(0, maxLength) : value;
        }
        if (value === null || value === undefined) return cloneJson(fallback);
        return String(value);
    }
    if (type === 'array') {
        if (Array.isArray(value) && isJsonSafe(value)) return cloneJson(value);
        issues.push({path: key, message: `${key} 需要数组，已回退默认值`, severity: 'warning'});
        return cloneJson(fallback);
    }
    if (type === 'object') {
        if (isRecord(value) && isJsonSafe(value)) return cloneJson(value);
        issues.push({path: key, message: `${key} 需要对象，已回退默认值`, severity: 'warning'});
        return cloneJson(fallback);
    }
    return isJsonSafe(value) ? cloneJson(value) : cloneJson(fallback);
}

function schemaProperties(rawSchema: unknown): Record<string, Record<string, unknown>> {
    const schema = isRecord(rawSchema) ? rawSchema : {};
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(properties)) {
        if (!isRecord(value) || !key.trim()) continue;
        out[key] = value;
    }
    return out;
}

export function extractDefaultSettingsFromSchema(rawSchema: unknown): Record<string, JsonValue> {
    const defaults: Record<string, JsonValue> = {};
    for (const [key, schema] of Object.entries(schemaProperties(rawSchema))) {
        defaults[key] = defaultForSchema(schema);
    }
    return defaults;
}

export function listSettingsSchemaFields(rawSchema: unknown): TileSettingsField[] {
    const schema = isRecord(rawSchema) ? rawSchema : {};
    const required = new Set(Array.isArray(schema.required)
        ? schema.required.filter((entry): entry is string => typeof entry === 'string')
        : []);
    const fields: TileSettingsField[] = [];

    for (const [key, propertySchema] of Object.entries(schemaProperties(rawSchema))) {
        const allowed = Array.isArray(propertySchema.enum)
            ? propertySchema.enum.filter(isJsonSafe).map((item) => cloneJson(item))
            : undefined;
        const type = allowed?.length
            ? 'select'
            : schemaType(propertySchema) === 'boolean'
                ? 'boolean'
                : schemaType(propertySchema) === 'number'
                    ? 'number'
                    : schemaType(propertySchema) === 'integer'
                        ? 'number'
                        : schemaType(propertySchema) === 'string' || schemaType(propertySchema) === undefined
                            ? 'string'
                            : null;
        if (!type) continue;
        fields.push({
            key,
            label: labelFor(key, propertySchema),
            ...(descriptionFor(propertySchema) ? {description: descriptionFor(propertySchema)} : {}),
            type,
            defaultValue: defaultForSchema(propertySchema),
            required: required.has(key),
            ...(allowed?.length ? {enum: allowed} : {}),
            ...(typeof propertySchema.minimum === 'number' ? {min: propertySchema.minimum} : {}),
            ...(typeof propertySchema.maximum === 'number' ? {max: propertySchema.maximum} : {}),
            ...(typeof propertySchema.multipleOf === 'number' ? {step: propertySchema.multipleOf} : {}),
            ...(typeof propertySchema.maxLength === 'number' ? {maxLength: Math.round(propertySchema.maxLength)} : {}),
        });
    }

    return fields;
}

export function normalizeTileSettingsWithSchema(
    rawSettings: unknown,
    rawSchema: unknown,
    options: {
        defaults?: Record<string, JsonValue>;
        preserveUnknown?: boolean;
    } = {},
): TileSettingsNormalizationResult {
    const schema = isRecord(rawSchema) ? rawSchema : {};
    const properties = schemaProperties(schema);
    const defaults = {
        ...extractDefaultSettingsFromSchema(schema),
        ...(options.defaults || {}),
    };
    const input = isRecord(rawSettings) ? rawSettings : {};
    const preserveUnknown = options.preserveUnknown ?? schema.additionalProperties !== false;
    const issues: TileSettingsIssue[] = [];
    const settings: Record<string, JsonValue> = {};

    if (preserveUnknown) {
        for (const [key, value] of Object.entries(input)) {
            if (properties[key]) continue;
            if (isJsonSafe(value)) settings[key] = cloneJson(value);
        }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
        const fallback = key in defaults ? defaults[key] : defaultForSchema(propertySchema);
        const hasValue = Object.prototype.hasOwnProperty.call(input, key);
        const normalized = hasValue
            ? normalizeKnownValue(key, input[key], propertySchema, fallback, issues)
            : cloneJson(fallback);
        settings[key] = normalized;
    }

    const changed = !valuesEqual(settings, input);
    return {settings, issues, changed};
}

export function migrateTileSettingsAcrossSchemaVersions(
    rawSettings: unknown,
    previousSchema: unknown,
    nextSchema: unknown,
    options: {
        defaults?: Record<string, JsonValue>;
        preserveUnknown?: boolean;
    } = {},
): TileSettingsMigrationResult {
    const previousProperties = schemaProperties(previousSchema);
    const next = isRecord(nextSchema) ? nextSchema : {};
    const nextProperties = schemaProperties(next);
    const input = isRecord(rawSettings) ? rawSettings : {};
    const working: Record<string, unknown> = {};
    const renamed: Array<{from: string; to: string}> = [];

    for (const [key, value] of Object.entries(input)) working[key] = value;

    const aliases = isRecord(next['x-voidtab-aliases']) ? next['x-voidtab-aliases'] : {};
    for (const [from, to] of Object.entries(aliases)) {
        if (typeof to !== 'string' || !nextProperties[to]) continue;
        if (!Object.prototype.hasOwnProperty.call(input, from)) continue;
        if (Object.prototype.hasOwnProperty.call(working, to)) continue;
        working[to] = input[from];
        renamed.push({from, to});
    }

    for (const [to, propertySchema] of Object.entries(nextProperties)) {
        const fromList = Array.isArray(propertySchema['x-voidtab-from'])
            ? propertySchema['x-voidtab-from']
            : typeof propertySchema['x-voidtab-from'] === 'string'
                ? [propertySchema['x-voidtab-from']]
                : [];
        for (const from of fromList) {
            if (typeof from !== 'string' || !Object.prototype.hasOwnProperty.call(input, from)) continue;
            if (Object.prototype.hasOwnProperty.call(working, to)) continue;
            working[to] = input[from];
            renamed.push({from, to});
            break;
        }
    }

    const normalized = normalizeTileSettingsWithSchema(working, nextSchema, options);
    const outputKeys = new Set(Object.keys(normalized.settings));
    const inputKeys = new Set(Object.keys(input));
    const previousKeys = new Set(Object.keys(previousProperties));
    const removed = [...inputKeys].filter((key) => !outputKeys.has(key) && (previousKeys.has(key) || !(options.preserveUnknown ?? next.additionalProperties !== false)));
    const added = [...outputKeys].filter((key) => !inputKeys.has(key));
    return {
        ...normalized,
        migrated: normalized.changed || renamed.length > 0 || removed.length > 0 || added.length > 0,
        renamed,
        removed,
        added,
    };
}
