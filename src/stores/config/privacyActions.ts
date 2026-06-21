import {computed, ref, type Ref} from 'vue';
import type {Config, Group, PrivacyVaultPayload, SiteItem} from '../../core/config/types';
import {
    createPrivacyVaultEnvelope,
    emptyPrivacyVaultPayload,
    openPrivacyVaultEnvelope,
    resealPrivacyVaultEnvelope,
} from '../../core/privacy/vaultCrypto';
import {cloneConfigSnapshot} from '../../shared/utils/configSnapshot';

type PrivacyActionResult = {
    success: boolean;
    message: string;
};

type RemovePrivacyOptions = {
    restore: boolean;
    password?: string;
};

const MIN_PASSWORD_LENGTH = 6;
const DEFAULT_ENTRY_PHRASE = ':void';

function normalizePayload(payload: PrivacyVaultPayload | null): PrivacyVaultPayload {
    if (!payload) return emptyPrivacyVaultPayload();
    return {
        version: 1,
        groups: Array.isArray(payload.groups) ? payload.groups : [],
        sites: Array.isArray(payload.sites) ? payload.sites : [],
    };
}

function makeRestoredGroup(originalGroupId: string, title?: string): Group {
    return {
        id: originalGroupId,
        title: title || '恢复的内容',
        icon: 'Folder',
        items: [],
        sortKey: 'custom',
    };
}

function passwordLooksUsable(password: string) {
    return password.trim().length >= MIN_PASSWORD_LENGTH;
}

function normalizeEntryPhrase(value?: string) {
    const phrase = String(value || '').trim().slice(0, 32);
    return phrase || DEFAULT_ENTRY_PHRASE;
}

function entryPhraseLooksUsable(value: string) {
    const phrase = value.trim();
    return phrase.length >= 2 && phrase.length <= 32 && !/\s/.test(phrase);
}

export const createPrivacyActions = (
    config: Ref<Config>,
    saveConfig: () => Promise<void>
) => {
    const privacyPayload = ref<PrivacyVaultPayload | null>(null);
    const privacyUnlocked = ref(false);
    const privacyBusy = ref(false);
    let sessionPassword = '';
    let autoLockTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const hasPrivacyVault = computed(() => !!config.value.privacy?.vault);
    const privacyItemCount = computed(() => {
        const payload = privacyPayload.value;
        if (!payload) return 0;
        return payload.groups.length + payload.sites.length;
    });

    const ensurePrivacyConfig = () => {
        if (!config.value.privacy) {
            config.value.privacy = {
                enabled: false,
                vault: null,
                entry: {
                    trigger: 'keyboard',
                    phrase: DEFAULT_ENTRY_PHRASE,
                    autoLockMinutes: 10,
                    hideWhenLocked: true,
                    syncEnabled: true,
                },
            };
            return;
        }

        const entry = (config.value.privacy.entry || {}) as Partial<Config['privacy']['entry']>;
        config.value.privacy.entry = {
            trigger: 'keyboard',
            phrase: normalizeEntryPhrase(entry.phrase),
            autoLockMinutes: Math.max(1, Math.min(240, Math.round(Number(entry.autoLockMinutes || 10)))),
            hideWhenLocked: typeof entry.hideWhenLocked === 'boolean' ? entry.hideWhenLocked : true,
            syncEnabled: typeof entry.syncEnabled === 'boolean' ? entry.syncEnabled : true,
        };
    };

    const clearAutoLockTimer = () => {
        if (!autoLockTimer) return;
        globalThis.clearTimeout(autoLockTimer);
        autoLockTimer = null;
    };

    const lockPrivacyVault = () => {
        clearAutoLockTimer();
        privacyPayload.value = null;
        privacyUnlocked.value = false;
        sessionPassword = '';
    };

    const scheduleAutoLock = () => {
        clearAutoLockTimer();
        const minutes = Math.max(1, Math.min(240, Number(config.value.privacy.entry.autoLockMinutes || 10)));
        autoLockTimer = globalThis.setTimeout(lockPrivacyVault, minutes * 60 * 1000);
    };

    const touchPrivacySession = () => {
        if (!privacyUnlocked.value) return;
        scheduleAutoLock();
    };

    const isPrivacyEntryPhrase = (value: string) => {
        ensurePrivacyConfig();
        const phrase = String(value || '').trim();
        if (!phrase) return false;
        return phrase.toLocaleLowerCase() === config.value.privacy.entry.phrase.toLocaleLowerCase();
    };

    const setPrivacyEntryPhrase = async (phrase: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!privacyUnlocked.value) return {success: false, message: '请先解锁。'};
        if (!entryPhraseLooksUsable(phrase)) return {success: false, message: '入口为 2-32 位，不能包含空格。'};

        config.value.privacy.entry.phrase = normalizeEntryPhrase(phrase);
        await saveConfig();
        return {success: true, message: '入口已更新。'};
    };

    const unlockPrivacyVault = async (password: string): Promise<PrivacyVaultPayload> => {
        ensurePrivacyConfig();
        const vault = config.value.privacy.vault;
        if (!vault) throw new Error('尚未创建。');
        if (!password) throw new Error('请输入密码。');

        privacyBusy.value = true;
        try {
            const payload = await openPrivacyVaultEnvelope(vault, password);
            privacyPayload.value = payload;
            privacyUnlocked.value = true;
            sessionPassword = password;
            scheduleAutoLock();
            return payload;
        } finally {
            privacyBusy.value = false;
        }
    };

    const createPrivacyVault = async (password: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!passwordLooksUsable(password)) {
            return {success: false, message: `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`};
        }
        if (config.value.privacy.vault) {
            return {success: false, message: '已存在。'};
        }

        privacyBusy.value = true;
        try {
            const payload = emptyPrivacyVaultPayload();
            const vault = await createPrivacyVaultEnvelope(password, payload);
            config.value.privacy.enabled = true;
            config.value.privacy.vault = vault;
            privacyPayload.value = payload;
            privacyUnlocked.value = true;
            sessionPassword = password;
            scheduleAutoLock();
            await saveConfig();
            return {success: true, message: '已创建。'};
        } finally {
            privacyBusy.value = false;
        }
    };

    const ensureUnlocked = async (password?: string) => {
        if (privacyUnlocked.value && privacyPayload.value && sessionPassword) {
            touchPrivacySession();
            return normalizePayload(privacyPayload.value);
        }
        if (!password) throw new Error('请先解锁。');
        return await unlockPrivacyVault(password);
    };

    const sealPayload = async (payload: PrivacyVaultPayload) => {
        const vault = config.value.privacy.vault;
        if (!vault || !sessionPassword) throw new Error('未解锁。');
        return await resealPrivacyVaultEnvelope(vault, sessionPassword, normalizePayload(payload));
    };

    const moveSiteToPrivacy = async (groupId: string, siteId: string, password?: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '请先创建。'};

        const payload = await ensureUnlocked(password);
        const group = config.value.layout.find((item) => item.id === groupId);
        const index = group?.items.findIndex((item) => item.id === siteId) ?? -1;
        const site = group && index >= 0 ? group.items[index] : null;
        if (!group || !site) return {success: false, message: '未找到该网站。'};
        if (site.kind === 'widget') return {success: false, message: '该项目暂不支持添加。'};

        const nextPayload: PrivacyVaultPayload = {
            version: 1,
            groups: payload.groups,
            sites: [
                ...payload.sites.filter((entry) => entry.site.id !== site.id),
                {
                    site: cloneConfigSnapshot(site),
                    originalGroupId: group.id,
                    originalGroupTitle: group.title,
                    originalIndex: index,
                    movedAt: Date.now(),
                },
            ],
        };
        const nextVault = await sealPayload(nextPayload);

        config.value.privacy.vault = nextVault;
        group.items.splice(index, 1);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `「${site.title || '未命名'}」已添加。`};
    };

    const moveGroupToPrivacy = async (groupId: string, password?: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '请先创建。'};

        const payload = await ensureUnlocked(password);
        const index = config.value.layout.findIndex((group) => group.id === groupId);
        const group = index >= 0 ? config.value.layout[index] : null;
        if (!group) return {success: false, message: '未找到该分组。'};

        const nextPayload: PrivacyVaultPayload = {
            version: 1,
            groups: [
                ...payload.groups.filter((entry) => entry.group.id !== group.id),
                {
                    group: cloneConfigSnapshot(group),
                    originalIndex: index,
                    movedAt: Date.now(),
                },
            ],
            sites: payload.sites,
        };
        const nextVault = await sealPayload(nextPayload);

        config.value.privacy.vault = nextVault;
        config.value.layout.splice(index, 1);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `分组「${group.title || '未命名'}」已添加。`};
    };

    const restorePrivacySite = async (siteId: string, targetGroupId?: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const index = payload.sites.findIndex((entry) => entry.site.id === siteId);
        const entry = index >= 0 ? payload.sites[index] : null;
        if (!entry) return {success: false, message: '未找到该网站。'};

        const nextPayload: PrivacyVaultPayload = {
            version: 1,
            groups: payload.groups,
            sites: payload.sites.filter((item) => item.site.id !== siteId),
        };
        const nextVault = await sealPayload(nextPayload);

        let target = config.value.layout.find((group) => group.id === (targetGroupId || entry.originalGroupId));
        if (!target) {
            target = makeRestoredGroup(entry.originalGroupId, entry.originalGroupTitle);
            config.value.layout.push(target);
        }
        if (!target.items.some((item) => item.id === entry.site.id)) {
            const insertAt = Math.max(0, Math.min(entry.originalIndex, target.items.length));
            target.items.splice(insertAt, 0, cloneConfigSnapshot(entry.site) as SiteItem);
        }

        config.value.privacy.vault = nextVault;
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `「${entry.site.title || '未命名'}」已恢复。`};
    };

    const restorePrivacyGroup = async (groupId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const index = payload.groups.findIndex((entry) => entry.group.id === groupId);
        const entry = index >= 0 ? payload.groups[index] : null;
        if (!entry) return {success: false, message: '未找到该分组。'};

        const nextPayload: PrivacyVaultPayload = {
            version: 1,
            groups: payload.groups.filter((item) => item.group.id !== groupId),
            sites: payload.sites,
        };
        const nextVault = await sealPayload(nextPayload);

        if (!config.value.layout.some((group) => group.id === groupId)) {
            const insertAt = Math.max(0, Math.min(entry.originalIndex, config.value.layout.length));
            config.value.layout.splice(insertAt, 0, cloneConfigSnapshot(entry.group) as Group);
        }

        config.value.privacy.vault = nextVault;
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `分组「${entry.group.title || '未命名'}」已恢复。`};
    };

    const deletePrivacySite = async (siteId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const entry = payload.sites.find((item) => item.site.id === siteId);
        if (!entry) return {success: false, message: '未找到该网站。'};

        const nextPayload = {
            version: 1 as const,
            groups: payload.groups,
            sites: payload.sites.filter((item) => item.site.id !== siteId),
        };
        config.value.privacy.vault = await sealPayload(nextPayload);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `已永久删除「${entry.site.title || '未命名'}」。`};
    };

    const deletePrivacyGroup = async (groupId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const entry = payload.groups.find((item) => item.group.id === groupId);
        if (!entry) return {success: false, message: '未找到该分组。'};

        const nextPayload = {
            version: 1 as const,
            groups: payload.groups.filter((item) => item.group.id !== groupId),
            sites: payload.sites,
        };
        config.value.privacy.vault = await sealPayload(nextPayload);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `已永久删除分组「${entry.group.title || '未命名'}」。`};
    };

    const changePrivacyPassword = async (oldPassword: string, newPassword: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '尚未创建。'};
        if (!passwordLooksUsable(newPassword)) return {success: false, message: `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`};

        privacyBusy.value = true;
        try {
            const payload = await openPrivacyVaultEnvelope(config.value.privacy.vault, oldPassword);
            const vault = await createPrivacyVaultEnvelope(newPassword, payload);
            config.value.privacy.vault = vault;
            privacyPayload.value = payload;
            privacyUnlocked.value = true;
            sessionPassword = newPassword;
            scheduleAutoLock();
            await saveConfig();
            return {success: true, message: '密码已更新。'};
        } finally {
            privacyBusy.value = false;
        }
    };

    const removePrivacyVault = async (options: RemovePrivacyOptions): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '尚未创建。'};

        const payload = await ensureUnlocked(options.password);

        if (options.restore) {
            const groups = [...payload.groups].sort((a, b) => a.originalIndex - b.originalIndex);
            for (const entry of groups) {
                if (config.value.layout.some((group) => group.id === entry.group.id)) continue;
                const insertAt = Math.max(0, Math.min(entry.originalIndex, config.value.layout.length));
                config.value.layout.splice(insertAt, 0, cloneConfigSnapshot(entry.group) as Group);
            }

            for (const entry of payload.sites) {
                let target = config.value.layout.find((group) => group.id === entry.originalGroupId);
                if (!target) {
                    target = makeRestoredGroup(entry.originalGroupId, entry.originalGroupTitle);
                    config.value.layout.push(target);
                }
                if (target.items.some((item) => item.id === entry.site.id)) continue;
                const insertAt = Math.max(0, Math.min(entry.originalIndex, target.items.length));
                target.items.splice(insertAt, 0, cloneConfigSnapshot(entry.site) as SiteItem);
            }
        }

        config.value.privacy.enabled = false;
        config.value.privacy.vault = null;
        lockPrivacyVault();
        await saveConfig();
        return {
            success: true,
            message: options.restore ? '已关闭，内容已恢复。' : '已永久删除。',
        };
    };

    const discardPrivacyVaultWithoutPassword = async (): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        config.value.privacy.enabled = false;
        config.value.privacy.vault = null;
        lockPrivacyVault();
        await saveConfig();
        return {success: true, message: '密文已删除。'};
    };

    const setPrivacyAutoLockMinutes = (minutes: number) => {
        ensurePrivacyConfig();
        config.value.privacy.entry.autoLockMinutes = Math.max(1, Math.min(240, Math.round(minutes)));
        if (privacyUnlocked.value) scheduleAutoLock();
        void saveConfig();
    };

    return {
        privacyPayload,
        privacyUnlocked,
        privacyBusy,
        hasPrivacyVault,
        privacyItemCount,
        isPrivacyEntryPhrase,
        createPrivacyVault,
        unlockPrivacyVault,
        lockPrivacyVault,
        touchPrivacySession,
        moveSiteToPrivacy,
        moveGroupToPrivacy,
        restorePrivacySite,
        restorePrivacyGroup,
        deletePrivacySite,
        deletePrivacyGroup,
        changePrivacyPassword,
        removePrivacyVault,
        discardPrivacyVaultWithoutPassword,
        setPrivacyAutoLockMinutes,
        setPrivacyEntryPhrase,
    };
};
