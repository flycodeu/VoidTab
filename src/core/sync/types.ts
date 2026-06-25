// src/core/sync/types.ts

export type SyncProviderId = 'webdav' | 'none';

export type SyncConflictState = 'none' | 'detected' | 'pending' | 'resolving';
export type SyncRecoveryRecordKind =
    | 'install-intent-restored'
    | 'missing-package'
    | 'package-revoked'
    | 'layout-overlap'
    | 'revision-conflict';

/**
 * The file schema a profile is allowed to write. This is device-local state:
 * it must never be copied into a remote configuration payload.
 */
export type SyncSchemaChannel = 'legacy-v5' | 'v6';

/** Optional per-operation override used by the v6 sibling-file channel. */
export interface SyncFileOptions {
    filename?: string;
}

export interface ConflictSummary {
    localGroupCount: number;
    remoteGroupCount: number;
    localSiteCount: number;
    remoteSiteCount: number;
    localThemeLabel: string;
    remoteThemeLabel: string;
    localLastModified: number;
    remoteLastModified: number;
}

export interface ConflictSnapshot {
    remoteText: string;
    remoteMeta: { etag?: string; mtime?: string };
    localHash: string;
    detectedAt: number;
    summary: ConflictSummary;
}

export interface SyncRecoveryRecord {
    id: string;
    kind: SyncRecoveryRecordKind;
    message: string;
    createdAt: number;
    workspaceId?: string;
    tileId?: string;
    tileType?: string;
}

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

    // 冲突检测
    lastSyncedHash?: string;
    conflictState?: SyncConflictState;
    conflictSnapshot?: ConflictSnapshot;
    recoveryRecords?: SyncRecoveryRecord[];

    /**
     * Set by the explicit v5 -> v6 migration transaction. Auto-sync must not
     * write until the user confirms every device has a v6-capable client.
     */
    syncSchemaUpgradePending?: boolean;

    /** The confirmed write channel; v6 always writes to a sibling file. */
    syncSchemaChannel?: SyncSchemaChannel;
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
 *   兼容旧命名：如果你项目里有人在用 SyncDownloadResult，
 * 这里给一个别名，避免到处改 import。
 */
export type SyncDownloadResult = SyncOpResult;

/**
 * Provider 接口约束（registry/service 用）
 */
export interface SyncProvider {
    test(profile: SyncProfile): Promise<SyncTestResult>;

    upload(profile: SyncProfile, payload: any, options?: SyncFileOptions): Promise<SyncOpResult>;

    download(profile: SyncProfile, options?: SyncFileOptions): Promise<SyncOpResult>;
}
