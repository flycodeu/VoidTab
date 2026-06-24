import {computed, ref, type Ref} from 'vue';
import type {
    ConfigV6,
    PrivacyVaultPayloadV2,
} from '../../core/config/types';
import {
    createPrivacyVaultEnvelope,
    emptyPrivacyVaultPayload,
    openPrivacyVaultEnvelope,
    resealPrivacyVaultEnvelope,
} from '../../core/privacy/vaultCrypto';
import {
    migratePrivacyVaultPayloadV1ToV2,
} from '../../core/privacy/payloadMigration';
import {cloneConfigSnapshot} from '../../shared/utils/configSnapshot';
import {
    createWorkspace,
    findWorkspace,
    getWorkspaceTiles,
    isSiteTile,
    removeTile,
} from '../../core/tiles/tileAccess.ts';
import type {TileInstance, Workspace} from '../../core/tiles/contracts.ts';

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

function makeRuntimeRestoredWorkspace(originalGroupId: string, title?: string): Workspace {
    return createWorkspace({
        id: originalGroupId,
        title: title || '恢复的内容',
        icon: 'Folder',
        sortKey: 'custom',
    });
}

function runtimeWorkspaceToPrivacyWorkspace(workspace: Workspace): Workspace {
    return cloneConfigSnapshot(workspace) as Workspace;
}

function privacyWorkspaceToRuntimeWorkspace(workspace: Workspace): Workspace {
    return cloneConfigSnapshot(workspace) as Workspace;
}

function privacyTileToRuntimeTile(tile: TileInstance): TileInstance {
    return cloneConfigSnapshot(tile) as TileInstance;
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

const createVaultMigrationDeviceId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    } catch {
    }
    return `privacy-vault-${Date.now().toString(36)}`;
};

export const createPrivacyActions = (
    config: Ref<ConfigV6>,
    saveConfig: () => Promise<void>
) => {
    const privacyPayload = ref<PrivacyVaultPayloadV2 | null>(null);
    const privacyUnlocked = ref(false);
    const privacyBusy = ref(false);
    let sessionPassword = '';
    let vaultMigrationDeviceId = '';
    let autoLockTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const hasPrivacyVault = computed(() => !!config.value.privacy?.vault);
    const privacyItemCount = computed(() => {
        const payload = privacyPayload.value;
        if (!payload) return 0;
        return payload.workspaces.length + payload.tiles.length;
    });
    const migrationOptions = () => ({
        deviceId: vaultMigrationDeviceId || (vaultMigrationDeviceId = createVaultMigrationDeviceId()),
        migratedAt: Date.now(),
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

        const entry = (config.value.privacy.entry || {}) as Partial<ConfigV6['privacy']['entry']>;
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

    const unlockPrivacyVault = async (password: string): Promise<PrivacyVaultPayloadV2> => {
        ensurePrivacyConfig();
        const vault = config.value.privacy.vault;
        if (!vault) throw new Error('尚未创建。');
        if (!password) throw new Error('请输入密码。');

        privacyBusy.value = true;
        try {
            const opened = await openPrivacyVaultEnvelope(vault, password);
            let payload: PrivacyVaultPayloadV2;
            if (opened.version === 1) {
                const migrated = migratePrivacyVaultPayloadV1ToV2(opened, migrationOptions());
                const upgradedVault = await resealPrivacyVaultEnvelope(vault, password, migrated.payload);
                config.value.privacy.vault = upgradedVault;
                try {
                    await saveConfig();
                } catch (error) {
                    config.value.privacy.vault = vault;
                    throw error;
                }
                payload = migrated.payload;
            } else {
                payload = opened;
            }
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

    const ensureUnlocked = async (password?: string): Promise<PrivacyVaultPayloadV2> => {
        if (privacyUnlocked.value && privacyPayload.value && sessionPassword) {
            touchPrivacySession();
            return privacyPayload.value;
        }
        if (!password) throw new Error('请先解锁。');
        return await unlockPrivacyVault(password);
    };

    const sealPayload = async (payload: PrivacyVaultPayloadV2) => {
        const vault = config.value.privacy.vault;
        if (!vault || !sessionPassword) throw new Error('未解锁。');
        return await resealPrivacyVaultEnvelope(vault, sessionPassword, payload);
    };

    const moveSiteToPrivacy = async (groupId: string, siteId: string, password?: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '请先创建。'};

        const payload = await ensureUnlocked(password);
        const group = findWorkspace(config.value, groupId);
        const tiles = group ? getWorkspaceTiles(group) : [];
        const index = tiles.findIndex((item) => item.id === siteId);
        const site = index >= 0 ? tiles[index] : null;
        if (!group || !site) return {success: false, message: '未找到该网站。'};
        if (!isSiteTile(site)) return {success: false, message: '该项目暂不支持添加。'};

        const tile = cloneConfigSnapshot(site) as TileInstance;
        const nextPayload: PrivacyVaultPayloadV2 = {
            version: 2,
            workspaces: payload.workspaces,
            tiles: [
                ...payload.tiles.filter((entry) => entry.tile.id !== tile.id),
                {
                    tile,
                    originalWorkspaceId: group.id,
                    originalWorkspaceTitle: group.title,
                    originalIndex: index,
                    movedAt: Date.now(),
                },
            ],
        };
        const nextVault = await sealPayload(nextPayload);

        config.value.privacy.vault = nextVault;
        removeTile(group, siteId);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `「${tile.title || '未命名'}」已添加。`};
    };

    const moveGroupToPrivacy = async (groupId: string, password?: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '请先创建。'};

        const payload = await ensureUnlocked(password);
        const index = config.value.layout.findIndex((group) => group.id === groupId);
        const group = index >= 0 ? config.value.layout[index] : null;
        if (!group) return {success: false, message: '未找到该分组。'};

        const workspace = runtimeWorkspaceToPrivacyWorkspace(group);
        const nextPayload: PrivacyVaultPayloadV2 = {
            version: 2,
            workspaces: [
                ...payload.workspaces.filter((entry) => entry.workspace.id !== workspace.id),
                {
                    workspace,
                    originalIndex: index,
                    movedAt: Date.now(),
                },
            ],
            tiles: payload.tiles,
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
        const index = payload.tiles.findIndex((entry) => entry.tile.id === siteId);
        const entry = index >= 0 ? payload.tiles[index] : null;
        if (!entry) return {success: false, message: '未找到该网站。'};

        const nextPayload: PrivacyVaultPayloadV2 = {
            version: 2,
            workspaces: payload.workspaces,
            tiles: payload.tiles.filter((item) => item.tile.id !== siteId),
        };
        const nextVault = await sealPayload(nextPayload);

        let target = findWorkspace(config.value, targetGroupId || entry.originalWorkspaceId);
        if (!target) {
            target = makeRuntimeRestoredWorkspace(entry.originalWorkspaceId, entry.originalWorkspaceTitle);
            config.value.layout.push(target);
        }
        const restored = privacyTileToRuntimeTile(entry.tile);
        const tiles = getWorkspaceTiles(target);
        if (!tiles.some((item) => item.id === restored.id)) {
            const insertAt = Math.max(0, Math.min(entry.originalIndex, tiles.length));
            tiles.splice(insertAt, 0, restored);
        }

        config.value.privacy.vault = nextVault;
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `「${entry.tile.title || '未命名'}」已恢复。`};
    };

    const restorePrivacyGroup = async (groupId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const index = payload.workspaces.findIndex((entry) => entry.workspace.id === groupId);
        const entry = index >= 0 ? payload.workspaces[index] : null;
        if (!entry) return {success: false, message: '未找到该分组。'};

        const nextPayload: PrivacyVaultPayloadV2 = {
            version: 2,
            workspaces: payload.workspaces.filter((item) => item.workspace.id !== groupId),
            tiles: payload.tiles,
        };
        const nextVault = await sealPayload(nextPayload);

        if (!config.value.layout.some((group) => group.id === groupId)) {
            const insertAt = Math.max(0, Math.min(entry.originalIndex, config.value.layout.length));
            config.value.layout.splice(insertAt, 0, privacyWorkspaceToRuntimeWorkspace(entry.workspace));
        }

        config.value.privacy.vault = nextVault;
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `分组「${entry.workspace.title || '未命名'}」已恢复。`};
    };

    const deletePrivacySite = async (siteId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const entry = payload.tiles.find((item) => item.tile.id === siteId);
        if (!entry) return {success: false, message: '未找到该网站。'};

        const nextPayload = {
            version: 2 as const,
            workspaces: payload.workspaces,
            tiles: payload.tiles.filter((item) => item.tile.id !== siteId),
        };
        config.value.privacy.vault = await sealPayload(nextPayload);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `已永久删除「${entry.tile.title || '未命名'}」。`};
    };

    const deletePrivacyGroup = async (groupId: string): Promise<PrivacyActionResult> => {
        const payload = await ensureUnlocked();
        const entry = payload.workspaces.find((item) => item.workspace.id === groupId);
        if (!entry) return {success: false, message: '未找到该分组。'};

        const nextPayload = {
            version: 2 as const,
            workspaces: payload.workspaces.filter((item) => item.workspace.id !== groupId),
            tiles: payload.tiles,
        };
        config.value.privacy.vault = await sealPayload(nextPayload);
        privacyPayload.value = nextPayload;
        touchPrivacySession();
        await saveConfig();
        return {success: true, message: `已永久删除分组「${entry.workspace.title || '未命名'}」。`};
    };

    const changePrivacyPassword = async (oldPassword: string, newPassword: string): Promise<PrivacyActionResult> => {
        ensurePrivacyConfig();
        if (!config.value.privacy.vault) return {success: false, message: '尚未创建。'};
        if (!passwordLooksUsable(newPassword)) return {success: false, message: `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`};

        privacyBusy.value = true;
        try {
            const opened = await openPrivacyVaultEnvelope(config.value.privacy.vault, oldPassword);
            const payload = opened.version === 1
                ? migratePrivacyVaultPayloadV1ToV2(opened, migrationOptions()).payload
                : opened;
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
            const workspaces = [...payload.workspaces].sort((a, b) => a.originalIndex - b.originalIndex);
            for (const entry of workspaces) {
                if (config.value.layout.some((group) => group.id === entry.workspace.id)) continue;
                const insertAt = Math.max(0, Math.min(entry.originalIndex, config.value.layout.length));
                config.value.layout.splice(insertAt, 0, privacyWorkspaceToRuntimeWorkspace(entry.workspace));
            }

            for (const entry of payload.tiles) {
                let target = findWorkspace(config.value, entry.originalWorkspaceId);
                if (!target) {
                    target = makeRuntimeRestoredWorkspace(entry.originalWorkspaceId, entry.originalWorkspaceTitle);
                    config.value.layout.push(target);
                }
                const restored = privacyTileToRuntimeTile(entry.tile);
                const tiles = getWorkspaceTiles(target);
                if (tiles.some((item) => item.id === restored.id)) continue;
                const insertAt = Math.max(0, Math.min(entry.originalIndex, tiles.length));
                tiles.splice(insertAt, 0, restored);
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
