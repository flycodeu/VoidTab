import {computed, ref} from 'vue';
import {useConfigStore} from '../stores/useConfigStore';

export type DeleteTarget =
    | { kind: 'site'; groupId: string; siteId: string; title?: string }
    | { kind: 'group'; groupId: string; title?: string };

// ✅ 全局单例状态（模块级）
const show = ref(false);
const target = ref<DeleteTarget | null>(null);

export function useDeleteConfirm() {
    const store = useConfigStore();

    const title = computed(() => '确认删除？');

    const message = computed(() => {
        if (!target.value) return ['删除后无法恢复。'];
        const t = target.value.kind === 'group' ? '分组' : '图标';
        const name = target.value.title ? `「${target.value.title}」` : '';
        return [
            `删除后无法恢复，`,
            `确定要移除这个${t}${name}吗？`
        ];
    });

    const open = (t: DeleteTarget) => {
        target.value = t;
        show.value = true;
    };

    const close = () => {
        show.value = false;
        target.value = null;
    };

    const confirm = () => {
        if (!target.value) return close();

        if (target.value.kind === 'site') {
            store.removeSite(target.value.groupId, target.value.siteId);
        } else {
            store.removeGroup(target.value.groupId);
        }
        close();
    };

    return {
        show,
        target,
        title,
        message,
        open,
        close,
        confirm
    };
}
