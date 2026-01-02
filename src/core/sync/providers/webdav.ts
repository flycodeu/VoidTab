// src/core/sync/providers/webdav.ts
import type {SyncProfile, SyncOpResult, SyncTestResult, WebDavProfile, SyncProvider} from '../types';
import {checkWebDavConnection, uploadToWebDav, downloadFromWebDav} from '../../../shared/utils/webdav';

function asWebDav(profile: SyncProfile): WebDavProfile | null {
    return profile.provider === 'webdav' ? (profile as WebDavProfile) : null;
}

export function createWebDavProvider(): SyncProvider {
    return {
        async test(profile: SyncProfile): Promise<SyncTestResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const ok = await checkWebDavConnection(p);
            return {ok, message: ok ? '连接成功' : '连接失败'};
        },

        async upload(profile: SyncProfile, payload: any): Promise<SyncOpResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const ok = await uploadToWebDav(p, payload);
            return {ok, message: ok ? '云端备份成功' : '上传失败'};
        },

        async download(profile: SyncProfile): Promise<SyncOpResult> {
            const p = asWebDav(profile);
            if (!p) return {ok: false, message: 'provider mismatch'};
            const data = await downloadFromWebDav(p);
            if (!data) return {ok: false, message: '下载失败或无备份'};

            // ✅ 返回字符串（store 里 JSON.parse）
            const text = typeof data === 'string' ? data : JSON.stringify(data);
            return {ok: true, message: '下载成功', data: text};
        }
    };
}
