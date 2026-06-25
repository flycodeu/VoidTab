import {widgetRegistry, type WidgetMeta} from '../registry/widgets.ts';
import type {
    BuiltinTileDefinition,
    BuiltinTileId,
    TileCompatibility,
    TileDefinition,
    TileInstallRecord,
    TileType,
} from './contracts.ts';
import {createDeclarativeTileDefinitionFromInstall} from './declarativePackage.ts';
import {createUnsupportedExternalTileDefinition} from './externalDefinition.ts';
import {MAX_TILE_SPAN} from './gridMetrics.ts';
import {createSandboxTileDefinitionFromInstall} from './sandboxPackage.ts';
import {
    isExternalTileType,
    SITE_TILE_TYPE,
    toBuiltinTileType,
} from './tileType.ts';

const BUILTIN_COMPATIBILITY: TileCompatibility = {
    targets: ['web', 'extension'],
    minHostVersion: '1.0.0',
    mobileSupport: 'full',
};

const DEFAULT_TILE_STYLEABLE: BuiltinTileDefinition['styleable'] = [
    'radius',
    'accent',
    'surface',
    'iconScale',
    'density',
    'elevation',
];

const createWidgetDefinition = (widget: WidgetMeta): BuiltinTileDefinition => ({
    id: toBuiltinTileType(widget.type),
    source: 'builtin',
    label: widget.label,
    description: widget.description,
    icon: widget.icon,
    category: widget.category,
    sizes: {
        default: {w: widget.defaultW, h: widget.defaultH},
        min: {w: 1, h: 1},
        max: {w: MAX_TILE_SPAN, h: MAX_TILE_SPAN},
    },
    styleable: DEFAULT_TILE_STYLEABLE,
    compatibility: BUILTIN_COMPATIBILITY,
    renderer: {kind: 'widget', widgetType: widget.type},
});

const builtinTileTypes = new Map<string, BuiltinTileDefinition>();

export function registerBuiltinTileType(definition: BuiltinTileDefinition) {
    builtinTileTypes.set(definition.id, definition);
}

registerBuiltinTileType({
    id: SITE_TILE_TYPE,
    source: 'builtin',
    label: '网站',
    description: '指向网页或内部页面的快捷入口。',
    icon: 'Globe',
    category: 'navigation',
    sizes: {
        default: {w: 1, h: 1},
        min: {w: 1, h: 1},
        max: {w: MAX_TILE_SPAN, h: MAX_TILE_SPAN},
    },
    styleable: DEFAULT_TILE_STYLEABLE,
    compatibility: BUILTIN_COMPATIBILITY,
    renderer: {kind: 'site'},
});

for (const widget of widgetRegistry) registerBuiltinTileType(createWidgetDefinition(widget));

export function getBuiltinTileDefinition(id: string) {
    return builtinTileTypes.get(id);
}

/** P3.1 canonical registry entry point. External package execution remains disabled. */
export function resolveBuiltinTileDefinition(tileType: BuiltinTileId): BuiltinTileDefinition {
    if (tileType === SITE_TILE_TYPE) return builtinTileTypes.get(SITE_TILE_TYPE)!;
    const definition = builtinTileTypes.get(tileType);
    if (!definition) throw new Error('Missing builtin tile definition: ' + tileType);
    return definition;
}

/** Resolve canonical IDs without executing external code. Declarative packages are inert JSON views. */
export function resolveTileDefinition(
    tileType: TileType,
    installs?: Record<string, TileInstallRecord>,
): TileDefinition {
    if (isExternalTileType(tileType)) {
        const declarative = installs?.[tileType]
            ? createDeclarativeTileDefinitionFromInstall(installs[tileType])
            : null;
        const sandbox = installs?.[tileType]
            ? createSandboxTileDefinitionFromInstall(installs[tileType])
            : null;
        return declarative || sandbox || createUnsupportedExternalTileDefinition(tileType);
    }
    if (tileType === SITE_TILE_TYPE) return resolveBuiltinTileDefinition(tileType);
    return builtinTileTypes.get(tileType) || createUnsupportedExternalTileDefinition(tileType);
}

export function listBuiltinTileDefinitions() {
    return [...builtinTileTypes.values()];
}

export function listDeclarativeTileDefinitions(installs: Record<string, TileInstallRecord> = {}) {
    return Object.values(installs)
        .map(createDeclarativeTileDefinitionFromInstall)
        .filter((definition): definition is NonNullable<ReturnType<typeof createDeclarativeTileDefinitionFromInstall>> => !!definition);
}

export function listSandboxTileDefinitions(installs: Record<string, TileInstallRecord> = {}) {
    return Object.values(installs)
        .map(createSandboxTileDefinitionFromInstall)
        .filter((definition): definition is NonNullable<ReturnType<typeof createSandboxTileDefinitionFromInstall>> => !!definition);
}
