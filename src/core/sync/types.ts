// src/core/sync/types.ts

export type SyncProviderId = 'webdav' | 'none';

export interface SyncProfileBase {
    provider: SyncProviderId;
    enabled: boolean;
    autoSync: boolean;

    // 同步记录
    lastSyncTime: number;
    lastRemoteEtag?: string;
    lastRemoteMtime?: string;

    // 定时同步间隔（分钟）不填默认 10（scheduler 用）
    intervalMinutes?: number;
}

export interface WebDavProfile extends SyncProfileBase {
    provider: 'webdav';
    url: string;
    username: string;
    password: string;

    folder: string;    // e.g. "voidtab"
    filename: string;  // e.g. "voidtab-backup.json"
}

export interface NoneProfile extends SyncProfileBase {
    provider: 'none';
}

export type SyncProfile = WebDavProfile | NoneProfile;

export interface SyncTestResult {
    ok: boolean;
    message: string;
}

export interface SyncOpResult {
    ok: boolean;
    message: string;

    // download 时可能返回原始字符串
    data?: string;

    // 远端 meta（用于判断远端是否变化）
    remoteEtag?: string;
    remoteMtime?: string;
}

/**
 * ✅ 兼容旧命名：如果你项目里有人在用 SyncDownloadResult，
 * 这里给一个别名，避免到处改 import。
 */
export type SyncDownloadResult = SyncOpResult;

/**
 * Provider 接口约束（registry/service 用）
 */
export interface SyncProvider {
    test(profile: SyncProfile): Promise<SyncTestResult>;

    upload(profile: SyncProfile, payload: any): Promise<SyncOpResult>;

    download(profile: SyncProfile): Promise<SyncOpResult>;
}
