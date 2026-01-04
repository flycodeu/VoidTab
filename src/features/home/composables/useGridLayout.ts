import {computed} from "vue";
import type {ComputedRef} from "vue";

export function useGridLayout(theme: { gap: number | string }) {
    const gridStyle: ComputedRef<Record<string, string>> = computed(() => {
        const gap = Number(theme.gap) || 12;
        return {
            display: "grid",
            gap: `${gap}px`,
            justifyContent: "center", // 图2是整体居中更像
        };
    });

    const itemContainerStyle = computed(() => ({
        width: "100%",
        height: "100%",
        minWidth: 0,
    }));

    return {gridStyle, itemContainerStyle};
}
