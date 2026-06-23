import type {LayoutProfileId, WorkspaceLayout, WorkspaceLayoutProfile} from './contracts.ts';

export const MAX_TILE_SPAN = 16;

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
    mode: 'flow',
    profiles: {
        desktop: {unit: 96, gap: 16, minCols: 4, maxCols: 14},
        tablet: {unit: 88, gap: 16, minCols: 5, maxCols: 8},
        mobile: {unit: 76, gap: 12, minCols: 3, maxCols: 4},
    },
};

export interface GridMetrics {
    profile: LayoutProfileId;
    unit: number;
    gap: number;
    cols: number;
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
};

export const cloneDefaultWorkspaceLayout = (): WorkspaceLayout => JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_LAYOUT)) as WorkspaceLayout;

export function resolveLayoutProfileId(availableWidth: number, isMobile: boolean): LayoutProfileId {
    if (isMobile || availableWidth < 768) return 'mobile';
    if (availableWidth < 1080) return 'tablet';
    return 'desktop';
}

export function normalizeWorkspaceLayoutProfile(
    raw: Partial<WorkspaceLayoutProfile> | undefined,
    fallback: WorkspaceLayoutProfile,
): WorkspaceLayoutProfile {
    const minCols = clampInt(raw?.minCols, 1, MAX_TILE_SPAN, fallback.minCols);
    const maxCols = clampInt(raw?.maxCols, minCols, MAX_TILE_SPAN, fallback.maxCols ?? MAX_TILE_SPAN);
    return {
        unit: clampInt(raw?.unit, 48, 160, fallback.unit),
        gap: clampInt(raw?.gap, 0, 48, fallback.gap),
        minCols,
        maxCols,
    };
}

export function normalizeWorkspaceLayout(raw: unknown): WorkspaceLayout {
    const candidate = raw && typeof raw === 'object' ? raw as Partial<WorkspaceLayout> : {};
    const profiles = candidate.profiles && typeof candidate.profiles === 'object'
        ? candidate.profiles
        : {};
    return {
        mode: candidate.mode === 'canvas' ? 'canvas' : 'flow',
        profiles: {
            desktop: normalizeWorkspaceLayoutProfile(profiles.desktop, DEFAULT_WORKSPACE_LAYOUT.profiles.desktop!),
            tablet: normalizeWorkspaceLayoutProfile(profiles.tablet, DEFAULT_WORKSPACE_LAYOUT.profiles.tablet!),
            mobile: normalizeWorkspaceLayoutProfile(profiles.mobile, DEFAULT_WORKSPACE_LAYOUT.profiles.mobile!),
        },
    };
}

export function getGridMetrics(
    availableWidth: number,
    profile: LayoutProfileId,
    workspaceLayout?: WorkspaceLayout,
    mobileMaxCols?: number,
    legacyProfileOverride?: Partial<WorkspaceLayoutProfile>,
): GridMetrics {
    const fallback = normalizeWorkspaceLayoutProfile(
        legacyProfileOverride,
        DEFAULT_WORKSPACE_LAYOUT.profiles[profile]!,
    );
    const normalized = workspaceLayout ? normalizeWorkspaceLayout(workspaceLayout) : undefined;
    const spec = normalized?.profiles[profile] || fallback;
    const maxCols = profile === 'mobile' && mobileMaxCols
        ? Math.min(spec.maxCols ?? mobileMaxCols, mobileMaxCols)
        : spec.maxCols ?? MAX_TILE_SPAN;
    const rawCols = Math.floor((Math.max(0, availableWidth) + spec.gap) / (spec.unit + spec.gap));
    return {
        profile,
        unit: spec.unit,
        gap: spec.gap,
        cols: Math.max(spec.minCols, Math.min(Math.max(spec.minCols, rawCols), maxCols)),
    };
}

export function measureTilePixels(w: number, h: number, metrics: Pick<GridMetrics, 'unit' | 'gap'>) {
    const width = w * metrics.unit + (w - 1) * metrics.gap;
    const height = h * metrics.unit + (h - 1) * metrics.gap;
    return {width, height};
}
