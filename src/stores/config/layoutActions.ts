import type {Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types';
import {getWidgetLabel, getWidgetMeta} from '../../core/registry/widgets';
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
        if (!item) return;

        if (!isComponentTile(item)) {
            setTileSize(item, clampInt(w, 1, MAX_WIDGET_W, 1), clampInt(h, 1, MAX_WIDGET_H, 1));
        } else {
            const meta = getWidgetMeta(getLegacyWidgetType(item));
            const defW = meta?.defaultW ?? 2;
            const defH = meta?.defaultH ?? 2;

            setTileSize(item, clampInt(w, 1, MAX_WIDGET_W, defW), clampInt(h, 1, MAX_WIDGET_H, defH));
        }

        void saveConfig();
    };

    const addWidget = (groupId: string, widgetType: string) => {
        const group = findWorkspace(config.value, groupId);
        if (!group) return;

        const meta = getWidgetMeta(widgetType);
        const defW = meta?.defaultW ?? 2;
        const defH = meta?.defaultH ?? 2;

        const newWidget = createComponentTile(widgetType, {
            id: `widget-${Date.now()}`,
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
