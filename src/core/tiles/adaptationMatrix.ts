import type {DeclarativeViewNode, TileDefinition} from './contracts.ts';

export type TileAdaptationDimension = 'mobile' | 'keyboard' | 'screen-reader' | 'failure-state';

export interface TileAdaptationCheck {
    tileType: string;
    dimension: TileAdaptationDimension;
    ok: boolean;
    message: string;
}

export interface TileAdaptationReport {
    ok: boolean;
    checks: TileAdaptationCheck[];
    failures: TileAdaptationCheck[];
}

const walkDeclarativeNodes = (node: DeclarativeViewNode | undefined): DeclarativeViewNode[] => {
    if (!node) return [];
    const nested = 'children' in node && Array.isArray(node.children)
        ? node.children.flatMap(walkDeclarativeNodes)
        : [];
    return [node, ...nested];
};

function hasDeclarativeAction(nodes: DeclarativeViewNode[]) {
    return nodes.some((node) => node.type === 'button' && node.action?.type && node.action.type !== 'none');
}

function hasReadableContent(nodes: DeclarativeViewNode[]) {
    return nodes.some((node) =>
        node.type === 'text'
        || node.type === 'number'
        || node.type === 'date'
        || node.type === 'relative-time'
        || node.type === 'icon'
        || (node.type === 'image' && node.alt !== undefined),
    );
}

function hasFailureState(definition: TileDefinition) {
    if (definition.source === 'unsupported') return true;
    if (definition.source === 'declarative') {
        return !!definition.views[definition.renderer.coverView];
    }
    return true;
}

export function evaluateTileAdaptation(definition: TileDefinition): TileAdaptationReport {
    const tileType = definition.id;
    const cover = definition.source === 'declarative'
        ? definition.views[definition.renderer.coverView]
        : undefined;
    const nodes = walkDeclarativeNodes(cover);
    const interactive = definition.source === 'declarative'
        ? hasDeclarativeAction(nodes)
        : true;
    const readable = definition.source === 'declarative'
        ? hasReadableContent(nodes)
        : true;
    const mobileSupport = definition.source === 'unsupported'
        ? 'desktop-only'
        : definition.compatibility.mobileSupport;

    const checks: TileAdaptationCheck[] = [
        {
            tileType,
            dimension: 'mobile',
            ok: mobileSupport === 'full' || mobileSupport === 'fallback-layout' || mobileSupport === 'desktop-only',
            message: `mobileSupport=${mobileSupport}`,
        },
        {
            tileType,
            dimension: 'keyboard',
            ok: true,
            message: interactive
                ? '交互控件可通过原生 button/action 触发'
                : '无自定义交互控件，宿主导航和菜单负责键盘操作',
        },
        {
            tileType,
            dimension: 'screen-reader',
            ok: readable,
            message: readable
                ? '存在文本、格式化值、图标标签或图片 alt'
                : '缺少可读文本或替代文本',
        },
        {
            tileType,
            dimension: 'failure-state',
            ok: hasFailureState(definition),
            message: '宿主提供缺包、移动端阻断和运行时错误占位',
        },
    ];
    const failures = checks.filter((check) => !check.ok);
    return {ok: failures.length === 0, checks, failures};
}

export function evaluateTileAdaptationMatrix(definitions: TileDefinition[]): TileAdaptationReport {
    const checks = definitions.flatMap((definition) => evaluateTileAdaptation(definition).checks);
    const failures = checks.filter((check) => !check.ok);
    return {ok: failures.length === 0, checks, failures};
}
