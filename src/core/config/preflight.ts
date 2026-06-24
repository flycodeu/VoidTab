import {MAX_SUPPORTED_CONFIG_VERSION} from './types.ts';
import {ConfigVersionTooNew} from './versioning.ts';

export interface ConfigReaderPreflight {
    /** Missing versions are legacy payloads and are handled by the v5 migrator. */
    version: number;
    /** Optional export contract; a reader below this version must reject safely. */
    minReaderVersion?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const finiteVersion = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;

/**
 * Checks version metadata before a caller invokes a normalizer or migration.
 * This is the single safe gate for import and remote sync paths.
 */
export function preflightConfigForReader(
    raw: unknown,
    // The persisted writer can remain on v5 while the runtime already knows
    // how to safely read v6. Import and sync paths must gate on reader
    // capability, not on the version used for a newly-created default config.
    supportedVersion: number = MAX_SUPPORTED_CONFIG_VERSION,
): ConfigReaderPreflight {
    if (!isRecord(raw)) throw new TypeError('配置根节点必须是对象');

    const version = finiteVersion(raw.version) ?? 0;
    const minReaderVersion = finiteVersion(raw.minReaderVersion);
    const requiredVersion = Math.max(version, minReaderVersion ?? 0);

    if (requiredVersion > supportedVersion) {
        throw new ConfigVersionTooNew(requiredVersion, supportedVersion);
    }

    return {
        version,
        ...(minReaderVersion === undefined ? {} : {minReaderVersion}),
    };
}

export function isConfigVersionTooNew(error: unknown): error is ConfigVersionTooNew {
    return error instanceof ConfigVersionTooNew;
}
