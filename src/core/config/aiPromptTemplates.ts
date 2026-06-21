import type {AiPromptTemplate} from './types';

const TEMPLATE_SEED_TIME = 1710000000000;

export const defaultAiPromptTemplates: AiPromptTemplate[] = [
    {
        id: 'default-summary',
        title: '提炼重点',
        category: '阅读',
        description: '把长内容压缩成结论、依据和下一步。',
        content: '请把以下内容整理成三段：\n\n1. 结论\n2. 关键依据\n3. 下一步建议\n\n内容：\n{{内容}}',
        systemPrompt: '',
        createdAt: TEMPLATE_SEED_TIME,
        updatedAt: TEMPLATE_SEED_TIME,
    },
    {
        id: 'default-code-review',
        title: '代码审阅',
        category: '开发',
        description: '按风险优先检查代码问题。',
        content: '请从可维护性、边界条件、潜在 bug 和测试缺口四个角度审阅下面的代码。先列问题，再给修改建议。\n\n```{{语言}}\n{{代码}}\n```',
        systemPrompt: '你是一名严谨的软件工程师，优先指出具体风险和可执行改法。',
        createdAt: TEMPLATE_SEED_TIME + 1,
        updatedAt: TEMPLATE_SEED_TIME + 1,
    },
    {
        id: 'default-writing-polish',
        title: '润色改写',
        category: '写作',
        description: '保留事实，优化表达和结构。',
        content: '请在不改变事实的前提下改写下面这段文字，使表达更清晰、自然、克制。保留必要的专业术语。\n\n原文：\n{{文本}}',
        systemPrompt: '',
        createdAt: TEMPLATE_SEED_TIME + 2,
        updatedAt: TEMPLATE_SEED_TIME + 2,
    },
    {
        id: 'default-plan',
        title: '拆解计划',
        category: '规划',
        description: '把目标拆成步骤、风险和验收标准。',
        content: '请把这个目标拆成可执行计划：\n\n目标：{{目标}}\n\n输出：\n- 关键步骤\n- 依赖和风险\n- 最小可交付版本\n- 验收标准',
        systemPrompt: '',
        createdAt: TEMPLATE_SEED_TIME + 3,
        updatedAt: TEMPLATE_SEED_TIME + 3,
    },
];

export function cloneDefaultAiPromptTemplates(): AiPromptTemplate[] {
    return defaultAiPromptTemplates.map((template) => ({...template}));
}
