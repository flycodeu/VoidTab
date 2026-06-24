// src/core/sync/index.ts
import type {SyncFileOptions, SyncProfile, SyncOpResult, SyncTestResult, SyncDownloadResult} from './types';
import {providerRegistry} from './registry';

// src/core/sync/index.ts
export * from './types';
export * from './service';
export * from './scheduler';
export * from './v6Channel';


function getProvider(profile: SyncProfile) {
    const p = providerRegistry[profile.provider];
    if (!p) throw new Error(`Unknown sync provider: ${profile.provider}`);
    return p;
}

/**   统一导出一个 syncService（对象） */
export const syncService = {
    async test(profile: SyncProfile): Promise<SyncTestResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).test(profile as any);
    },

    async upload(profile: SyncProfile, payload: any, options?: SyncFileOptions): Promise<SyncOpResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).upload(profile as any, payload, options);
    },

    async download(profile: SyncProfile, options?: SyncFileOptions): Promise<SyncDownloadResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).download(profile as any, options);
    }
};
