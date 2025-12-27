// src/core/sync/registry.ts
import type {SyncProviderId, SyncProvider} from './types';
import {createWebDavProvider} from './providers/webdav';

export const providerRegistry: Record<SyncProviderId, SyncProvider> = {
    webdav: createWebDavProvider(),
    none: {
        async test() {
            return {ok: false, message: '未启用同步'};
        },
        async upload() {
            return {ok: false, message: '未启用同步'};
        },
        async download() {
            return {ok: false, message: '未启用同步'};
        }
    }
};
