// src/core/sync/scheduler.ts
import type { SyncOpResult, SyncProfile } from './types';
import { syncService } from './service';

export interface SyncSchedulerOptions {
    /** 取当前 sync profile */
    getProfile: () => SyncProfile;

    /** 取要上传的文本（通常 JSON.stringify(config)） */
    getUploadPayload: () => string;

    /** 本地配置变更版本号（每次用户修改 +1） */
    getLocalRevision: () => number;

    /** 当远端有更新时：把远端原始文本交给上层（store）去 parse+migrate+normalize */
    onRemotePayload: (remoteText: string, meta?: { etag?: string; mtime?: string }) => Promise<void> | void;

    /** 同步成功后，允许上层更新 profile 的 lastSyncTime/etag/mtime */
    onSyncMeta?: (meta: { lastSyncTime: number; etag?: string; mtime?: string }) => void;

    /** 失败时回调（可选） */
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

        // 启动时先记录当前 revision（避免一启动就误判要上传）
        this.lastUploadedRevision = this.opt.getLocalRevision();

        this.tick(); // 立即跑一次
        this.scheduleNext();
    }

    stop() {
        this.running = false;
        if (this.timer != null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** 手动触发（比如 UI 点一次“立即同步”时也可以用） */
    async tick() {
        if (!this.running) return;

        const profile = this.opt.getProfile();
        if (!profile.enabled || profile.provider === 'none') return;

        const intervalMin = profile.intervalMinutes ?? 10;

        // autoSync=false 时：scheduler 仍可存在，但只在手动 tick 时执行
        // 如果你希望 autoSync=false 完全不跑 tick，把下面改成 return
        if (!profile.autoSync) return;

        try {
            // 1) 先下载，判断远端是否变化（以 etag/mtime 为准）
            const dl: SyncOpResult = await syncService.download(profile);

            // download 失败：直接结束本轮
            if (!dl.ok) return;

            const remoteChanged =
                (dl.remoteEtag && dl.remoteEtag !== (profile.lastRemoteEtag || '')) ||
                (dl.remoteMtime && dl.remoteMtime !== (profile.lastRemoteMtime || ''));

            // 2) 如果远端变了：交给上层合并/覆盖（这里不做 merge，交给 config 层）
            if (remoteChanged && dl.data) {
                await this.opt.onRemotePayload(dl.data, { etag: dl.remoteEtag, mtime: dl.remoteMtime });

                // 更新 meta
                this.opt.onSyncMeta?.({
                    lastSyncTime: Date.now(),
                    etag: dl.remoteEtag,
                    mtime: dl.remoteMtime
                });

                // 远端覆盖本地后，本地 revision 应该算“已同步”
                this.lastUploadedRevision = this.opt.getLocalRevision();

                // 本轮结束
                return;
            }

            // 3) 远端没变：如果本地有变更 revision -> 上传
            const localRev = this.opt.getLocalRevision();
            if (localRev > this.lastUploadedRevision) {
                const payload = this.opt.getUploadPayload();
                const up: SyncOpResult = await syncService.upload(profile, payload);

                if (up.ok) {
                    this.lastUploadedRevision = localRev;
                    this.opt.onSyncMeta?.({
                        lastSyncTime: Date.now(),
                        etag: up.remoteEtag,
                        mtime: up.remoteMtime
                    });
                }
            }

            // 4) 继续下一轮
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
        const ms = Math.max(1, min) * 60 * 1000;

        this.timer = window.setTimeout(() => {
            this.tick();
        }, ms);
    }
}
