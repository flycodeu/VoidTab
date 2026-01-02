import { computed } from 'vue';
import type { ComputedRef } from 'vue';

export function useGridLayout(theme: {
    iconSize: number | string;
    gap: number | string;
}) {
    const gridStyle: ComputedRef<Record<string, string>> = computed(() => {
        const size = Number(theme.iconSize) || 60;
        const gap = Number(theme.gap) || 20;
        const colMinSize = size + 16;

        return {
            gap: `${gap}px`,
            gridTemplateColumns: `repeat(auto-fill, minmax(${colMinSize}px, 1fr))`,
        };
    });

    const itemContainerStyle = computed(() => ({
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
    }));

    return { gridStyle, itemContainerStyle };
}
