import type {TileType, UnsupportedTileDefinition} from './contracts.ts';
import {getLegacyBuiltinWidgetType, isExternalTileType} from './tileType.ts';

/**
 * Preserve a future external tile as a visible, recoverable record without
 * loading package assets or evaluating third-party code.
 */
export function createUnsupportedExternalTileDefinition(
    tileType: TileType,
): UnsupportedTileDefinition {
    const externalName = isExternalTileType(tileType)
        ? tileType.slice('external:'.length) || '未命名组件'
        : getLegacyBuiltinWidgetType(tileType) || '未注册组件';
    return {
        id: tileType,
        source: 'unsupported',
        label: externalName,
        description: isExternalTileType(tileType)
            ? '此组件需要外部运行时支持；当前版本仅保留其数据，未执行任何包代码。'
            : '该内置组件类型当前未注册；实例数据和布局已保留，可在组件恢复后继续使用。',
        styleable: ['radius', 'accent', 'surface', 'iconScale', 'density', 'elevation'],
        renderer: {
            kind: 'unsupported',
            reason: isExternalTileType(tileType) ? 'external-runtime-disabled' : 'missing-builtin',
        },
    };
}
