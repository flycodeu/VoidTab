import type {Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import type {TileInstance, TileSize} from '../../core/tiles/contracts.ts';
import {getWidgetLabel, getWidgetMeta} from '../../core/registry/widgets';
import {resolveTileDefinition} from '../../core/tiles/registry.ts';
import {clampInt, MAX_WIDGET_H, MAX_WIDGET_W} from './helpers';
import {
    createComponentTile,
    findTile,
    findWorkspace,
    getLegacyWidgetType,
    getTileDesktopSize,
    getTileTitle,
    getWorkspaceTiles,
    isComponentTile,
    setTileTitle,
    setTileSize,
} from '../../core/tiles/tileAccess.ts';

export const createLayoutActions = (
    config: Ref<ConfigV6>,
    saveConfig: () => Promise<void>
) => {
    const createUniqueWidgetId = () => {
        const existing = new Set(config.value.layout.flatMap((group) => group.tiles.map((tile) => tile.id)));
        let candidate = '';
        do {
            const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14);
            candidate = `widget-${Date.now()}-${randomId}`;
        } while (existing.has(candidate));
        return candidate;
    };

    const normalizeRequestedTileSize = (item: TileInstance, w: number, h: number, fallback: TileSize): TileSize | null => {
        const definition = resolveTileDefinition(item.tileType, config.value.tileInstalls);
        if (!('sizes' in definition)) {
            return {
                w: clampInt(w, 1, MAX_WIDGET_W, fallback.w),
                h: clampInt(h, 1, MAX_WIDGET_H, fallback.h),
            };
        }
        const rules = definition.sizes;
        const max = {
            w: Math.max(rules.min.w, Math.min(rules.max.w, MAX_WIDGET_W)),
            h: Math.max(rules.min.h, Math.min(rules.max.h, MAX_WIDGET_H)),
        };
        const requested = {
            w: clampInt(w, rules.min.w, max.w, fallback.w),
            h: clampInt(h, rules.min.h, max.h, fallback.h),
        };
        if (rules.allowed?.length && !rules.allowed.some((size) => size.w === requested.w && size.h === requested.h)) {
            return null;
        }
        return requested;
    };

    const normalizeLayoutItems = () => {
        if (!config.value.layout) return;

        config.value.layout.forEach((group) => {
            getWorkspaceTiles(group).forEach((tile) => {

                if (!isComponentTile(tile)) {
                    const size = getTileDesktopSize(tile);
                    setTileSize(
                        tile,
                        clampInt(size.w, 1, MAX_WIDGET_W, 1),
                        clampInt(size.h, 1, MAX_WIDGET_H, 1),
                    );
                    return;
                }

                const widgetType = getLegacyWidgetType(tile);
                const meta = getWidgetMeta(widgetType);
                const defW = meta?.defaultW ?? 2;
                const defH = meta?.defaultH ?? 2;
                const size = getTileDesktopSize(tile);

                setTileSize(
                    tile,
                    clampInt(size.w, 1, MAX_WIDGET_W, defW),
                    clampInt(size.h, 1, MAX_WIDGET_H, defH),
                );

                const title = getTileTitle(tile).trim();
                const type = String(widgetType || '').trim();
                if (!title || (type && title.toLowerCase() === type.toLowerCase())) {
                    setTileTitle(tile, getWidgetLabel(widgetType));
                }
            });
        });
    };

    const updateItemSize = (groupId: string, itemId: string, w: number, h: number) => {
        const group = findWorkspace(config.value, groupId);
        const item = findTile(group, itemId);
        if (!item) return false;

        if (!isComponentTile(item)) {
            const next = normalizeRequestedTileSize(item, w, h, {w: 1, h: 1});
            if (!next) return false;
            setTileSize(item, next.w, next.h);
        } else {
            const meta = getWidgetMeta(getLegacyWidgetType(item));
            const defW = meta?.defaultW ?? 2;
            const defH = meta?.defaultH ?? 2;
            const next = normalizeRequestedTileSize(item, w, h, {w: defW, h: defH});
            if (!next) return false;

            setTileSize(item, next.w, next.h);
        }

        void saveConfig();
        return true;
    };

    const addWidget = (groupId: string, widgetType: string) => {
        const group = findWorkspace(config.value, groupId);
        if (!group) return;

        const meta = getWidgetMeta(widgetType);
        const defW = meta?.defaultW ?? 2;
        const defH = meta?.defaultH ?? 2;

        const newWidget = createComponentTile(widgetType, {
            id: createUniqueWidgetId(),
            title: getWidgetLabel(widgetType),
            settings: {},
            layouts: {desktop: {
                x: 0,
                y: 0,
                w: clampInt(defW, 1, MAX_WIDGET_W, 2),
                h: clampInt(defH, 1, MAX_WIDGET_H, 2),
            }},
        });

        getWorkspaceTiles(group).push(newWidget);
        void saveConfig();
    };

    return {
        normalizeLayoutItems,
        updateItemSize,
        addWidget,
        createComponentTile: addWidget,
    };
};
