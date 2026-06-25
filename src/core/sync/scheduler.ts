// src/core/sync/scheduler.ts
import type {SyncFileOptions, SyncOpResult, SyncProfile, ConflictSnapshot} from './types';
import { syncService } from './service';

export interface SyncSchedulerOptions {
    getProfile: () => SyncProfile;
    /** Selects a schema-specific file without mutating the user's legacy profile. */
    getFileOptions?: () => SyncFileOptions | undefined;
    getUploadPayload: () => string;
    getLocalRevision: () => number;

    /** Current content hash of local config (for dirty detection). */
    getCurrentHash: () => string;

    /** Hash that was recorded at the last successful sync. */
    getLastSyncedHash: () => string;

    /** Called when remote is newer AND local is clean → safe to auto-apply. */
    onRemotePayload: (remoteText: string, meta?: { etag?: string; mtime?: string }) => Promise<void> | void;

    /** Called when both local and remote changed. Return true when the caller merged it automatically. */
    onConflictDetected: (snapshot: ConflictSnapshot) => Promise<boolean | void> | boolean | void;

    onSyncMeta?: (meta: { lastSyncTime: number; etag?: string; mtime?: string }) => void;
    onError?: (err: unknown) => void;
}

export class SyncScheduler {
    private timer: number | null = null;
    private running = false;
    private lastUploadedRevision = 0;

    constructor(private readonly opt: SyncSchedulerOptions) {}

    start() {
        if (this.running) return;
        this.running = true;
        this.lastUploadedRevision = this.opt.getLocalRevision();
        this.tick();
        this.scheduleNext();
    }

    stop() {
        this.running = false;
        if (this.timer != null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    async tick() {
        if (!this.running) return;

        const profile = this.opt.getProfile();
        const fileOptions = this.opt.getFileOptions?.();
        if (!profile.enabled || profile.provider === 'none') return;
        if (!profile.autoSync) return;

        // If a conflict is pending user decision, pause auto-sync entirely.
        if (profile.conflictState === 'pending' || profile.conflictState === 'detected') return;

        const intervalMin = profile.intervalMinutes ?? 10;

        try {
            const dl: SyncOpResult = await syncService.download(profile, fileOptions);
            if (!dl.ok) {
                this.scheduleNext(intervalMin);
                return;
            }

            const remoteChanged =
                (dl.remoteEtag && dl.remoteEtag !== (profile.lastRemoteEtag ?? '')) ||
                (dl.remoteMtime && dl.remoteMtime !== (profile.lastRemoteMtime ?? ''));

            if (remoteChanged && dl.data) {
                const currentHash = this.opt.getCurrentHash();
                const syncedHash = this.opt.getLastSyncedHash();
                const localDirty = !!syncedHash && currentHash !== syncedHash;

                if (localDirty) {
                    // True conflict: both sides changed since last sync.
                    // Build a minimal snapshot and hand off to the UI layer.
                    const snapshot: ConflictSnapshot = {
                        remoteText: dl.data,
                        remoteMeta: { etag: dl.remoteEtag, mtime: dl.remoteMtime },
                        localHash: currentHash,
                        detectedAt: Date.now(),
                        // summary is filled in by syncActions which has access to full config
                        summary: {
                            localGroupCount: 0,
                            remoteGroupCount: 0,
                            localSiteCount: 0,
                            remoteSiteCount: 0,
                            localThemeLabel: '',
                            remoteThemeLabel: '',
                            localLastModified: 0,
                            remoteLastModified: 0,
                        },
                    };
                    const handled = await this.opt.onConflictDetected(snapshot);
                    if (handled) {
                        this.scheduleNext(intervalMin);
                        return;
                    }
                    // Do not schedule next tick — scheduler stays paused until conflict is resolved.
                    return;
                }

                // Local is clean (or first sync) → safe to auto-apply remote.
                await this.opt.onRemotePayload(dl.data, { etag: dl.remoteEtag, mtime: dl.remoteMtime });
                this.opt.onSyncMeta?.({ lastSyncTime: Date.now(), etag: dl.remoteEtag, mtime: dl.remoteMtime });
                this.lastUploadedRevision = this.opt.getLocalRevision();
                this.scheduleNext(intervalMin);
                return;
            }

            // Remote unchanged: upload if local has new changes.
            const localRev = this.opt.getLocalRevision();
            if (localRev > this.lastUploadedRevision) {
                const payload = this.opt.getUploadPayload();
                const up: SyncOpResult = await syncService.upload(profile, payload, fileOptions);
                if (up.ok) {
                    this.lastUploadedRevision = localRev;
                    this.opt.onSyncMeta?.({ lastSyncTime: Date.now(), etag: up.remoteEtag, mtime: up.remoteMtime });
                }
            }

            this.scheduleNext(intervalMin);
        } catch (e) {
            this.opt.onError?.(e);
            this.scheduleNext(intervalMin);
        }
    }

    private scheduleNext(intervalMinutes?: number) {
        if (!this.running) return;
        if (this.timer != null) clearTimeout(this.timer);
        const min = intervalMinutes ?? (this.opt.getProfile().intervalMinutes ?? 10);
        this.timer = window.setTimeout(() => this.tick(), Math.max(1, min) * 60 * 1000);
    }
}
