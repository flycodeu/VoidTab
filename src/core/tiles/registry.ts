import {widgetRegistry, type WidgetMeta} from '../registry/widgets.ts';
import type {
    BuiltinTileDefinition,
    BuiltinTileId,
    TileCompatibility,
    TileDefinition,
    TileType,
} from './contracts.ts';
import {createUnsupportedExternalTileDefinition} from './externalDefinition.ts';
import {MAX_TILE_SPAN} from './gridMetrics.ts';
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

/** Resolve canonical IDs without ever executing an external tile package. */
export function resolveTileDefinition(tileType: TileType): TileDefinition {
    if (isExternalTileType(tileType)) return createUnsupportedExternalTileDefinition(tileType);
    if (tileType === SITE_TILE_TYPE) return resolveBuiltinTileDefinition(tileType);
    return builtinTileTypes.get(tileType) || createUnsupportedExternalTileDefinition(tileType);
}

export function listBuiltinTileDefinitions() {
    return [...builtinTileTypes.values()];
}
