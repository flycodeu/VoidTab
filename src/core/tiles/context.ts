import {computed, inject, provide, type ComputedRef, type InjectionKey} from 'vue';
import type {GridPlacement, TileRuntimeContext, TileSizeContext} from './contracts.ts';

export type TileRuntimeContextRef = ComputedRef<TileRuntimeContext>;

export const tileRuntimeContextKey: InjectionKey<TileRuntimeContextRef> = Symbol('VoidTabTileRuntimeContext');

export function provideTileRuntimeContext(context: TileRuntimeContextRef) {
    provide(tileRuntimeContextKey, context);
}

export function useTileRuntimeContext() {
    return inject(tileRuntimeContextKey, null);
}

const normalizePlacement = (placement?: Partial<GridPlacement>): GridPlacement => ({
    x: Math.max(0, Math.round(Number(placement?.x ?? 0))),
    y: Math.max(0, Math.round(Number(placement?.y ?? 0))),
    w: Math.max(1, Math.round(Number(placement?.w ?? 1))),
    h: Math.max(1, Math.round(Number(placement?.h ?? 1))),
});

export function createFallbackTileSizeContext(placement?: Partial<GridPlacement>): TileSizeContext {
    const normalized = normalizePlacement(placement);
    return {
        profile: 'desktop',
        cols: Math.max(1, normalized.w),
        unit: 0,
        gap: 0,
        placement: normalized,
        width: 0,
        height: 0,
        breakpoint: normalized.w <= 1 && normalized.h <= 1 ? 'mini' : 'normal',
    };
}

export function useTileSizeContext(fallback?: () => Partial<GridPlacement> | undefined) {
    const context = useTileRuntimeContext();
    return computed(() => context?.value.size || createFallbackTileSizeContext(fallback?.()));
}
