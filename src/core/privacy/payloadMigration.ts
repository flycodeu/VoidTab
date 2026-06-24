import type {
    Group,
    PrivacyVaultPayloadV1,
    PrivacyVaultPayloadV2,
    SiteItem,
} from '../config/types.ts';
import type {TileInstance, Workspace} from '../tiles/contracts.ts';
import {migrateV5ToV6, type V5ToV6MigrationOptions, type V5ToV6MigrationWarning} from '../config/migrateV5ToV6.ts';
import {toLegacyTileHostItem} from '../tiles/tileHostAdapter.ts';

export interface PrivacyPayloadV1MigrationResult {
    payload: PrivacyVaultPayloadV2;
    warnings: V5ToV6MigrationWarning[];
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const asLegacyGroup = (workspace: Workspace): Group => ({
    id: workspace.id,
    title: workspace.title,
    icon: workspace.icon,
    ...(workspace.iconColor ? {iconColor: workspace.iconColor} : {}),
    ...(workspace.iconBgColor ? {iconBgColor: workspace.iconBgColor} : {}),
    ...(workspace.sortKey ? {sortKey: workspace.sortKey} : {}),
    workspaceLayout: workspace.workspaceLayout,
    items: workspace.tiles.map(toLegacyTileHostItem),
});

const asLegacySite = (tile: TileInstance): SiteItem => toLegacyTileHostItem(tile);

function migrateLegacyGroup(group: Group, options: V5ToV6MigrationOptions) {
    return migrateV5ToV6({version: 5, layout: [group]}, options).config.layout[0];
}

function migrateLegacySite(
    site: SiteItem,
    originalWorkspaceId: string,
    originalWorkspaceTitle: string | undefined,
    options: V5ToV6MigrationOptions,
) {
    const workspace = migrateV5ToV6({
        version: 5,
        layout: [{
            id: originalWorkspaceId || 'privacy-recovery-workspace',
            title: originalWorkspaceTitle || '恢复的内容',
            icon: 'Folder',
            items: [site],
        }],
    }, options).config.layout[0];
    return workspace.tiles[0];
}

/** Pure v1 -> v2 payload migration; encryption is deliberately handled by the caller. */
export function migratePrivacyVaultPayloadV1ToV2(
    payload: PrivacyVaultPayloadV1,
    options: V5ToV6MigrationOptions,
): PrivacyPayloadV1MigrationResult {
    const warnings: V5ToV6MigrationWarning[] = [];
    const workspaces = payload.groups.map((entry) => {
        const result = migrateV5ToV6({version: 5, layout: [entry.group]}, options);
        warnings.push(...result.warnings);
        return {
            workspace: result.config.layout[0],
            originalIndex: entry.originalIndex,
            movedAt: entry.movedAt,
        };
    });
    const tiles = payload.sites.map((entry) => {
        const result = migrateV5ToV6({
            version: 5,
            layout: [{
                id: entry.originalGroupId || 'privacy-recovery-workspace',
                title: entry.originalGroupTitle || '恢复的内容',
                icon: 'Folder',
                items: [entry.site],
            }],
        }, options);
        warnings.push(...result.warnings);
        return {
            tile: result.config.layout[0].tiles[0],
            originalWorkspaceId: entry.originalGroupId,
            ...(entry.originalGroupTitle ? {originalWorkspaceTitle: entry.originalGroupTitle} : {}),
            originalIndex: entry.originalIndex,
            movedAt: entry.movedAt,
        };
    });

    return {payload: {version: 2, workspaces, tiles}, warnings};
}

/** Temporary read-only projection for the current v5 privacy UI and actions. */
export function projectPrivacyVaultPayloadV2ToV1(payload: PrivacyVaultPayloadV2): PrivacyVaultPayloadV1 {
    return cloneJson({
        version: 1,
        groups: payload.workspaces.map((entry) => ({
            group: asLegacyGroup(entry.workspace),
            originalIndex: entry.originalIndex,
            movedAt: entry.movedAt,
        })),
        sites: payload.tiles.map((entry) => ({
            site: asLegacySite(entry.tile),
            originalGroupId: entry.originalWorkspaceId,
            ...(entry.originalWorkspaceTitle ? {originalGroupTitle: entry.originalWorkspaceTitle} : {}),
            originalIndex: entry.originalIndex,
            movedAt: entry.movedAt,
        })),
    });
}

export function migrateLegacyPrivacyGroupToWorkspace(group: Group, options: V5ToV6MigrationOptions) {
    return migrateLegacyGroup(group, options);
}

export function migrateLegacyPrivacySiteToTile(
    site: SiteItem,
    originalWorkspaceId: string,
    originalWorkspaceTitle: string | undefined,
    options: V5ToV6MigrationOptions,
) {
    return migrateLegacySite(site, originalWorkspaceId, originalWorkspaceTitle, options);
}

export const workspaceToLegacyPrivacyGroup = asLegacyGroup;
export const tileToLegacyPrivacySite = asLegacySite;
