import type {TerminalCommandMemo} from './types';

export const terminalCommandCategories = [
    {id: 'all', label: '全部'},
    {id: 'dev', label: '开发'},
    {id: 'git', label: 'Git'},
    {id: 'ops', label: '运维'},
    {id: 'note', label: '片段'},
] as const;

export const defaultTerminalCommands: TerminalCommandMemo[] = [
    {
        id: 'cmd_dev_start',
        title: '启动开发服务',
        command: 'npm run dev',
        category: 'dev',
        description: '启动 Vite 本地预览',
        createdAt: 0,
        updatedAt: 0,
    },
    {
        id: 'cmd_build_all',
        title: '完整构建',
        command: 'npm run build',
        category: 'dev',
        description: '同时验证网页和扩展产物',
        createdAt: 0,
        updatedAt: 0,
    },
    {
        id: 'cmd_git_status',
        title: '查看变更',
        command: 'git status --short',
        category: 'git',
        description: '确认当前工作区状态',
        createdAt: 0,
        updatedAt: 0,
    },
];

export function cloneDefaultTerminalCommands(): TerminalCommandMemo[] {
    return defaultTerminalCommands.map((item) => ({...item}));
}

export function getTerminalCommandCategoryLabel(category: string): string {
    return terminalCommandCategories.find((item) => item.id === category)?.label || category || '片段';
}
