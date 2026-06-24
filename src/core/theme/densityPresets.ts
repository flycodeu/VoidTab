import type {BookmarkDensity, ConfigV6} from '../config/types';

type Theme = ConfigV6['theme'];

export type IconDensityPreset = Pick<
    Theme,
    'iconSize' | 'radius' | 'gap' | 'iconTextSize' | 'showIconName' | 'showWidgetName'
>;

export const iconDensityPresets: Record<BookmarkDensity, IconDensityPreset> = {
    compact: {
        iconSize: 48,
        radius: 12,
        gap: 14,
        iconTextSize: 11,
        showIconName: false,
        showWidgetName: false,
    },
    normal: {
        iconSize: 60,
        radius: 16,
        gap: 24,
        iconTextSize: 12,
        showIconName: true,
        showWidgetName: true,
    },
    comfortable: {
        iconSize: 78,
        radius: 22,
        gap: 30,
        iconTextSize: 13,
        showIconName: true,
        showWidgetName: true,
    },
};

export function applyIconDensityPreset(theme: Theme, density: BookmarkDensity) {
    const preset = iconDensityPresets[density] || iconDensityPresets.normal;

    theme.density = density;
    theme.iconSize = preset.iconSize;
    theme.radius = preset.radius;
    theme.gap = preset.gap;
    theme.iconTextSize = preset.iconTextSize;
    theme.showIconName = preset.showIconName;
    theme.showWidgetName = preset.showWidgetName;
}
