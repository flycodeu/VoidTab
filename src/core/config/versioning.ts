/** Raised when a client would otherwise overwrite data written by a newer schema. */
export class ConfigVersionTooNew extends Error {
    readonly code = 'CONFIG_VERSION_TOO_NEW' as const;

    constructor(
        readonly foundVersion: number,
        readonly supportedVersion: number,
    ) {
        super(`配置版本 ${foundVersion} 高于当前客户端支持的版本 ${supportedVersion}`);
        this.name = 'ConfigVersionTooNew';
    }
}
