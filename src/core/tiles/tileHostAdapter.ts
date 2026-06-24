import type {SiteItem} from '../config/types.ts';
import type {TileInstance} from './contracts.ts';
import {getLegacyBuiltinWidgetType} from './tileType.ts';

/**
 * Temporary rendering bridge for unmodified v5 Vue cards. It intentionally
 * keeps widgetConfig as a reference to TileInstance.settings so existing
 * widget components can still persist settings mutations after P3.3.
 */
export function toLegacyTileHostItem(tile: TileInstance): SiteItem {
    const size = tile.layouts.desktop;

    if (tile.tileType === 'site') {
        return {
            id: tile.id,
            kind: 'site',
            title: tile.title,
            url: tile.url,
            icon: tile.icon,
            iconType: tile.iconType,
            iconValue: tile.iconValue,
            bgColor: tile.bgColor,
            remark: tile.remark,
            tags: tile.tags,
            createdAt: tile.createdAt,
            w: size.w,
            h: size.h,
            layouts: tile.layouts,
        };
    }

    return {
        id: tile.id,
        kind: 'widget',
        title: tile.title,
        widgetType: getLegacyBuiltinWidgetType(tile.tileType) || tile.tileType,
        widgetConfig: tile.settings,
        createdAt: tile.createdAt,
        w: size.w,
        h: size.h,
        layouts: tile.layouts,
    };
}
