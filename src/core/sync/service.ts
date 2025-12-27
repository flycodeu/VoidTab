// src/core/sync/service.ts
import type {SyncProfile, SyncOpResult, SyncTestResult} from './types';
import {providerRegistry} from './registry';

function getProvider(profile: SyncProfile) {
    const p = providerRegistry[profile.provider];
    if (!p) throw new Error(`Unknown sync provider: ${profile.provider}`);
    return p;
}

export class SyncService {
    async test(profile: SyncProfile): Promise<SyncTestResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).test(profile);
    }

    async upload(profile: SyncProfile, payload: any): Promise<SyncOpResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).upload(profile, payload);
    }

    async download(profile: SyncProfile): Promise<SyncOpResult> {
        if (profile.provider === 'none') return {ok: false, message: '未启用同步'};
        return getProvider(profile).download(profile);
    }
}

// ✅ 单例导出：store 直接用它
export const syncService = new SyncService();
