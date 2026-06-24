import type {Ref} from 'vue';
import type {ConfigV6} from '../../core/config/types.ts';
import {confirmV6SyncSchemaUpgrade} from '../../core/config/syncSchemaUpgrade.ts';

type UpgradeActionDeps = {
    config: Ref<ConfigV6>;
    localRevision: Ref<number>;
    saveConfig: () => Promise<void>;
};

export const createUpgradeActions = ({
    config,
    localRevision,
    saveConfig,
}: UpgradeActionDeps) => {
    const confirmV6SyncUpgrade = async () => {
        if (config.value.sync.provider !== 'webdav' || !config.value.sync.enabled) {
            return {success: false, message: '当前未启用 WebDAV 同步，无需确认 v6 同步通道'};
        }

        config.value.sync = confirmV6SyncSchemaUpgrade(config.value.sync);
        localRevision.value += 1;
        await saveConfig();
        return {success: true, message: '已启用 v6 同步文件；旧备份文件保持不变'};
    };

    return {confirmV6SyncUpgrade};
};
