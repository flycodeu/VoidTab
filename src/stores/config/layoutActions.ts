import type {Ref} from 'vue';
import type {Config, SiteItem, WidgetType} from '../../core/config/types';
import {getWidgetLabel, getWidgetMeta} from '../../core/registry/widgets';
import {clampInt, MAX_WIDGET_H, MAX_WIDGET_W} from './helpers';

export const createLayoutActions = (
    config: Ref<Config>,
    saveConfig: () => Promise<void>
) => {
    const normalizeLayoutItems = () => {
        if (!config.value.layout) return;

        config.value.layout.forEach((group) => {
            if (!group.items) group.items = [];

            group.items.forEach((item) => {
                if (item.widgetType && item.kind !== 'widget') item.kind = 'widget';
                if (!item.kind) item.kind = 'site';

                if (item.kind === 'site') {
                    item.w = 1;
                    item.h = 1;
                    return;
                }

                if (item.kind === 'widget') {
                    const meta = getWidgetMeta(item.widgetType);
                    const defW = meta?.defaultW ?? 2;
                    const defH = meta?.defaultH ?? 2;

                    item.w = clampInt(item.w, 1, MAX_WIDGET_W, defW);
                    item.h = clampInt(item.h, 1, MAX_WIDGET_H, defH);

                    const title = (item.title || '').trim();
                    const type = String(item.widgetType || '').trim();
                    if (!title || (type && title.toLowerCase() === type.toLowerCase())) {
                        item.title = getWidgetLabel(item.widgetType);
                    }
                }
            });
        });
    };

    const updateItemSize = (groupId: string, itemId: string, w: number, h: number) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        const item = group?.items.find((entry) => entry.id === itemId);
        if (!item) return;

        if (item.kind === 'site') {
            item.w = 1;
            item.h = 1;
        } else {
            const meta = getWidgetMeta(item.widgetType);
            const defW = meta?.defaultW ?? 2;
            const defH = meta?.defaultH ?? 2;

            item.w = clampInt(w, 1, MAX_WIDGET_W, defW);
            item.h = clampInt(h, 1, MAX_WIDGET_H, defH);
        }

        void saveConfig();
    };

    const addWidget = (groupId: string, widgetType: string) => {
        const group = config.value.layout.find((item) => item.id === groupId);
        if (!group) return;

        const meta = getWidgetMeta(widgetType);
        const defW = meta?.defaultW ?? 2;
        const defH = meta?.defaultH ?? 2;

        const newWidget: SiteItem = {
            id: `widget-${Date.now()}`,
            kind: 'widget',
            widgetType: widgetType as WidgetType,
            title: getWidgetLabel(widgetType),
            w: clampInt(defW, 1, MAX_WIDGET_W, 2),
            h: clampInt(defH, 1, MAX_WIDGET_H, 2),
            url: '',
            icon: '',
        };

        group.items.push(newWidget);
        void saveConfig();
    };

    return {
        normalizeLayoutItems,
        updateItemSize,
        addWidget,
    };
};
