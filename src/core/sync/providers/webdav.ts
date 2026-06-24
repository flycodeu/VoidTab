// src/core/sync/providers/webdav.ts
import type {SyncFileOptions, SyncProfile, SyncOpResult, SyncTestResult, WebDavProfile, SyncProvider} from '../types';
import {
    checkWebDavConnectionDetailed,
    downloadFromWebDavDetailed,
    uploadToWebDavDetailed,
} from '../../../shared/utils/webdav';

function asWebDav(profile: SyncProfile): WebDavProfile | null {
    return profile.provider === 'webdav' ? (profile as WebDavProfile) : null;
}

export function createWebDavProvider(): SyncProvider {
    return {
        async test(profile: SyncProfile): Promise<SyncTestResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const result = await checkWebDavConnectionDetailed(p);
            return {ok: result.ok, message: result.message};
        },

        async upload(profile: SyncProfile, payload: any, options?: SyncFileOptions): Promise<SyncOpResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const result = await uploadToWebDavDetailed(p, payload, options?.filename || p.filename);
            return {ok: result.ok, message: result.message};
        },

        async download(profile: SyncProfile, options?: SyncFileOptions): Promise<SyncOpResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const result = await downloadFromWebDavDetailed(p, options?.filename || p.filename);
            if (!result.ok || !result.data) return {ok: false, message: result.message};
            return {ok: true, message: result.message, data: result.data};
        }
    };
}
