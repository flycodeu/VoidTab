/**
 * Stable, JSON-only inputs for the P3.8 migration contract. These fixtures
 * intentionally model persisted v5 payloads rather than Vue/Pinia state.
 */

export const P3_FIXTURE_MIGRATION_OPTIONS = {
    deviceId: 'p3-8-fixture-device',
    migratedAt: 1_735_689_600_000,
} as const;

export const LEGACY_BUILTIN_WIDGET_TYPES = [
    'clock',
    'calendar',
    'weather',
    'system_monitor',
    'github_trending',
    'salary',
    'holiday',
    'wooden_fish',
    'terminal_buffer',
    'jwt_sentry',
    'base64_codec',
    'stock_ticker',
    'novel_reader',
    'code_lookup',
    'ip_info',
    'cron',
    'photo_wall',
    'music_embed',
    'site_list',
    'snake',
    'survivor',
    // Legacy built-ins that may exist in old persisted profiles even when a
    // current UI surface no longer exposes an add button for them.
    'countdown',
    'greeting',
    'habit_tracker',
    'search',
    'todo',
] as const;

const v5 = (layout: unknown[]) => ({version: 5, layout});

export const createPureBookmarkFlowFixture = () => v5([{
    id: 'flow-bookmarks',
    title: 'Flow bookmarks',
    icon: 'Bookmarks',
    sortKey: 'custom',
    items: [
        {
            id: 'alpha', kind: 'site', title: 'Alpha', url: 'https://alpha.example/path?q=1',
            icon: 'https://alpha.example/icon.png', iconType: 'auto', iconValue: 'AL',
            bgColor: '#123456', remark: 'first', tags: ['work', 'alpha'], createdAt: 101,
        },
        {
            id: 'beta', kind: 'site', title: 'Beta', url: 'https://beta.example',
            iconType: 'text', iconValue: 'BE', bgColor: '#654321', tags: ['reference'], createdAt: 102,
        },
        {
            id: 'gamma', kind: 'site', title: 'Gamma', url: 'https://gamma.example',
            iconType: 'icon', iconValue: 'Globe', tags: [], createdAt: 103,
        },
    ],
}]);

export const createBuiltinWidgetFixture = () => v5([{
    id: 'all-builtins',
    title: 'All built-ins',
    icon: 'SquaresFour',
    items: LEGACY_BUILTIN_WIDGET_TYPES.map((widgetType, index) => ({
        id: `builtin-${index + 1}`,
        kind: 'widget',
        widgetType,
        title: `Widget ${index + 1}`,
        w: index % 3 === 0 ? 4 : 2,
        h: index % 4 === 0 ? 3 : 2,
        createdAt: 1_000 + index,
        widgetConfig: {
            ordinal: index + 1,
            widgetType,
            enabled: index % 2 === 0,
            nested: {label: `fixture-${index + 1}`},
            values: [index, index + 1],
        },
    })),
}]);

export const createCanvasPlacementFixture = () => v5([{
    id: 'canvas-profiles',
    title: 'Canvas profiles',
    icon: 'GridFour',
    workspaceLayout: {
        mode: 'canvas',
        profiles: {
            desktop: {unit: 96, gap: 16, minCols: 12, maxCols: 14},
            tablet: {unit: 88, gap: 14, minCols: 10, maxCols: 10},
            mobile: {unit: 76, gap: 12, minCols: 9, maxCols: 9},
        },
    },
    items: [
        {
            id: 'three-by-four', kind: 'site', title: '3x4', url: 'https://three.example',
            layouts: {
                desktop: {x: 0, y: 0, w: 3, h: 4},
                tablet: {x: 0, y: 0, w: 3, h: 4},
                mobile: {x: 0, y: 0, w: 3, h: 4},
            },
        },
        {
            id: 'nine-by-nine', kind: 'widget', widgetType: 'photo_wall', title: '9x9',
            widgetConfig: {layout: 'gallery', columns: 9},
            layouts: {
                desktop: {x: 4, y: 0, w: 9, h: 9},
                tablet: {x: 1, y: 5, w: 9, h: 9},
                mobile: {x: 0, y: 5, w: 9, h: 9},
            },
        },
    ],
}]);

export const createUnregisteredWidgetFixture = () => v5([{
    id: 'unregistered-widget',
    title: 'Unregistered widget',
    icon: 'WarningCircle',
    items: [{
        id: 'retired-widget',
        kind: 'widget',
        widgetType: 'retired/acme-weather',
        title: 'Retired weather',
        widgetConfig: {location: 'Shanghai', units: 'metric', nested: {retry: false}},
        layouts: {
            desktop: {x: 2, y: 3, w: 4, h: 2},
            tablet: {x: 1, y: 2, w: 4, h: 2},
            mobile: {x: 0, y: 1, w: 3, h: 2},
        },
    }],
}]);

export const createMalformedItemFixture = () => v5([{
    id: 'partially-malformed',
    title: 'Partially malformed',
    icon: 'Warning',
    items: [
        {id: 'healthy-site', kind: 'site', title: 'Healthy', url: 'https://healthy.example', tags: ['keep']},
        {id: 'bad-settings', kind: 'widget', widgetType: 'clock', widgetConfig: ['not', 'an', 'object']},
        {id: 'bad-kind', kind: 'unknown', title: 'Bad kind', url: 'https://bad.example'},
        null,
    ],
}]);

export const createPrivacyVaultV1Fixture = () => ({
    version: 1 as const,
    groups: [{
        group: {
            id: 'vault-workspace',
            title: 'Vault workspace',
            icon: 'Lock',
            items: [{id: 'vault-site', kind: 'site', title: 'Vault site', url: 'https://vault.example'}],
        },
        originalIndex: 1,
        movedAt: 200,
    }],
    sites: [{
        site: {id: 'restore-at-one', kind: 'site', title: 'Restore at one', url: 'https://restore.example'},
        originalGroupId: 'restore-target',
        originalGroupTitle: 'Restore target',
        originalIndex: 1,
        movedAt: 201,
    }],
});
