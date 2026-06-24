import type {TileDefinition, TileInstance, TileStyleOverride, TileStyleableToken} from './contracts.ts';

const STYLEABLE_TOKENS: TileStyleableToken[] = [
    'radius',
    'accent',
    'surface',
    'iconScale',
    'density',
    'elevation',
];

const DENSITIES: Array<NonNullable<TileStyleOverride['density']>> = ['compact', 'normal', 'comfortable'];

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_VAR_COLOR_RE = /^var\(--[a-zA-Z0-9-_]+\)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
};

const normalizeColor = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const color = value.trim();
    if (!color) return undefined;
    if (HEX_COLOR_RE.test(color) || CSS_VAR_COLOR_RE.test(color)) return color;
    return undefined;
};

const normalizeToken = (token: TileStyleableToken, value: unknown): TileStyleOverride[TileStyleableToken] => {
    switch (token) {
        case 'radius':
            return Math.round(clampNumber(value, 0, 36, 18));
        case 'accent':
        case 'surface':
            return normalizeColor(value);
        case 'iconScale':
            return Math.round(clampNumber(value, 0.7, 1.45, 1) * 100) / 100;
        case 'density':
            return DENSITIES.includes(value as NonNullable<TileStyleOverride['density']>)
                ? value as TileStyleOverride['density']
                : undefined;
        case 'elevation': {
            const next = Math.round(clampNumber(value, 0, 3, 1));
            return (next === 0 || next === 1 || next === 2 || next === 3) ? next : undefined;
        }
        default:
            return undefined;
    }
};

export function getTileStyleableTokens(definition?: Pick<TileDefinition, 'styleable'> | null): TileStyleableToken[] {
    const raw = definition?.styleable;
    if (!Array.isArray(raw) || raw.length === 0) return [...STYLEABLE_TOKENS];
    const allowed = raw.filter((token): token is TileStyleableToken =>
        STYLEABLE_TOKENS.includes(token as TileStyleableToken),
    );
    return allowed.length ? [...new Set(allowed)] : [...STYLEABLE_TOKENS];
}

export function normalizeTileStyleOverride(
    raw: unknown,
    definition?: Pick<TileDefinition, 'styleable'> | null,
): TileStyleOverride | undefined {
    if (!isRecord(raw)) return undefined;
    const allowed = new Set(getTileStyleableTokens(definition));
    const next: TileStyleOverride = {};

    for (const token of STYLEABLE_TOKENS) {
        if (!allowed.has(token) || !(token in raw)) continue;
        const normalized = normalizeToken(token, raw[token]);
        if (normalized === undefined) continue;
        (next as Record<TileStyleableToken, TileStyleOverride[TileStyleableToken]>)[token] = normalized;
    }

    return Object.keys(next).length ? next : undefined;
}

export function applyTileStyleOverride(
    tile: TileInstance,
    raw: unknown,
    definition?: Pick<TileDefinition, 'styleable'> | null,
) {
    const next = normalizeTileStyleOverride(raw, definition);
    if (next) tile.styleOverride = next;
    else delete tile.styleOverride;
}

export function resetTileStyleOverride(tile: TileInstance) {
    delete tile.styleOverride;
}

export function tileStyleOverrideToCssVars(styleOverride?: TileStyleOverride): Record<string, string> {
    if (!styleOverride) return {};
    const vars: Record<string, string> = {};
    if (typeof styleOverride.radius === 'number') vars['--tile-radius'] = `${styleOverride.radius}px`;
    if (styleOverride.accent) {
        vars['--tile-accent'] = styleOverride.accent;
        vars['--tile-accent-color'] = styleOverride.accent;
    }
    if (styleOverride.surface) vars['--tile-surface'] = styleOverride.surface;
    if (typeof styleOverride.iconScale === 'number') vars['--tile-icon-scale'] = String(styleOverride.iconScale);
    if (typeof styleOverride.elevation === 'number') vars['--tile-elevation'] = String(styleOverride.elevation);
    if (styleOverride.density) vars['--tile-density'] = styleOverride.density;
    return vars;
}

export const tileStylePresets = {
    clean: {radius: 14, elevation: 0, iconScale: 0.94, density: 'compact'} satisfies TileStyleOverride,
    soft: {radius: 24, elevation: 1, iconScale: 1, density: 'normal'} satisfies TileStyleOverride,
    vivid: {radius: 20, elevation: 2, iconScale: 1.12, density: 'comfortable'} satisfies TileStyleOverride,
} as const;
