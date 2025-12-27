import type {SyncProfile, SyncTestResult, SyncOpResult, SyncDownloadResult} from '../types.ts';

export interface SyncProvider<T extends SyncProfile = SyncProfile> {
    id: T['provider'];

    test(profile: T): Promise<SyncTestResult>;

    upload(profile: T, payload: any): Promise<SyncOpResult>;

    download(profile: T): Promise<SyncDownloadResult>;
}
