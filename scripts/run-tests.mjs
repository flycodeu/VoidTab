import assert from 'node:assert/strict';
import {readFile, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const tmpRoot = path.join(root, '.tmp-build', 'tests');

const checks = [];
const test = (name, fn) => checks.push({name, fn});

async function runBundledTypeScript(name, source) {
  const dir = path.join(tmpRoot, name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  const entry = path.join(dir, 'entry.ts');
  const outfile = path.join(dir, 'entry.mjs');

  await rm(dir, {recursive: true, force: true});
  await mkdir(dir, {recursive: true});
  await writeFile(entry, source, 'utf8');

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  await rm(dir, {recursive: true, force: true});
}

test('manifest enables favicon fallbacks without broad host permissions', async () => {
  const manifest = JSON.parse(await read('public/manifest.json'));
  assert.ok(manifest.permissions.includes('favicon'));
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.ok(manifest.host_permissions.includes('https://api.open-meteo.com/*'));
  assert.ok(manifest.host_permissions.includes('https://query1.finance.yahoo.com/*'));
  assert.ok(manifest.host_permissions.includes('https://api.iowen.cn/*'));
  assert.ok(manifest.host_permissions.includes('https://t2.gstatic.com/*'));
  assert.ok(manifest.host_permissions.includes('https://icons.duckduckgo.com/*'));
  assert.ok(manifest.host_permissions.includes('https://favicon.im/*'));
  assert.ok(manifest.host_permissions.includes('https://unavatar.io/*'));
});

test('favicon probing avoids extension fetch false negatives', async () => {
  const icon = await read('src/shared/utils/icon.ts');
  const cache = await read('src/shared/utils/siteIconCache.ts');

  assert.match(icon, /canUseBrowserFaviconApi/);
  assert.match(icon, /permissions\.includes\('favicon'\)/);
  assert.doesNotMatch(icon, /if\s*\(\s*isExtensionContext\(\)\s*\)\s*return true/);
  assert.match(icon, /PERSISTENT_FAIL_STORAGE_KEY\s*=\s*'voidtab:icon_candidate_fail:v4'/);
  assert.match(icon, /createProbeImageObjectUrl/);
  assert.match(icon, /FETCHABLE_ICON_PROBE_HOSTS/);
  assert.match(icon, /probeIconCandidateBatch/);
  assert.match(icon, /parallelism: options\?\.parallelism/);
  assert.match(cache, /SITE_ICON_CACHE_VERSION\s*=\s*15/);
  assert.match(icon, /'google\.com': 'https:\/\/www\.google\.com\/favicon\.ico'/);
  assert.match(icon, /'notion\.so': 'https:\/\/www\.notion\.so\/images\/favicon\.ico'/);
  assert.doesNotMatch(cache, /if\s*\(\s*isExtensionContext\(\)\s*\)\s*return true/);
});

test('auto site icons preserve legacy direct icon sources', async () => {
  const icon = await read('src/shared/utils/icon.ts');
  const card = await read('src/features/home/components/GlassCard.vue');

  assert.match(icon, /resolveDirectIconUrl/);
  assert.match(icon, /getInstantAutoIconUrl/);
  assert.match(icon, /canUseDirectIconInstantly/);
  assert.match(icon, /parsed\.protocol === 'chrome-extension:'/);
  assert.match(icon, /parsed\.pathname\.startsWith\('\/_favicon\/'\)/);
  assert.match(icon, /if \(raw\.startsWith\('blob:'\)\) return ''/);
  assert.match(card, /getDirectIconFallbackUrl\(props\.item\.icon,\s*props\.item\.iconValue,\s*props\.item\.url\)/);
  assert.match(card, /getInstantAutoIconUrl\(props\.item\.url,\s*props\.item\.icon,\s*props\.item\.iconValue\)/);
  assert.match(card, /directIconErrorUrl/);
  assert.match(card, /canUseDirectIconUrl\(\)/);
});

test('web auto icons avoid CORP-blocked direct site favicons', async () => {
  const icon = await read('src/shared/utils/icon.ts');
  const preloader = await read('src/shared/utils/iconPreloader.ts');
  const cache = await read('src/shared/utils/siteIconCache.ts');
  const siteIcon = await read('src/features/home/components/SiteIcon.vue');

  assert.match(icon, /provider === 'browser_favicon'/);
  assert.doesNotMatch(icon, /return getFastIconCandidates\(url\)\[0\] \|\| ''/);
  assert.doesNotMatch(icon, /buildExternalCandidates\(thirdPartyDomains,\s*\{webSafeOnly:\s*true\}\)/);
  assert.match(icon, /first_party_proxy/);
  assert.match(icon, /buildFirstPartyProxyCandidates/);
  assert.match(icon, /candidate\.provider === 'browser_favicon' \|\| candidate\.provider === 'preset'/);
  assert.match(siteIcon, /url\.includes\('\/api\/favicon'\) \? 5200 : 1600/);
  assert.match(icon, /if \(privateOrLocal\) \{\s*candidates\.push\(\.\.\.buildSiteOriginCandidates\(origin\)\);/);
  assert.doesNotMatch(preloader, /if \(isExtensionContext\(\)\) return true/);
  assert.match(preloader, /return false/);
  assert.match(cache, /staleDisplayOnlyDirectSite/);
  assert.match(cache, /!isThirdPartyFaviconSource\(source\)/);
});

test('favicon proxy is available in web and dev builds', async () => {
  const icon = await read('src/shared/utils/icon.ts');
  const vite = await read('vite.config.ts');
  const handler = await read('api/favicon.js');
  const core = await read('api/favicon-core.js');

  assert.match(icon, /new URL\('\/api\/favicon',\s*window\.location\.origin\)/);
  assert.match(vite, /createFaviconApiDevPlugin/);
  assert.match(vite, /fetchFaviconProxyPayload\(url\.searchParams\.get\('url'\)\)/);
  assert.match(handler, /fetchFaviconProxyPayload\(rawUrl\)/);
  assert.match(core, /getDeclaredCandidates/);
  assert.match(core, /buildProviderCandidates/);
  assert.match(core, /assertPublicHttpUrl/);
});

test('sidebar active group has stable scroll target', async () => {
  const sidebar = await read('src/features/navigation/components/SideBar.vue');
  const button = await read('src/features/navigation/components/sidebar/SidebarGroupButton.vue');

  assert.match(sidebar, /scrollActiveGroupIntoView/);
  assert.match(sidebar, /\[data-group-id\]/);
  assert.match(sidebar, /host\.scrollTo\(\{top: targetTop,\s*behavior\}\)/);
  assert.match(sidebar, /host\.scrollTo\(\{left: targetLeft,\s*behavior\}\)/);
  assert.match(button, /:data-group-id="group\.id"/);
});

test('AI markdown rendering is sanitized before v-html', async () => {
  const panel = await read('src/features/ai/components/AiChatPanel.vue');
  const highlight = await read('src/features/ai/utils/highlightLanguages.ts');
  const stream = await read('src/shared/utils/aiStream.ts');

  assert.match(panel, /import DOMPurify from 'dompurify'/);
  assert.match(panel, /html:\s*false/);
  assert.match(panel, /DOMPurify\.sanitize/);
  assert.match(panel, /ALLOWED_URI_REGEXP/);
  assert.match(panel, /readChatCompletionStream/);
  assert.doesNotMatch(panel, /highlight\.js\/lib\/languages\/bash/);
  assert.match(highlight, /import\('highlight\.js\/lib\/languages\/bash'\)/);
  assert.match(highlight, /loadHighlightLanguage/);
  assert.match(stream, /decoder\.decode\(value,\s*\{stream:\s*true\}\)/);
  assert.match(stream, /trimmed\.startsWith\('data:'\)/);
});

test('AI prompt templates are user-managed config data', async () => {
  const panel = await read('src/features/ai/components/AiChatPanel.vue');
  const types = await read('src/core/config/types.ts');
  const defaults = await read('src/core/config/default.ts');
  const validate = await read('src/core/config/validate.ts');

  assert.match(types, /interface AiPromptTemplate/);
  assert.match(defaults, /cloneDefaultAiPromptTemplates/);
  assert.match(validate, /ai\.templates/);
  assert.match(panel, /promptTemplates/);
  assert.match(panel, /configStore\.config\.ai\.templates/);
  assert.match(panel, /showTemplateLibrary/);
  assert.match(panel, /aria-controls="ai-template-library"/);
  assert.match(panel, /openTemplateEditor/);
  assert.match(panel, /restoreDefaultPromptTemplates/);
  assert.match(panel, /selectedTemplateId/);

  await runBundledTypeScript('ai-prompt-template-normalization', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';

    const migrated = normalizeConfig({
      ai: {
        baseUrl: 'https://example.com/v1',
        model: 'custom-model',
        temperature: 9,
        maxHistory: 0,
      },
    });
    assert.equal(migrated.ai.baseUrl, 'https://example.com/v1');
    assert.equal(migrated.ai.model, 'custom-model');
    assert.equal(migrated.ai.temperature, 2);
    assert.equal(migrated.ai.maxHistory, 1);
    assert.ok(migrated.ai.templates.length >= 3);

    const cleared = normalizeConfig({
      ai: {
        templates: [],
        systemPrompt: 'Be direct.',
      },
    });
    assert.deepEqual(cleared.ai.templates, []);
    assert.equal(cleared.ai.systemPrompt, 'Be direct.');

    const repaired = normalizeConfig({
      ai: {
        templates: [
          { title: '', content: 'drop me', category: 'bad' },
          { title: 'Keep', content: 'Hello {{name}}', category: 'work' },
        ],
      },
    });
    assert.equal(repaired.ai.templates.length, 1);
    assert.equal(repaired.ai.templates[0].title, 'Keep');
    assert.equal(repaired.ai.templates[0].category, 'work');
  `);
});

test('config storage encrypts sensitive local fields and strips sync payload', async () => {
  const sensitive = await read('src/core/config/sensitive.ts');
  const repository = await read('src/core/config/repository.ts');
  const syncActions = await read('src/stores/config/syncActions.ts');
  const v6Channel = await read('src/core/sync/v6Channel.ts');
  const validate = await read('src/core/config/validate.ts');

  assert.match(sensitive, /sync\.password/);
  assert.match(sensitive, /ai\.apiKey/);
  assert.match(sensitive, /runtime\.auth\.jwtToken/);
  assert.match(sensitive, /ENCRYPTED_VALUE_PREFIX\s*=\s*'enc:v1:'/);
  assert.match(repository, /sealSensitiveConfigForStorage/);
  assert.match(repository, /assertConfigValidForSave/);
  assert.match(repository, /openSensitiveConfigFromStorage/);
  assert.match(repository, /loadForBoot/);
  assert.match(repository, /completeBootLoad/);
  assert.match(repository, /restoreWallpaper:\s*false/);
  assert.match(repository, /saveLegacyMigration:\s*false/);
  assert.match(v6Channel, /stripSensitiveConfigForSync/);
  assert.match(syncActions, /mergeLocalSensitiveFields/);
  assert.match(syncActions, /buildSyncPayload/);
  assert.match(validate, /validateConfigForSave/);
  assert.match(validate, /ConfigSchemaValidationError/);

  await runBundledTypeScript('config-schema-normalized-optionals', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';
    import {validateConfigForSave} from '../../../src/core/config/validate.ts';

    const normalized = normalizeConfig({
      theme: {
        readability: {
          enabled: true,
          mode: 'auto',
          strength: 22,
          blur: 0,
          desaturate: 0,
          tint: undefined,
        },
      },
      layout: [{
        id: 'g1',
        title: '默认',
        icon: 'Folder',
        items: [{
          id: 's1',
          title: 'Render',
          url: 'https://render.com/docs',
          iconType: 'auto',
          iconValue: undefined,
          bgColor: undefined,
          createdAt: undefined,
        }],
      }],
    });

    const result = validateConfigForSave(normalized);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal('tint' in normalized.theme.readability, false);
  `);
});

test('config store delegates major action groups to focused modules', async () => {
  const store = await read('src/stores/useConfigStore.ts');

  assert.match(store, /createLayoutActions/);
  assert.match(store, /createSiteActions/);
  assert.match(store, /createIconActions/);
  assert.match(store, /createSyncActions/);
  assert.match(store, /createLifecycleActions/);
});

test('root app is wrapped by ErrorBoundary and still mounts Toast', async () => {
  const app = await read('src/App.vue');
  assert.match(app, /import ErrorBoundary/);
  assert.match(app, /<ErrorBoundary>/);
  assert.match(app, /<Toast \/>/);
});

test('interval widgets pause while document is hidden', async () => {
  const composable = await read('src/shared/composables/useVisibilityInterval.ts');
  const clock = await read('src/features/widgets/builtins/clock/ClockWidget.vue');
  const calendar = await read('src/features/widgets/builtins/calendar/CalendarWidget.vue');
  const cron = await read('src/features/widgets/builtins/cron/CronWidget.vue');

  assert.match(composable, /useDocumentVisibility/);
  assert.match(composable, /visibility\.value === 'hidden'/);
  assert.match(clock, /useVisibilityInterval\(updateClock,\s*1000/);
  assert.match(calendar, /useVisibilityInterval\(updateTime,\s*60000/);
  assert.match(cron, /useVisibilityInterval\(calculateNextRun,\s*1000/);
});

test('MainGrid measures focus/sidebar container changes on the next frame', async () => {
  const grid = await read('src/features/home/components/MainGrid.vue');
  const home = await read('src/features/home/components/HomeMain.vue');
  assert.match(grid, /useDebounceFn/);
  assert.match(grid, /recalcGridDebounced/);
  assert.match(grid, /scheduleImmediateGridMeasure/);
  assert.match(grid, /new ResizeObserver\(\(\) => scheduleImmediateGridMeasure\(\)\)/);
  assert.match(home, /<MainGrid\s+v-show="!isFocusMode"/);
});

test('TileHost routes canonical tiles through one legacy-prop adapter', async () => {
  const grid = await read('src/features/home/components/MainGrid.vue');
  const host = await read('src/features/home/components/TileHost.vue');
  const registry = await read('src/core/tiles/registry.ts');

  assert.match(grid, /import TileHost/);
  assert.match(grid, /<TileHost/);
  assert.doesNotMatch(grid, /v-if="item\.kind === 'widget'"/);
  assert.match(host, /resolveTileDefinition/);
  assert.match(host, /tile: TileInstance/);
  assert.match(host, /toLegacyTileHostItem/);
  assert.match(host, /<WidgetCard/);
  assert.match(host, /<GlassCard/);
  assert.match(registry, /registerBuiltinTileType/);
  assert.doesNotMatch(registry, /SiteItem/);

  assert.match(registry, /id: SITE_TILE_TYPE/);
  assert.match(registry, /id: toBuiltinTileType\(widget\.type\)/);
  assert.match(registry, /renderer: \{kind: 'site'\}/);
  assert.match(registry, /createUnsupportedExternalTileDefinition/);
  assert.match(registry, /builtinTileTypes\.get\(tileType\) \|\| createUnsupportedExternalTileDefinition\(tileType\)/);
  assert.match(registry, /renderer: \{kind: 'widget', widgetType/);
});

test('P3.1 keeps v5 data at one pure canonical tile boundary', async () => {
  const contracts = await read('src/core/tiles/contracts.ts');
  const adapter = await read('src/core/tiles/legacyV5Adapter.ts');
  const tileTypes = await read('src/core/tiles/tileType.ts');

  assert.match(contracts, /interface SiteTile extends TileBase/);
  assert.match(contracts, /interface ComponentTile extends TileBase/);
  assert.match(contracts, /type TileInstance = SiteTile \| ComponentTile/);
  assert.match(contracts, /type BuiltinTileType = `builtin:\$\{string\}`/);
  assert.match(contracts, /type ExternalTileType = `external:\$\{string\}`/);
  assert.match(adapter, /export function adaptLegacySiteItem/);
  assert.doesNotMatch(adapter, /from ['"]vue['"]/);
  assert.match(tileTypes, /export const SITE_TILE_TYPE = 'site'/);

  await runBundledTypeScript('p3-1-legacy-tile-adapter', `
    import assert from 'node:assert/strict';
    import {
      adaptLegacySiteItem,
      cloneLegacyWidgetSettings,
      getLegacySiteItemTileType,
    } from '../../../src/core/tiles/legacyV5Adapter.ts';
    import {
      getLegacyBuiltinWidgetType,
      isTileType,
      toBuiltinTileType,
      toExternalTileType,
    } from '../../../src/core/tiles/tileType.ts';

    const context = {
      placement: {x: 3, y: 4, w: 2, h: 1},
      revision: {updatedAt: 100, deviceId: 'migration-device', sequence: 1},
      fallbackCreatedAt: 90,
    };

    const settings = {timezone: 'Asia/Shanghai', nested: {showSeconds: true}, ignored: Infinity};
    settings.self = settings;
    const legacyWidget = {
      id: 'clock-1',
      kind: 'widget',
      title: '时钟',
      widgetType: 'clock',
      widgetConfig: settings,
      createdAt: 12,
      layouts: {desktop: {x: 1, y: 2, w: 2, h: 2}},
    };
    const settingsBefore = JSON.stringify({timezone: settings.timezone, nested: settings.nested});
    const widget = adaptLegacySiteItem(legacyWidget, context);
    assert.equal(widget.tileType, 'builtin:clock');
    assert.equal(getLegacySiteItemTileType(legacyWidget), 'builtin:clock');
    assert.equal(widget.title, '时钟');
    assert.deepEqual(widget.layouts.desktop, {x: 1, y: 2, w: 2, h: 2});
    assert.equal(widget.createdAt, 12);
    assert.equal(widget.revision.deviceId, 'migration-device');
    assert.ok('settings' in widget);
    assert.deepEqual(widget.settings, {timezone: 'Asia/Shanghai', nested: {showSeconds: true}});
    widget.settings.nested.showSeconds = false;
    assert.equal(settings.nested.showSeconds, true);
    assert.equal(JSON.stringify({timezone: settings.timezone, nested: settings.nested}), settingsBefore);

    const legacySite = {
      id: 'site-1',
      title: '示例站点',
      url: 'https://example.com',
      iconType: 'auto',
      tags: ['work', 123],
    };
    const site = adaptLegacySiteItem(legacySite, context);
    assert.equal(site.tileType, 'site');
    assert.equal(getLegacySiteItemTileType(legacySite), 'site');
    assert.equal(site.url, 'https://example.com');
    assert.deepEqual(site.layouts.desktop, context.placement);
    assert.deepEqual(site.tags, ['work']);
    assert.equal('settings' in site, false);

    assert.deepEqual(cloneLegacyWidgetSettings(['not-an-object']), {});
    assert.equal(toBuiltinTileType('builtin:clock'), 'builtin:clock');
    assert.equal(toBuiltinTileType(''), 'builtin:missing');
    assert.equal(toExternalTileType('vendor/tile'), 'external:vendor/tile');
    assert.equal(getLegacyBuiltinWidgetType('builtin:clock'), 'clock');
    assert.equal(getLegacyBuiltinWidgetType('site'), undefined);
    assert.equal(isTileType('external:vendor/tile'), true);
    assert.equal(isTileType('clock'), false);
  `);
});

test('P3.2 exposes a v6 config model and renders canonical tiles without package execution', async () => {
  const configTypes = await read('src/core/config/types.ts');
  const configV6 = await read('src/core/config/v6.ts');
  const host = await read('src/features/home/components/TileHost.vue');
  const registry = await read('src/core/tiles/registry.ts');
  const adapter = await read('src/core/tiles/tileHostAdapter.ts');
  const externalDefinition = await read('src/core/tiles/externalDefinition.ts');

  assert.match(configTypes, /interface ConfigV6 extends ConfigBase/);
  assert.match(configTypes, /layout: Workspace\[\]/);
  assert.match(configTypes, /tileInstalls: Record<string, TileInstallRecord>/);
  assert.match(configV6, /export function isConfigV6/);
  assert.match(host, /tile: TileInstance/);
  assert.match(host, /toLegacyTileHostItem/);
  assert.match(host, /isUnsupported/);
  assert.match(registry, /resolveTileDefinition/);
  assert.match(externalDefinition, /external-runtime-disabled/);
  assert.match(adapter, /widgetConfig: tile\.settings/);

  await runBundledTypeScript('p3-2-canonical-tile-host-boundary', `
    import assert from 'node:assert/strict';
    import {isConfigV6} from '../../../src/core/config/v6.ts';
    import {createUnsupportedExternalTileDefinition} from '../../../src/core/tiles/externalDefinition.ts';
    import {toLegacyTileHostItem} from '../../../src/core/tiles/tileHostAdapter.ts';

    const revision = {updatedAt: 1, deviceId: 'device-a', sequence: 1};
    const layouts = {desktop: {x: 2, y: 3, w: 2, h: 1}};
    const site = {
      id: 'site-1', tileType: 'site', title: 'Example', url: 'https://example.com',
      tags: ['work'], layouts, createdAt: 1, revision,
    };
    const siteView = toLegacyTileHostItem(site);
    assert.equal(siteView.kind, 'site');
    assert.equal(siteView.url, 'https://example.com');
    assert.equal(siteView.w, 2);

    const settings = {timezone: 'Asia/Shanghai'};
    const clock = {
      id: 'clock-1', tileType: 'builtin:clock', title: 'Clock', settings,
      layouts, createdAt: 1, revision,
    };
    const clockView = toLegacyTileHostItem(clock);
    assert.equal(clockView.kind, 'widget');
    assert.equal(clockView.widgetType, 'clock');
    assert.equal(clockView.widgetConfig, settings);
    clockView.widgetConfig.timezone = 'UTC';
    assert.equal(settings.timezone, 'UTC');

    const external = createUnsupportedExternalTileDefinition('external:acme/weather');
    assert.equal(external.renderer.kind, 'unsupported');
    assert.equal(external.id, 'external:acme/weather');

    assert.equal(isConfigV6({version: 6, layout: [], tileInstalls: {}}), true);
    assert.equal(isConfigV6({version: 5, layout: [], tileInstalls: {}}), false);
    assert.equal(isConfigV6({version: 6, layout: []}), false);
  `);
});

test('P3.3 migrates v5 layout data deterministically without writing configuration state', async () => {
  const migration = await read('src/core/config/migrateV5ToV6.ts');
  const legacyMigration = await read('src/core/config/migrate.ts');
  const versioning = await read('src/core/config/versioning.ts');

  assert.match(migration, /export function migrateV5ToV6/);
  assert.match(migration, /FLOW_MIGRATION_COLUMNS = 14/);
  assert.match(migration, /solveCanvasLayout/);
  assert.doesNotMatch(migration, /from ['"]vue['"]/);
  assert.doesNotMatch(migration, /localStorage|indexedDB|fetch\(/);
  assert.match(legacyMigration, /new ConfigVersionTooNew/);
  assert.match(versioning, /class ConfigVersionTooNew/);

  await runBundledTypeScript('p3-3-v5-to-v6-migration', `
    import assert from 'node:assert/strict';
    import {migrateConfig} from '../../../src/core/config/migrate.ts';
    import {
      ConfigV5MigrationPreflightError,
      migrateV5ToV6,
    } from '../../../src/core/config/migrateV5ToV6.ts';
    import {ConfigVersionTooNew} from '../../../src/core/config/versioning.ts';

    const source = {
      version: 5,
      focusMode: true,
      layout: [
        {
          id: 'canvas', title: '画布', icon: 'Folder',
          workspaceLayout: {mode: 'canvas', profiles: {desktop: {unit: 96, gap: 16, minCols: 4, maxCols: 4}}},
          items: [
            {id: 'site-a', kind: 'site', title: 'A', url: 'https://a.example', layouts: {desktop: {x: 0, y: 0, w: 2, h: 1}}},
            {id: 'clock-a', kind: 'widget', title: 'Clock', widgetType: 'clock', widgetConfig: {timezone: 'Asia/Shanghai'}, layouts: {desktop: {x: 0, y: 0, w: 2, h: 1}}},
            null,
          ],
        },
        {
          id: 'flow', title: '流式', icon: 'Folder',
          items: [
            {id: 'legacy-widget', kind: 'widget', widgetType: 'legacy/widget', widgetConfig: {value: 1}, w: 2, h: 1},
            {id: 'duplicate', kind: 'site', title: 'First', url: 'https://one.example'},
            {id: 'duplicate', kind: 'site', title: 'Second', url: 'https://two.example'},
          ],
        },
      ],
    };
    const before = JSON.parse(JSON.stringify(source));
    const options = {deviceId: 'device-migration', migratedAt: 123456};
    const first = migrateV5ToV6(source, options);
    const second = migrateV5ToV6(source, options);

    assert.deepEqual(source, before);
    assert.equal(first.migrated, true);
    assert.deepEqual(first, second);
    assert.equal(first.config.version, 6);
    assert.deepEqual(first.config.tileInstalls, {});
    assert.equal(first.config.focusMode, true);
    assert.equal(first.config.layout[0].tiles[0].tileType, 'site');
    assert.equal(first.config.layout[0].tiles[1].tileType, 'builtin:clock');
    assert.equal(first.config.layout[0].tiles[1].settings.timezone, 'Asia/Shanghai');
    assert.equal(first.config.layout[0].tiles[2].tileType, 'builtin:missing');
    assert.deepEqual(first.config.layout[0].tiles[2].settings.legacy, {raw: null});
    assert.ok(first.warnings.some((warning) => warning.code === 'canvas-placement-repaired'));

    const [canvasSite, canvasClock] = first.config.layout[0].tiles;
    const overlaps = canvasSite.layouts.desktop.x < canvasClock.layouts.desktop.x + canvasClock.layouts.desktop.w
      && canvasSite.layouts.desktop.x + canvasSite.layouts.desktop.w > canvasClock.layouts.desktop.x
      && canvasSite.layouts.desktop.y < canvasClock.layouts.desktop.y + canvasClock.layouts.desktop.h
      && canvasSite.layouts.desktop.y + canvasSite.layouts.desktop.h > canvasClock.layouts.desktop.y;
    assert.equal(overlaps, false);

    const flowTiles = first.config.layout[1].tiles;
    assert.equal(flowTiles[0].tileType, 'builtin:legacy/widget');
    assert.deepEqual(flowTiles[0].layouts.desktop, {x: 0, y: 0, w: 2, h: 1});
    assert.deepEqual(flowTiles[1].layouts.desktop, {x: 2, y: 0, w: 1, h: 1});
    assert.equal(flowTiles[2].id, 'duplicate~2');
    assert.ok(first.warnings.some((warning) => warning.code === 'duplicate-tile-id'));

    const idempotent = migrateV5ToV6(first.config, options);
    assert.equal(idempotent.migrated, false);
    assert.deepEqual(idempotent.config, first.config);
    assert.notEqual(idempotent.config, first.config);

    assert.throws(() => migrateV5ToV6({version: 5, layout: null}, options), ConfigV5MigrationPreflightError);
    assert.throws(() => migrateV5ToV6({version: 7, layout: []}, options), ConfigVersionTooNew);
    assert.equal(migrateConfig({version: 6, layout: [], tileInstalls: {}}).version, 6);
    assert.throws(() => migrateConfig({version: 7}), ConfigVersionTooNew);
  `);
});

test('P3.4 commits v6 only after an encrypted v5 backup and validation succeed', async () => {
  const transaction = await read('src/core/config/v6MigrationTransaction.ts');
  const v6 = await read('src/core/config/v6.ts');
  const keys = await read('src/core/config/keys.ts');
  const repository = await read('src/core/config/repository.ts');

  assert.match(transaction, /commitConfigV5ToV6Migration/);
  assert.match(transaction, /await deps\.storage\.set\(backupKey, backup, 'local'\)/);
  assert.match(transaction, /await deps\.storage\.set\(CONFIG_KEY, sealedV6, 'local'\)/);
  assert.match(transaction, /restoreConfigV5Backup/);
  assert.match(v6, /export function normalizeConfigV6/);
  assert.match(v6, /export function validateConfigForSaveV6/);
  assert.match(keys, /CONFIG_V5_BACKUP_PREFIX/);
  assert.match(repository, /commitConfigV5ToV6Migration/);

  await runBundledTypeScript('p3-4-v6-migration-transaction', `
    import assert from 'node:assert/strict';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {CONFIG_KEY} from '../../../src/core/config/keys.ts';
    import {
      ConfigV6MigrationTransactionError,
      commitConfigV5ToV6Migration,
      restoreConfigV5Backup,
    } from '../../../src/core/config/v6MigrationTransaction.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const source = clone(defaultConfig);
    source.sync.password = 'webdav-secret';
    source.ai.apiKey = 'api-secret';
    const values = new Map([[CONFIG_KEY, clone(source)]]);
    const writes = [];
    const fakeStorage = {
      async get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
      async set(key, value) { writes.push({key, value: clone(value)}); values.set(key, clone(value)); },
    };
    const seal = async (config) => {
      const copy = clone(config);
      copy.sync.password = copy.sync.password ? 'sealed:' + copy.sync.password : '';
      copy.ai.apiKey = copy.ai.apiKey ? 'sealed:' + copy.ai.apiKey : '';
      return copy;
    };
    const options = {deviceId: 'transaction-device', migratedAt: 222222};
    const committed = await commitConfigV5ToV6Migration(source, options, {storage: fakeStorage, seal});
    assert.equal(committed.config.version, 6);
    assert.equal(values.get(CONFIG_KEY).version, 6);
    const backup = values.get(committed.backupKey);
    assert.equal(backup.format, 1);
    assert.equal(backup.config.version, 5);
    assert.equal(backup.config.sync.password, 'sealed:webdav-secret');
    assert.ok(writes.findIndex((write) => write.key === committed.backupKey) < writes.findIndex((write) => write.key === CONFIG_KEY));

    await restoreConfigV5Backup(committed.backupKey, {storage: fakeStorage});
    assert.equal(values.get(CONFIG_KEY).version, 5);
    assert.equal(values.get(CONFIG_KEY).sync.password, 'sealed:webdav-secret');

    const failureValues = new Map([[CONFIG_KEY, clone(source)]]);
    const failureStorage = {
      async get(key, fallback) { return failureValues.has(key) ? failureValues.get(key) : fallback; },
      async set(key, value) { failureValues.set(key, clone(value)); },
    };
    await assert.rejects(
      () => commitConfigV5ToV6Migration(source, options, {
        storage: failureStorage,
        seal,
        validate: () => ({ok: false, errors: ['fixture validation failure'], warnings: []}),
      }),
      (error) => error instanceof ConfigV6MigrationTransactionError && error.phase === 'migrate',
    );
    assert.equal(failureValues.get(CONFIG_KEY).version, 5);
    assert.ok([...failureValues.keys()].some((key) => key.includes('config-backup:v5:')));

    const commitFailureValues = new Map([[CONFIG_KEY, clone(source)]])
    const commitFailureStorage = {
      async get(key, fallback) { return commitFailureValues.has(key) ? commitFailureValues.get(key) : fallback; },
      async set(key, value) {
        if (key === CONFIG_KEY && value.version === 6) throw new Error('simulated main write failure');
        commitFailureValues.set(key, clone(value));
      },
    };
    await assert.rejects(
      () => commitConfigV5ToV6Migration(source, options, {storage: commitFailureStorage, seal}),
      (error) => error instanceof ConfigV6MigrationTransactionError && error.phase === 'commit',
    );
    assert.equal(commitFailureValues.get(CONFIG_KEY).version, 5);
    assert.equal(commitFailureValues.get(CONFIG_KEY).sync.password, 'sealed:webdav-secret');
  `);
});

test('P3.5 migrates privacy payloads only after unlock and renders the canonical v2 payload', async () => {
  const types = await read('src/core/config/types.ts');
  const payloadMigration = await read('src/core/privacy/payloadMigration.ts');
  const crypto = await read('src/core/privacy/vaultCrypto.ts');
  const actions = await read('src/stores/config/privacyActions.ts');
  const modal = await read('src/features/privacy/components/PrivacyVaultModal.vue');
  const normalize = await read('src/core/config/normalize.ts');

  assert.match(types, /interface PrivacyVaultPayloadV1/);
  assert.match(types, /interface PrivacyVaultPayloadV2/);
  assert.match(types, /type PrivacyVaultPayload = PrivacyVaultPayloadV1 \| PrivacyVaultPayloadV2/);
  assert.match(payloadMigration, /export function migratePrivacyVaultPayloadV1ToV2/);
  assert.match(payloadMigration, /projectPrivacyVaultPayloadV2ToV1/);
  assert.match(crypto, /payload\.version === 2/);
  assert.match(actions, /if \(opened\.version === 1\)/);
  assert.match(actions, /await saveConfig\(\)/);
  assert.doesNotMatch(actions, /privacyLegacyView/);
  assert.match(modal, /store\.privacyPayload/);
  assert.match(modal, /entry\.workspace\.tiles\.length/);
  assert.doesNotMatch(modal, /store\.privacyLegacyView/);
  assert.doesNotMatch(normalize, /openPrivacyVaultEnvelope/);

  await runBundledTypeScript('p3-5-privacy-payload-migration', `
    import assert from 'node:assert/strict';
    import {
      migratePrivacyVaultPayloadV1ToV2,
      projectPrivacyVaultPayloadV2ToV1,
    } from '../../../src/core/privacy/payloadMigration.ts';

    const source = {
      version: 1,
      groups: [{
        group: {
          id: 'private-group', title: '私密分组', icon: 'Folder',
          workspaceLayout: {mode: 'canvas', profiles: {desktop: {unit: 96, gap: 16, minCols: 4, maxCols: 6}}},
          items: [
            {id: 'private-site', kind: 'site', title: 'Secret', url: 'https://secret.example', tags: ['private']},
            {id: 'private-clock', kind: 'widget', widgetType: 'clock', widgetConfig: {timezone: 'Asia/Shanghai'}},
          ],
        },
        originalIndex: 2,
        movedAt: 100,
      }],
      sites: [{
        site: {id: 'standalone-site', kind: 'site', title: 'Standalone', url: 'https://one.example'},
        originalGroupId: 'restored-group',
        originalGroupTitle: '恢复位置',
        originalIndex: 1,
        movedAt: 101,
      }],
    };
    const before = JSON.parse(JSON.stringify(source));
    const options = {deviceId: 'privacy-device', migratedAt: 333333};
    const first = migratePrivacyVaultPayloadV1ToV2(source, options);
    const second = migratePrivacyVaultPayloadV1ToV2(source, options);

    assert.deepEqual(source, before);
    assert.deepEqual(first, second);
    assert.equal(first.payload.version, 2);
    assert.equal(first.payload.workspaces.length, 1);
    assert.equal(first.payload.workspaces[0].workspace.tiles[0].tileType, 'site');
    assert.equal(first.payload.workspaces[0].workspace.tiles[1].tileType, 'builtin:clock');
    assert.equal(first.payload.tiles[0].tile.tileType, 'site');

    const legacyView = projectPrivacyVaultPayloadV2ToV1(first.payload);
    assert.equal(legacyView.version, 1);
    assert.equal(legacyView.groups[0].group.items[1].widgetType, 'clock');
    assert.equal(legacyView.sites[0].site.url, 'https://one.example');
    legacyView.groups[0].group.items[1].widgetConfig.timezone = 'UTC';
    assert.equal(first.payload.workspaces[0].workspace.tiles[1].settings.timezone, 'Asia/Shanghai');
  `);
});

test('P3.6 isolates v6 sync files and rejects future configuration before normalization', async () => {
  const preflight = await read('src/core/config/preflight.ts');
  const upgrade = await read('src/core/config/syncSchemaUpgrade.ts');
  const channel = await read('src/core/sync/v6Channel.ts');
  const syncTypes = await read('src/core/sync/types.ts');
  const webdav = await read('src/core/sync/providers/webdav.ts');
  const syncActions = await read('src/stores/config/syncActions.ts');
  const dataTab = await read('src/features/settings/components/tabs/DataTab.vue');
  const transaction = await read('src/core/config/v6MigrationTransaction.ts');

  assert.match(preflight, /export function preflightConfigForReader/);
  assert.match(preflight, /ConfigVersionTooNew/);
  assert.match(upgrade, /markConfigV6SyncSchemaUpgradePending/);
  assert.match(upgrade, /confirmV6SyncSchemaUpgrade/);
  assert.match(channel, /getV6SiblingFilename/);
  assert.match(channel, /minReaderVersion: V6_MIN_READER_VERSION/);
  assert.match(channel, /tileInstalls: \{\}/);
  assert.match(syncTypes, /syncSchemaUpgradePending/);
  assert.match(syncTypes, /SyncFileOptions/);
  assert.match(webdav, /options\?\.filename \|\| p\.filename/);
  assert.match(syncActions, /preflightConfigForReader\(raw\)/);
  assert.match(syncActions, /syncSchemaUpgradePending/);
  assert.match(channel, /omitDeviceLocalSyncMetadata/);
  assert.match(channel, /stripSensitiveConfigForSync/);
  assert.match(syncActions, /uploadConfigV6ToSibling/);
  assert.match(syncActions, /getV6SiblingFileOptions/);
  assert.match(syncActions, /restoreConfigV6FromSyncExport/);
  assert.match(syncActions, /isV6SyncWriteAuthorized/);
  assert.match(dataTab, /preflightConfigForReader\(raw\)/);
  assert.match(dataTab, /createConfigV6SyncExport/);
  assert.match(dataTab, /restoreConfigV6FromSyncExport/);
  assert.match(transaction, /markConfigV6SyncSchemaUpgradePending/);

  await runBundledTypeScript('p3-6-v6-sync-isolation', `
    import assert from 'node:assert/strict';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {ConfigVersionTooNew} from '../../../src/core/config/versioning.ts';
    import {preflightConfigForReader} from '../../../src/core/config/preflight.ts';
    import {
      confirmV6SyncSchemaUpgrade,
      isV6SyncWriteAuthorized,
      markSyncSchemaUpgradePending,
    } from '../../../src/core/config/syncSchemaUpgrade.ts';
    import {migrateV5ToV6} from '../../../src/core/config/migrateV5ToV6.ts';
    import {normalizeConfigV6} from '../../../src/core/config/v6.ts';
    import {
      buildConfigV6SyncPayload,
      createConfigV6SyncExport,
      getV6SiblingFilename,
      restoreConfigV6FromSyncExport,
      uploadConfigV6ToSibling,
    } from '../../../src/core/sync/v6Channel.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const legacy = clone(defaultConfig);
    legacy.sync.enabled = true;
    legacy.sync.autoSync = true;
    legacy.sync.password = 'webdav-secret';
    legacy.ai.apiKey = 'api-secret';
    legacy.runtime.auth.jwtToken = 'runtime-secret';
    const config = normalizeConfigV6(migrateV5ToV6(legacy, {
      deviceId: 'p3-6-device',
      migratedAt: 444444,
    }).config);

    const portable = createConfigV6SyncExport(config);
    assert.equal(portable.version, 6);
    assert.equal(portable.minReaderVersion, 6);
    assert.equal(portable.sync.password, '');
    assert.equal(portable.ai.apiKey, '');
    assert.equal('runtime' in portable, false);
    assert.equal('tileInstalls' in portable, false);
    assert.equal('syncSchemaUpgradePending' in portable.sync, false);
    assert.equal('syncSchemaChannel' in portable.sync, false);
    assert.equal(JSON.parse(buildConfigV6SyncPayload(config)).version, 6);

    const restored = restoreConfigV6FromSyncExport(portable);
    assert.equal(restored.version, 6);
    assert.deepEqual(restored.tileInstalls, {});
    assert.equal(restored.layout[0].tiles.length, config.layout[0].tiles.length);

    assert.equal(getV6SiblingFilename('voidtab-backup.json'), 'voidtab-backup.v6.json');
    assert.equal(getV6SiblingFilename('custom'), 'custom.v6.json');
    assert.equal(getV6SiblingFilename('already.v6.json'), 'already.v6.json');

    assert.throws(() => preflightConfigForReader({version: 7}), ConfigVersionTooNew);
    assert.doesNotThrow(() => preflightConfigForReader({version: 6}));
    assert.throws(() => preflightConfigForReader({version: 6, minReaderVersion: 7}, 6), ConfigVersionTooNew);

    const pending = markSyncSchemaUpgradePending(config.sync);
    assert.equal(pending.syncSchemaUpgradePending, true);
    assert.equal(pending.syncSchemaChannel, 'legacy-v5');
    assert.equal(isV6SyncWriteAuthorized(pending), false);
    const confirmed = confirmV6SyncSchemaUpgrade(pending);
    assert.equal(isV6SyncWriteAuthorized(confirmed), true);

    const calls = [];
    const fakeService = {
      async upload(profile, payload, options) {
        calls.push({profile, payload, options});
        return {ok: true, message: 'uploaded'};
      },
    };
    const blocked = await uploadConfigV6ToSibling(fakeService, pending, config);
    assert.equal(blocked.ok, false);
    const uploaded = await uploadConfigV6ToSibling(fakeService, confirmed, config);
    assert.equal(uploaded.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.filename, 'voidtab-backup.v6.json');
    assert.equal(JSON.parse(calls[0].payload).minReaderVersion, 6);
  `);
});

test('P3.7 runs runtime consumers on canonical Workspace.tiles only', async () => {
  const types = await read('src/core/config/types.ts');
  const repository = await read('src/core/config/repository.ts');
  const tileAccess = await read('src/core/tiles/tileAccess.ts');
  const siteActions = await read('src/stores/config/siteActions.ts');
  const layoutActions = await read('src/stores/config/layoutActions.ts');
  const iconActions = await read('src/stores/config/iconActions.ts');
  const mainGrid = await read('src/features/home/components/MainGrid.vue');
  const mobileNav = await read('src/features/navigation/components/MobileGroupNav.vue');
  const sidebarButton = await read('src/features/navigation/components/sidebar/SidebarGroupButton.vue');
  const privacyActions = await read('src/stores/config/privacyActions.ts');
  const terminal = await read('src/features/terminal/components/TerminalPanel.vue');
  const searchUtils = await read('src/core/search/searchUtils.ts');
  const searchBar = await read('src/features/widgets/builtins/search/SearchBar.vue');
  const bookmarkExport = await read('src/core/bookmarks/export.ts');
  const contextMenu = await read('src/features/context-menu/components/ContextMenu.vue');

  assert.match(types, /export type Config = ConfigV5 \| ConfigV6/);
  assert.match(repository, /normalizeConfigForRuntime/);
  assert.match(repository, /validateConfigForSaveV6/);
  assert.match(tileAccess, /export function getWorkspaceTiles/);
  assert.match(tileAccess, /export function createSiteTile/);
  assert.match(tileAccess, /export function createComponentTile/);
  assert.match(tileAccess, /export function updateTile/);
  assert.match(tileAccess, /export function removeTile/);
  assert.match(siteActions, /createSiteTile: addSite/);
  assert.match(siteActions, /removeTile: removeSite/);
  assert.match(layoutActions, /createComponentTile: addWidget/);
  assert.match(iconActions, /getWorkspaceTiles/);
  assert.match(mainGrid, /getWorkspaceTiles/);
  assert.match(mainGrid, /:tile="item"/);
  assert.match(mobileNav, /getWorkspaceTileCount/);
  assert.match(sidebarButton, /getWorkspaceTileCount/);
  assert.match(privacyActions, /privacyTileToRuntimeTile/);
  assert.match(terminal, /getRuntimeWorkspaces/);
  assert.match(terminal, /getWorkspaceTiles/);
  assert.doesNotMatch(terminal, /getLegacyLayoutGroups/);
  assert.match(searchUtils, /group\.tiles/);
  assert.match(searchBar, /findLocalResults/);
  assert.match(bookmarkExport, /g\.tiles/);
  assert.match(contextMenu, /getLegacyWidgetType/);
  assert.doesNotMatch(contextMenu, /item\?\.widgetType/);

  await runBundledTypeScript('p3-7-runtime-consumer-tile-access', `
    import assert from 'node:assert/strict';
    import {exportBookmarksToHtml} from '../../../src/core/bookmarks/export.ts';
    import {migrateConfig} from '../../../src/core/config/migrate.ts';
    import {migrateV5ToV6} from '../../../src/core/config/migrateV5ToV6.ts';
    import {normalizeConfigV6, validateConfigForSaveV6} from '../../../src/core/config/v6.ts';
    import {findLocalResults} from '../../../src/core/search/searchUtils.ts';
    import {
      createComponentTile,
      createSiteTile,
      createWorkspace,
      findTile,
      findWorkspace,
      getWorkspaceTileCount,
      getWorkspaceTiles,
      removeTile,
      setWorkspaceTiles,
      updateTile,
    } from '../../../src/core/tiles/tileAccess.ts';

    const legacy = {
      version: 5,
      sync: {provider: 'webdav', enabled: false, autoSync: false},
      layout: [{
        id: 'work',
        title: 'Work',
        icon: 'Folder',
        items: [
          {id: 'site-1', kind: 'site', title: 'One', url: 'https://one.example', tags: ['a']},
          {id: 'clock-1', kind: 'widget', widgetType: 'clock', widgetConfig: {timezone: 'Asia/Shanghai'}, w: 2, h: 2},
        ],
      }],
    };
    const migrated = normalizeConfigV6(migrateV5ToV6(legacy, {
      deviceId: 'p3-7-device',
      migratedAt: 555555,
    }).config);

    assert.equal(migrateConfig(migrated).version, 6);
    assert.equal(validateConfigForSaveV6(migrated).ok, true);
    const workspace = findWorkspace(migrated, 'work');
    assert.ok(workspace);
    assert.equal(getWorkspaceTileCount(workspace), 2);
    assert.equal(getWorkspaceTiles(workspace)[0].tileType, 'site');

    const site = createSiteTile({
      id: 'site-2', title: 'Two', url: 'https://two.example',
      layouts: {desktop: {x: 2, y: 0, w: 3, h: 1}},
    });
    getWorkspaceTiles(workspace).push(site);
    assert.equal(findTile(workspace, 'site-2').tileType, 'site');
    updateTile(site, {title: 'Two Updated', tags: ['x', 1]});
    assert.equal(site.title, 'Two Updated');
    assert.deepEqual(site.tags, ['x']);

    const widget = createComponentTile('weather', {
      id: 'weather-1', settings: {city: 'Shanghai'},
      layouts: {desktop: {x: 5, y: 0, w: 2, h: 2}},
    });
    getWorkspaceTiles(workspace).push(widget);
    assert.equal(widget.tileType, 'builtin:weather');
    assert.equal(widget.settings.city, 'Shanghai');

    const removed = removeTile(workspace, 'clock-1');
    assert.equal(removed.tileType, 'builtin:clock');
    setWorkspaceTiles(workspace, [widget, site, getWorkspaceTiles(workspace)[0]]);
    assert.deepEqual(getWorkspaceTiles(workspace).map((tile) => tile.id), ['weather-1', 'site-2', 'site-1']);

    const localResults = findLocalResults(migrated.layout, 'two', 10);
    assert.equal(localResults.length, 1);
    assert.equal(localResults[0].id, 'site-2');

    const html = exportBookmarksToHtml(migrated);
    assert.match(html, /https:\\/\\/two\\.example/);
    assert.doesNotMatch(html, /weather-1/);

    const restoredWorkspace = createWorkspace({
      id: 'restored', title: 'Restored', icon: 'Folder',
      tiles: getWorkspaceTiles(workspace),
    });
    assert.equal(restoredWorkspace.tiles.length, 3);
  `);
});

test('P3.8 migration fixtures preserve recoverable data and isolate v6 writes', async () => {
  const fixtureSource = await read('scripts/fixtures/p3MigrationFixtures.ts');
  const migration = await read('src/core/config/migrateV5ToV6.ts');
  const privacyActions = await read('src/stores/config/privacyActions.ts');
  const syncActions = await read('src/stores/config/syncActions.ts');
  const registry = await read('src/core/tiles/registry.ts');

  assert.match(fixtureSource, /LEGACY_BUILTIN_WIDGET_TYPES/);
  assert.match(fixtureSource, /createPureBookmarkFlowFixture/);
  assert.match(fixtureSource, /createCanvasPlacementFixture/);
  assert.match(fixtureSource, /createMalformedItemFixture/);
  assert.match(migration, /hasMalformedWidgetSettings/);
  assert.match(privacyActions, /resealPrivacyVaultEnvelope/);
  assert.match(syncActions, /isV6SyncWriteAuthorized/);
  assert.match(registry, /createUnsupportedExternalTileDefinition/);

  await runBundledTypeScript('p3-8-migration-fixtures', `
    import assert from 'node:assert/strict';
    import {ref} from 'vue';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {ConfigVersionTooNew} from '../../../src/core/config/versioning.ts';
    import {commitConfigV5ToV6Migration} from '../../../src/core/config/v6MigrationTransaction.ts';
    import {migrateV5ToV6} from '../../../src/core/config/migrateV5ToV6.ts';
    import {normalizeConfigV6} from '../../../src/core/config/v6.ts';
    import {createPrivacyVaultEnvelope, openPrivacyVaultEnvelope} from '../../../src/core/privacy/vaultCrypto.ts';
    import {createPrivacyActions} from '../../../src/stores/config/privacyActions.ts';
    import {getLegacyBuiltinWidgetType} from '../../../src/core/tiles/tileType.ts';
    import {confirmV6SyncSchemaUpgrade, markSyncSchemaUpgradePending} from '../../../src/core/config/syncSchemaUpgrade.ts';
    import {uploadConfigV6ToSibling} from '../../../src/core/sync/v6Channel.ts';
    import {
      LEGACY_BUILTIN_WIDGET_TYPES,
      P3_FIXTURE_MIGRATION_OPTIONS,
      createBuiltinWidgetFixture,
      createCanvasPlacementFixture,
      createMalformedItemFixture,
      createPrivacyVaultV1Fixture,
      createPureBookmarkFlowFixture,
      createUnregisteredWidgetFixture,
    } from '../../../scripts/fixtures/p3MigrationFixtures.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const migrate = (source) => migrateV5ToV6(source, P3_FIXTURE_MIGRATION_OPTIONS);
    const overlaps = (left, right) => left.x < right.x + right.w
      && left.x + left.w > right.x
      && left.y < right.y + right.h
      && left.y + left.h > right.y;

    // v5 flow: order and all bookmark fields survive the canonical conversion.
    const pureSource = createPureBookmarkFlowFixture();
    const pureBefore = clone(pureSource);
    const pure = migrate(pureSource);
    assert.deepEqual(pureSource, pureBefore);
    const pureTiles = pure.config.layout[0].tiles;
    assert.deepEqual(pureTiles.map((tile) => tile.id), ['alpha', 'beta', 'gamma']);
    assert.deepEqual(pureTiles.map((tile) => tile.tileType), ['site', 'site', 'site']);
    assert.equal(pureTiles[0].url, pureSource.layout[0].items[0].url);
    assert.equal(pureTiles[0].icon, pureSource.layout[0].items[0].icon);
    assert.deepEqual(pureTiles[0].tags, pureSource.layout[0].items[0].tags);
    assert.equal(pureTiles[1].iconType, 'text');
    assert.equal(pureTiles[2].iconType, 'icon');

    // Every legacy built-in name maps to a namespaced tile and retains JSON settings.
    const builtinsSource = createBuiltinWidgetFixture();
    const builtinResult = migrate(builtinsSource);
    const builtinTiles = builtinResult.config.layout[0].tiles;
    assert.equal(LEGACY_BUILTIN_WIDGET_TYPES.length, 26);
    assert.equal(builtinTiles.length, LEGACY_BUILTIN_WIDGET_TYPES.length);
    for (const [index, widgetType] of LEGACY_BUILTIN_WIDGET_TYPES.entries()) {
      const tile = builtinTiles[index];
      const source = builtinsSource.layout[0].items[index];
      assert.equal(tile.tileType, \`builtin:\${widgetType}\`);
      assert.deepEqual(tile.settings, source.widgetConfig);
      assert.equal(tile.layouts.desktop.w, source.w);
      assert.equal(tile.layouts.desktop.h, source.h);
    }

    // Explicit P1 profile placements are copied without a hidden projection write.
    const canvasSource = createCanvasPlacementFixture();
    const canvasResult = migrate(canvasSource);
    const canvasTiles = canvasResult.config.layout[0].tiles;
    for (const [index, tile] of canvasTiles.entries()) {
      const expected = canvasSource.layout[0].items[index].layouts;
      assert.deepEqual(tile.layouts, expected);
    }
    for (const profile of ['desktop', 'tablet', 'mobile']) {
      assert.equal(overlaps(canvasTiles[0].layouts[profile], canvasTiles[1].layouts[profile]), false);
    }

    // An uninstalled legacy widget remains a namespaced recoverable record.
    const unregisteredSource = createUnregisteredWidgetFixture();
    const unregistered = migrate(unregisteredSource).config.layout[0].tiles[0];
    assert.equal(unregistered.tileType, 'builtin:retired/acme-weather');
    assert.deepEqual(unregistered.settings, unregisteredSource.layout[0].items[0].widgetConfig);
    assert.deepEqual(unregistered.layouts, unregisteredSource.layout[0].items[0].layouts);
    assert.equal(getLegacyBuiltinWidgetType(unregistered.tileType), 'retired/acme-weather');

    // Bad settings and malformed items degrade independently; healthy siblings stay intact.
    const malformedSource = createMalformedItemFixture();
    const malformed = migrate(malformedSource);
    const malformedTiles = malformed.config.layout[0].tiles;
    assert.equal(malformedTiles[0].tileType, 'site');
    assert.equal(malformedTiles[0].url, 'https://healthy.example');
    assert.deepEqual(malformedTiles.slice(1).map((tile) => tile.tileType), [
      'builtin:missing', 'builtin:missing', 'builtin:missing',
    ]);
    assert.deepEqual(malformedTiles[1].settings.legacy, {
      raw: malformedSource.layout[0].items[1],
    });
    assert.equal(malformed.warnings.filter((warning) => warning.code === 'invalid-item').length, 3);

    // A v1 envelope is re-sealed as v2 after unlock, then restores at originalIndex.
    const privacyLegacyConfig = clone(defaultConfig);
    privacyLegacyConfig.layout = [{
      id: 'restore-target', title: 'Restore target', icon: 'Folder',
      items: [{id: 'existing', kind: 'site', title: 'Existing', url: 'https://existing.example'}],
    }];
    const privacyConfig = normalizeConfigV6(migrateV5ToV6(privacyLegacyConfig, P3_FIXTURE_MIGRATION_OPTIONS).config);
    privacyConfig.privacy.enabled = true;
    privacyConfig.privacy.vault = await createPrivacyVaultEnvelope('fixture-password', createPrivacyVaultV1Fixture());
    const privacyConfigRef = ref(privacyConfig);
    const ciphertextBeforeUnlock = privacyConfigRef.value.privacy.vault.ciphertext;
    let saveCount = 0;
    const privacy = createPrivacyActions(privacyConfigRef, async () => { saveCount += 1; });
    const unlocked = await privacy.unlockPrivacyVault('fixture-password');
    assert.equal(unlocked.version, 2);
    assert.ok(saveCount >= 1);
    assert.notEqual(privacyConfigRef.value.privacy.vault.ciphertext, ciphertextBeforeUnlock);
    const resealed = await openPrivacyVaultEnvelope(privacyConfigRef.value.privacy.vault, 'fixture-password');
    assert.equal(resealed.version, 2);
    const restored = await privacy.restorePrivacySite('restore-at-one');
    assert.equal(restored.success, true);
    assert.deepEqual(privacyConfigRef.value.layout[0].tiles.map((tile) => tile.id), ['existing', 'restore-at-one']);
    privacy.lockPrivacyVault();

    // Pending v6 profiles cannot overwrite v5; confirmation writes only the sibling.
    const syncSource = createPureBookmarkFlowFixture();
    syncSource.sync = {
      provider: 'webdav', enabled: true, autoSync: true,
      url: 'https://dav.example', username: 'fixture', password: 'secret',
      folder: 'voidtab', filename: 'voidtab-backup.json', lastSyncTime: 0,
    };
    const syncConfig = migrate(syncSource).config;
    const pendingProfile = markSyncSchemaUpgradePending(syncConfig.sync);
    const writes = [];
    const service = {
      async upload(profile, payload, options) {
        writes.push({profile, payload, options});
        return {ok: true, message: 'uploaded'};
      },
    };
    const blocked = await uploadConfigV6ToSibling(service, pendingProfile, syncConfig);
    assert.equal(blocked.ok, false);
    assert.equal(writes.length, 0);
    const confirmed = await uploadConfigV6ToSibling(service, confirmV6SyncSchemaUpgrade(pendingProfile), syncConfig);
    assert.equal(confirmed.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].options.filename, 'voidtab-backup.v6.json');

    // Future data is rejected before the transaction can write either backup or main config.
    const storageWrites = [];
    const storage = {
      async get(_key, fallback) { return fallback; },
      async set(key, value) { storageWrites.push({key, value}); },
    };
    const future = {version: 7, layout: []};
    await assert.rejects(
      () => commitConfigV5ToV6Migration(future, P3_FIXTURE_MIGRATION_OPTIONS, {storage}),
      (error) => error instanceof ConfigVersionTooNew || /只接受已解密/.test(String(error?.message)),
    );
    assert.equal(storageWrites.length, 0);
  `);
});

test('P3.8 canonical consumers do not directly read legacy tile discriminators', async () => {
  const files = [
    'src/features/home/components/MainGrid.vue',
    'src/features/privacy/components/PrivacyVaultModal.vue',
    'src/features/terminal/components/TerminalPanel.vue',
    'src/features/context-menu/components/ContextMenu.vue',
    'src/core/search/searchUtils.ts',
    'src/core/bookmarks/export.ts',
  ];
  const directLegacyRead = /\b(?:item|site|tile)\.(?:kind|widgetType|widgetConfig)\b/;
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, directLegacyRead, file);
  }
});

test('P4 controls tile appearance and shares sanitized instances', async () => {
  const contracts = await read('src/core/tiles/contracts.ts');
  const style = await read('src/core/tiles/style.ts');
  const sharing = await read('src/core/tiles/instanceSharing.ts');
  const host = await read('src/features/home/components/TileHost.vue');
  const menu = await read('src/features/context-menu/components/ContextMenu.vue');
  const panel = await read('src/features/context-menu/components/ContextMenuPanel.vue');
  const registry = await read('src/core/tiles/registry.ts');
  const external = await read('src/core/tiles/externalDefinition.ts');

  assert.match(contracts, /styleOverride\?: TileStyleOverride/);
  assert.match(contracts, /export type TileStyleableToken = keyof TileStyleOverride/);
  assert.match(style, /normalizeTileStyleOverride/);
  assert.match(style, /tileStyleOverrideToCssVars/);
  assert.match(sharing, /exportTileInstance/);
  assert.match(sharing, /SENSITIVE_KEY_RE/);
  assert.match(host, /tileStyleOverrideToCssVars/);
  assert.match(host, /:style="tileStyleVars"/);
  assert.match(menu, /exportTileInstanceForShare/);
  assert.match(menu, /importTileInstanceToGroup/);
  assert.match(panel, /导出卡片实例/);
  assert.match(panel, /导入卡片实例/);
  assert.match(panel, /重置外观/);
  assert.match(registry, /styleable: DEFAULT_TILE_STYLEABLE/);
  assert.match(external, /missing-builtin/);

  await runBundledTypeScript('p4-tile-style-and-sharing', `
    import assert from 'node:assert/strict';
    import {normalizeTileStyleOverride, tileStyleOverrideToCssVars} from '../../../src/core/tiles/style.ts';
    import {exportTileInstance, importTileInstance} from '../../../src/core/tiles/instanceSharing.ts';
    import {createUnsupportedExternalTileDefinition} from '../../../src/core/tiles/externalDefinition.ts';

    const normalized = normalizeTileStyleOverride({
      radius: 999,
      accent: 'javascript:alert(1)',
      surface: '#112233',
      iconScale: 9,
      density: 'huge',
      elevation: 7,
      position: 'fixed',
    });
    assert.deepEqual(normalized, {radius: 36, surface: '#112233', iconScale: 1.45, elevation: 3});
    const vars = tileStyleOverrideToCssVars(normalized);
    assert.equal(vars['--tile-radius'], '36px');
    assert.equal(vars['--tile-surface'], '#112233');
    assert.equal(vars['--tile-icon-scale'], '1.45');
    assert.equal(vars.position, undefined);

    const tile = {
      id: 'jwt-1',
      tileType: 'builtin:jwt_sentry',
      title: 'JWT',
      settings: {
        apiKey: 'sk-live',
        nested: {refreshToken: 'secret', safe: 'keep'},
        url: 'https://user:pass@example.com/a?token=abc&ok=1',
      },
      layouts: {desktop: {x: 0, y: 0, w: 2, h: 2}},
      styleOverride: {radius: 22, accent: '#ff6600', unknown: true},
      createdAt: 1,
      revision: {updatedAt: 1, deviceId: 'dev', sequence: 1},
    };
    const exported = exportTileInstance(tile, 123);
    assert.equal(exported.kind, 'voidtab.tile-instance');
    assert.equal(exported.tile.id, 'jwt-1');
    assert.equal(exported.tile.settings.apiKey, undefined);
    assert.equal(exported.tile.settings.nested.refreshToken, undefined);
    assert.equal(exported.tile.settings.nested.safe, 'keep');
    assert.equal(exported.tile.settings.url, 'https://example.com/a?ok=1');
    assert.ok(exported.sanitized.sensitiveFieldsRemoved.includes('tile.settings.apiKey'));
    assert.ok(!JSON.stringify(exported).includes('sk-live'));
    assert.ok(!JSON.stringify(exported).includes('secret'));

    const imported = importTileInstance(exported, {id: 'imported-1', now: 456, deviceId: 'import-test'});
    assert.equal(imported.id, 'imported-1');
    assert.equal(imported.tileType, 'builtin:jwt_sentry');
    assert.equal(imported.createdAt, 456);
    assert.equal(imported.revision.deviceId, 'import-test');
    assert.equal(imported.styleOverride.radius, 22);

    const missing = createUnsupportedExternalTileDefinition('builtin:not_installed');
    assert.equal(missing.renderer.kind, 'unsupported');
    assert.equal(missing.renderer.reason, 'missing-builtin');
  `);
});

test('delete snapshots clone serializable config data without structuredClone', async () => {
  const contextMenu = await read('src/features/context-menu/components/ContextMenu.vue');
  const grid = await read('src/features/home/components/MainGrid.vue');

  assert.match(contextMenu, /cloneConfigSnapshot/);
  assert.match(grid, /cloneConfigSnapshot/);
  assert.doesNotMatch(contextMenu, /structuredClone/);
  assert.doesNotMatch(grid, /structuredClone/);

  await runBundledTypeScript('config-snapshot', `
    import assert from 'node:assert/strict';
    import {reactive} from 'vue';
    import {cloneConfigSnapshot} from '../../../src/shared/utils/configSnapshot.ts';

    class RuntimeOnly {
      value = 'skip me';
    }

    const item = reactive({
      id: 'widget-1',
      kind: 'widget',
      widgetType: 'clock',
      title: 'Clock',
      w: 2,
      h: 1,
      widgetConfig: {
        enabled: true,
        nested: { label: 'keep' },
        runtimeOnly: new RuntimeOnly(),
        onClick() {},
      },
    });
    item.widgetConfig.self = item.widgetConfig;

    const snapshot = cloneConfigSnapshot(item);

    assert.deepEqual(snapshot, {
      id: 'widget-1',
      kind: 'widget',
      widgetType: 'clock',
      title: 'Clock',
      w: 2,
      h: 1,
      widgetConfig: {
        enabled: true,
        nested: { label: 'keep' },
      },
    });
    assert.notEqual(snapshot, item);
    assert.notEqual(snapshot.widgetConfig, item.widgetConfig);
  `);
});

test('primary dialogs provide focus traps and dialog semantics', async () => {
  const focusTrap = await read('src/shared/composables/useFocusTrap.ts');
  const confirm = await read('src/shared/ui/dialogs/ConfirmDialog.vue');
  const settings = await read('src/features/settings/components/SettingsModal.vue');
  const site = await read('src/shared/ui/dialogs/SiteDialogForm.vue');
  const group = await read('src/shared/ui/dialogs/GroupDialogForm.vue');

  assert.match(focusTrap, /event\.key !== 'Tab'/);
  for (const source of [confirm, settings, site, group]) {
    assert.match(source, /useFocusTrap/);
    assert.match(source, /role="dialog"|:role="danger \? 'alertdialog' : 'dialog'"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /data-modal="1"/);
  }
});

test('app exposes semantic landmarks and skip navigation', async () => {
  const app = await read('src/App.vue');
  const home = await read('src/features/home/components/HomeMain.vue');
  const sidebar = await read('src/features/navigation/components/SideBar.vue');
  const styles = await read('src/style.css');

  assert.match(app, /class="skip-link"/);
  assert.match(app, /<header[^>]+aria-label="全局操作"/);
  assert.match(home, /id="main-content"/);
  assert.match(home, /aria-label="主内容"/);
  assert.match(sidebar, /role="navigation"/);
  assert.match(sidebar, /aria-label="分组导航"/);
  assert.match(styles, /\.skip-link:focus/);
  assert.match(styles, /\.sr-only/);
});

test('boot loading is fast-path with post-boot recovery', async () => {
  const lifecycle = await read('src/stores/config/lifecycleActions.ts');
  const repository = await read('src/core/config/repository.ts');
  const main = await read('src/main.ts');
  const performance = await read('src/shared/utils/performance.ts');
  const systemStats = await read('src/core/system/systemStats.ts');

  assert.match(lifecycle, /BOOT_SOFT_TIMEOUT_MS/);
  assert.match(lifecycle, /loadConfigPromise/);
  assert.match(lifecycle, /config\.load\.boot/);
  assert.match(lifecycle, /fallback-timeout/);
  assert.match(lifecycle, /config\.postBoot/);
  assert.match(lifecycle, /localRevision\.value !== fallbackRevision/);
  assert.match(main, /const configReady = store\.loadConfig\(\)/);
  assert.match(main, /app\.mount\('#app'\)/);
  assert.doesNotMatch(main, /await store\.loadConfig\(\)/);
  assert.match(performance, /DEFAULT_PERFORMANCE_BUDGETS/);
  assert.match(performance, /getPerformanceBudgetReport/);
  assert.match(systemStats, /budgets: VoidTabPerformanceBudgetReport/);
  assert.match(repository, /ConfigBootDeferredWork/);
  assert.match(repository, /deferred\.wallpaper/);
  assert.match(repository, /deferred\.legacySave/);
});

test('network widgets defer first external request until visible idle time', async () => {
  const deferred = await read('src/shared/composables/useDeferredWidgetLoad.ts');
  const weather = await read('src/features/widgets/builtins/weather/WeatherWidget.vue');
  const github = await read('src/features/widgets/builtins/github-trending/GitHubTrendingWidget.vue');
  const stock = await read('src/features/widgets/builtins/stock-ticker/StockTickerWidget.vue');
  const ip = await read('src/features/widgets/builtins/ip-info/IpInfoWidget.vue');
  const holiday = await read('src/features/widgets/builtins/holiday/HolidayWidget.vue');

  assert.match(deferred, /IntersectionObserver/);
  assert.match(deferred, /document\.visibilityState === 'hidden'/);
  assert.match(deferred, /requestIdleCallback/);
  assert.match(deferred, /widget\.load\.deferred/);

  for (const source of [weather, github, stock, ip, holiday]) {
    assert.match(source, /useDeferredWidgetLoad/);
    assert.match(source, /ref="rootEl"/);
  }

  assert.doesNotMatch(weather, /useGeolocation/);
  assert.doesNotMatch(weather, /onMounted\(fetchData\)/);
  assert.doesNotMatch(github, /onMounted\(\(\) => fetchTrends\(\)\)/);
  assert.match(stock, /useIntervalFn\(fetchData,\s*config\.value\.refreshRate \* 1000,\s*\{immediate:\s*false\}\)/);
  assert.match(ip, /readCachedIpInfo/);
});

test('site icon work is throttled during the startup window', async () => {
  const grid = await read('src/features/home/components/MainGrid.vue');
  const card = await read('src/features/home/components/GlassCard.vue');

  assert.match(grid, /PRELOAD_STARTUP_CURRENT_GROUP_LIMIT\s*=\s*18/);
  assert.match(grid, /isStartupPreloadWindow/);
  assert.match(grid, /idleTimeoutMs: startup \? 1200 : 250/);
  assert.match(grid, /const neighborUrls = startup \? \[\] : collectAutoIconUrls/);
  assert.match(grid, /steadyIconPreloadTimer/);

  assert.match(card, /CARD_ICON_STARTUP_WINDOW_MS/);
  assert.match(card, /scheduleAutoIconResolve/);
  assert.match(card, /requestIdleCallback/);
  assert.match(card, /props\.priority === "low"/);
});

test('main wheel navigation switches groups only at scroll boundaries', async () => {
  const app = await read('src/App.vue');
  const groupNav = await read('src/app/composables/useAppGroupNavigation.ts');
  const iconRefresh = await read('src/app/composables/useBackgroundIconRefresh.ts');
  const home = await read('src/features/home/components/HomeMain.vue');
  const wheel = await read('src/shared/composables/useBoundaryGroupWheel.ts');

  assert.match(app, /useAppGroupNavigation/);
  assert.match(app, /groupNavigation\.mount\(\)/);
  assert.match(app, /groupNavigation\.unmount\(\)/);
  assert.match(groupNav, /useBoundaryGroupWheel/);
  assert.match(groupNav, /groupWheel\.mount\(\)/);
  assert.match(groupNav, /groupWheel\.unmount\(\)/);
  assert.match(groupNav, /resetMainScroll/);
  assert.match(iconRefresh, /if \(!isExtensionContext\(\)\) return/);
  assert.match(iconRefresh, /refreshAutoSiteIconsBatch\(\{maxDomains:\s*48\}\)/);
  assert.match(home, /data-wheel-boundary-switch/);
  assert.match(home, /data-wheel-lock/);
  assert.match(wheel, /canScrollInDirection/);
  assert.match(wheel, /scrollable && scrollable !== boundaryHost/);
  assert.match(wheel, /data-wheel-boundary-switch="true"/);
  assert.match(wheel, /data-wheel-lock="true"/);
});

test('normalizeConfig preserves and repairs core config shape', async () => {
  await runBundledTypeScript('normalize-config', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';
    import {LEGACY_CONFIG_VERSION} from '../../../src/core/config/types.ts';

    const normalized = normalizeConfig({
      version: 0,
      sync: { provider: 'webdav', password: 'secret' },
      ai: { apiKey: 'api-secret', maxHistory: 6 },
      theme: { showSidebar: false, sidebarPos: 'top' },
      layout: [{
        id: 'g1',
        title: 'Group',
        icon: 'Folder',
        items: [
          { id: 'local', title: 'Localhost', url: 'http://localhost:3000', iconType: 'auto' },
          { id: 'widget', kind: 'widget', widgetType: 'clock', w: 99, h: -1 }
        ]
      }],
      runtime: {
        siteIcons: {
          version: 1,
          records: {
            'example.com': { source: 'https://www.google.com/s2/favicons?domain=example.com' }
          }
        }
      }
    });

    assert.equal(normalized.version, LEGACY_CONFIG_VERSION);
    assert.equal(normalized.sync.provider, 'webdav');
    assert.equal(normalized.sync.password, 'secret');
    assert.equal(normalized.ai.apiKey, 'api-secret');
    assert.equal(normalized.ai.maxHistory, 6);
    assert.equal(normalized.theme.showSidebar, false);
    assert.equal(normalized.theme.sidebarPos, 'top');
    assert.equal(normalized.layout[0].items[0].iconType, 'text');
    assert.equal(normalized.layout[0].items[1].kind, 'widget');
    assert.equal(normalized.layout[0].items[1].w, 16);
    assert.equal(normalized.layout[0].items[1].h, 1);
    assert.equal(normalized.runtime.siteIcons.records['example.com'].cacheMode, 'miss');
    assert.equal(normalized.runtime.siteIcons.records['example.com'].provider, 'google_s2');

    const repairedSync = normalizeConfig({ sync: { provider: 'invalid', intervalMinutes: 0 } });
    assert.equal(repairedSync.sync.provider, 'webdav');
    assert.equal(repairedSync.sync.intervalMinutes, 1);
  `);
});

test('P1 supports fixed-unit grids and persists canvas layout bridge fields', async () => {
  const grid = await read('src/features/home/components/MainGrid.vue');
  const normalize = await read('src/core/config/normalize.ts');
  const metrics = await read('src/core/tiles/gridMetrics.ts');

  assert.match(grid, /gridTemplateColumns: `repeat\(\$\{metrics\.cols\}, \$\{metrics\.unit\}px\)`/);
  assert.match(grid, /gridColumnStart: placement\.x \+ 1/);
  assert.match(grid, /startCanvasGesture/);
  assert.match(grid, /toggleCanvasLayout/);
  assert.match(grid, /recordCanvasHistory/);
  assert.match(grid, /undoCanvasLayout/);
  assert.match(normalize, /normalizeTileLayouts/);
  assert.match(normalize, /normalizeWorkspaceLayout/);
  assert.match(metrics, /MAX_TILE_SPAN = 16/);

  await runBundledTypeScript('p1-fixed-grid-and-canvas-layout', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';
    import {getGridMetrics, measureTilePixels} from '../../../src/core/tiles/gridMetrics.ts';

    const config = normalizeConfig({
      layout: [{
        id: 'canvas-group',
        title: 'Canvas',
        icon: 'SquaresFour',
        workspaceLayout: {
          mode: 'canvas',
          profiles: {
            desktop: {unit: 100, gap: 12, minCols: 4, maxCols: 12},
          },
        },
        items: [{
          id: 'large-site',
          kind: 'site',
          title: 'Large',
          url: 'https://example.com',
          w: 9,
          h: 9,
          layouts: {
            desktop: {x: 1, y: 2, w: 9, h: 9},
            mobile: {x: 0, y: 0, w: 3, h: 6},
          },
        }],
      }],
    });

    const group = config.layout[0];
    assert.equal(group.workspaceLayout?.mode, 'canvas');
    assert.equal(group.items[0].w, 9);
    assert.deepEqual(group.items[0].layouts?.desktop, {x: 1, y: 2, w: 9, h: 9});
    assert.deepEqual(group.items[0].layouts?.mobile, {x: 0, y: 0, w: 3, h: 6});

    const desktop = getGridMetrics(1300, 'desktop', group.workspaceLayout);
    assert.deepEqual(desktop, {profile: 'desktop', unit: 100, gap: 12, cols: 11});
    assert.deepEqual(measureTilePixels(3, 4, desktop), {width: 324, height: 436});

    const mobile = getGridMetrics(360, 'mobile', group.workspaceLayout, 4);
    assert.equal(mobile.cols, 4);
  `);
});

test('config import validation rejects non-config JSON before normalize', async () => {
  await runBundledTypeScript('config-import-validation', `
    import assert from 'node:assert/strict';
    import {
      createImportValidationMessages,
      validateImportedConfig,
    } from '../../../src/core/config/validate.ts';

    const invalid = validateImportedConfig({ random: true });
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors[0], /未检测到 VoidTab 配置字段/);

    const valid = validateImportedConfig({
      version: 'legacy',
      sync: { provider: 'bad', password: 'secret' },
      ai: { apiKey: 'ai-key' },
      runtime: { auth: { jwtToken: 'jwt-token' } },
      layout: [{
        id: 'g1',
        title: 'Group',
        icon: 'Folder',
        items: [
          { id: 's1', title: 'Site', url: 'https://example.com' },
          { id: 'w1', kind: 'widget', widgetType: 'clock' }
        ]
      }]
    });

    assert.equal(valid.ok, true);
    assert.equal(valid.summary.groupCount, 1);
    assert.equal(valid.summary.siteCount, 1);
    assert.equal(valid.summary.widgetCount, 1);
    assert.deepEqual(valid.summary.sensitiveFields, ['WebDAV 密码', 'AI Key', '临时 Token']);
    assert.ok(valid.warnings.some((item) => item.includes('sync.provider')));
    assert.ok(createImportValidationMessages(valid).some((item) => item.includes('schema 检查')));

    const malformed = validateImportedConfig({
      sync: { provider: 'webdav', url: 42, intervalMinutes: 'soon' },
      theme: { siteCard: [] },
      ai: { temperature: 'hot' },
      runtime: { auth: [] },
      searchEngines: [{ id: 1, name: 'Broken', url: 2, icon: 'Globe' }],
      layout: [{
        id: 1,
        title: 2,
        icon: 'Folder',
        items: [
          { id: 'bad-site', kind: 'site', url: 42 },
          { id: 'bad-widget', kind: 'widget', widgetType: 7, w: 'wide' }
        ]
      }]
    });

    assert.equal(malformed.ok, true);
    assert.ok(malformed.warnings.some((item) => item.includes('sync.url')));
    assert.ok(malformed.warnings.some((item) => item.includes('theme.siteCard')));
    assert.ok(malformed.warnings.some((item) => item.includes('runtime.auth')));
    assert.ok(malformed.warnings.some((item) => item.includes('searchEngines[0].url')));
    assert.ok(malformed.warnings.some((item) => item.includes('layout[0].items[1].widgetType')));

    const hardInvalid = validateImportedConfig({ layout: [{ items: {} }] });
    assert.equal(hardInvalid.ok, false);
    assert.ok(hardInvalid.errors.some((item) => item.includes('layout[0].items')));
  `);
});

test('bookmark HTML import dedupe skips existing and in-file duplicate URLs', async () => {
  await runBundledTypeScript('bookmark-import-dedup', `
    import assert from 'node:assert/strict';
    import {
      createBookmarkUrlKey,
      dedupeImportedBookmarkGroups,
    } from '../../../src/shared/utils/bookmarkImportDedup.ts';

    assert.equal(createBookmarkUrlKey('https://EXAMPLE.com/path/#hash'), 'https://example.com/path');

    const existing = [{
      id: 'existing-group',
      title: 'Existing',
      icon: 'Folder',
      tiles: [{ id: 'existing-site', tileType: 'site', title: 'Example', url: 'https://example.com/path' }]
    }];

    const incoming = [{
      id: 'import-group',
      title: 'Import',
      icon: 'Folder',
      items: [
        { id: 'same-existing', title: 'Same existing', url: 'https://example.com/path#other' },
        { id: 'fresh', title: 'Fresh', url: 'https://fresh.example.com/' },
        { id: 'same-file', title: 'Same file', url: 'https://fresh.example.com/#again' },
        { id: 'empty', title: 'Empty', url: '' }
      ]
    }];

    const result = dedupeImportedBookmarkGroups(incoming, existing);
    assert.equal(result.importedCount, 1);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].items[0].id, 'fresh');
    assert.equal(result.duplicateStats.skippedExisting, 1);
    assert.equal(result.duplicateStats.skippedWithinFile, 1);
    assert.equal(result.duplicateStats.skippedInvalid, 1);
  `);
});

test('sidebar visibility setting is normalized and wired through layout components', async () => {
  const types = await read('src/core/config/types.ts');
  const defaults = await read('src/core/config/default.ts');
  const normalize = await read('src/core/config/normalize.ts');
  const app = await read('src/App.vue');
  const home = await read('src/features/home/components/HomeMain.vue');
  const sidebar = await read('src/features/navigation/components/SideBar.vue');
  const actions = await read('src/features/navigation/components/TopActions.vue');
  const layoutTab = await read('src/features/settings/components/tabs/LayoutTab.vue');

  assert.match(types, /showSidebar: boolean/);
  assert.match(defaults, /showSidebar:\s*true/);
  assert.match(defaults, /version:\s*15/);
  assert.match(normalize, /showSidebar:\s*typeof input\.theme\?\.showSidebar === 'boolean'/);
  assert.match(app, /showSidebarNav/);
  assert.match(app, /:show="!isFocusMode && showSidebarNav"/);
  assert.match(home, /showSidebar: boolean/);
  assert.match(home, /props\.showSidebar/);
  assert.match(sidebar, /shouldRenderSidebar/);
  assert.match(actions, /showSidebar: boolean/);
  assert.match(layoutTab, /显示分组栏/);
  assert.match(layoutTab, /v-model="store\.config\.theme\.showSidebar"/);
});

test('icon density settings update concrete layout parameters', async () => {
  const iconTab = await read('src/features/settings/components/tabs/IconTab.vue');

  assert.match(iconTab, /applyIconDensityPreset/);
  assert.doesNotMatch(iconTab, /store\.config\.theme\.density\s*=\s*val/);

  await runBundledTypeScript('icon-density-presets', `
    import assert from 'node:assert/strict';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {applyIconDensityPreset} from '../../../src/core/theme/densityPresets.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const config = clone(defaultConfig);

    applyIconDensityPreset(config.theme, 'compact');
    assert.equal(config.theme.density, 'compact');
    assert.equal(config.theme.iconSize, 48);
    assert.equal(config.theme.radius, 12);
    assert.equal(config.theme.gap, 14);
    assert.equal(config.theme.iconTextSize, 11);
    assert.equal(config.theme.showIconName, false);
    assert.equal(config.theme.showWidgetName, false);

    applyIconDensityPreset(config.theme, 'normal');
    assert.equal(config.theme.density, 'normal');
    assert.equal(config.theme.iconSize, 60);
    assert.equal(config.theme.radius, 16);
    assert.equal(config.theme.gap, 24);
    assert.equal(config.theme.iconTextSize, 12);
    assert.equal(config.theme.showIconName, true);
    assert.equal(config.theme.showWidgetName, true);

    applyIconDensityPreset(config.theme, 'comfortable');
    assert.equal(config.theme.density, 'comfortable');
    assert.equal(config.theme.iconSize, 78);
    assert.equal(config.theme.radius, 22);
    assert.equal(config.theme.gap, 30);
    assert.equal(config.theme.iconTextSize, 13);
    assert.equal(config.theme.showIconName, true);
    assert.equal(config.theme.showWidgetName, true);
  `);
});

test('view templates never replace user groups or sites', async () => {
  const templates = await read('src/core/templates/presets.ts');
  const tab = await read('src/features/settings/components/tabs/TemplateTab.vue');

  assert.doesNotMatch(templates, /applyTemplateStarterLayout/);
  assert.doesNotMatch(templates, /starterLayoutId/);
  assert.match(tab, /applyTemplatePreset/);
  assert.doesNotMatch(tab, /使用初始布局|替换并应用|会被替换|初始布局/);
  assert.match(templates, /历史常规/);

  await runBundledTypeScript('view-template-preserves-layout', `
    import assert from 'node:assert/strict';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {phosphorIconMap} from '../../../src/shared/icons/phosphorIconMap.ts';
    import {applyTemplatePreset, buildTemplateLayout, templatePresets} from '../../../src/core/templates/presets.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const config = clone(defaultConfig);
    config.layout.push({
      id: 'user-group',
      title: '用户自己的分组',
      icon: 'Folder',
      items: [{
        id: 'user-site',
        kind: 'site',
        title: '用户网站',
        url: 'https://example.com',
        iconType: 'auto',
        remark: '不要被模板覆盖',
      }],
    });

    const layoutRef = config.layout;
    const beforeLayout = clone(config.layout);

    const ids = templatePresets.map((item) => item.id);
    assert.ok(ids.includes('regular'));
    assert.ok(ids.includes('compact'));
    assert.ok(ids.includes('classic'));
    assert.ok(templatePresets.every((item) => !('groups' in item)));
    assert.ok(templatePresets.every((item) => !('starterLayoutId' in item)));
    const registeredGroupIcons = new Set(Object.keys(phosphorIconMap));
    for (const starterId of ['minimal', 'clean', 'office', 'developer', 'legacy']) {
      for (const group of buildTemplateLayout(starterId)) {
        assert.ok(registeredGroupIcons.has(group.icon), starterId + ' uses unregistered icon ' + group.icon);
      }
    }

    for (const id of ids) {
      applyTemplatePreset(config, id);
      assert.equal(config.layout, layoutRef);
      assert.deepEqual(config.layout, beforeLayout);
    }

    const legacyLayout = buildTemplateLayout('legacy');
    assert.deepEqual(legacyLayout.map((group) => group.title), ['常用工具', '游戏', 'AI']);
    assert.equal(legacyLayout[1].items.length, 8);
    assert.equal(legacyLayout[2].items.length, 15);

    applyTemplatePreset(config, 'firefox');
    assert.equal(config.theme.siteLayoutMode, 'card');
    assert.equal(config.theme.showSidebar, false);
    assert.equal(config.theme.siteCard.w, 1);
    assert.equal(config.theme.siteCard.h, 1);

    applyTemplatePreset(config, 'compact');
    assert.equal(config.layout, layoutRef);
    assert.deepEqual(config.layout, beforeLayout);
    assert.equal(config.theme.density, 'compact');
    assert.equal(config.theme.iconSize, 48);

    applyTemplatePreset(config, 'regular');
    assert.equal(config.layout, layoutRef);
    assert.deepEqual(config.layout, beforeLayout);
    assert.equal(config.theme.density, 'normal');
    assert.equal(config.theme.iconSize, 60);
  `);
});

test('template cards and wallpaper media keep resource use bounded', async () => {
  const tab = await read('src/features/settings/components/tabs/TemplateTab.vue');
  const layer = await read('src/app/shell/WallpaperLayer.vue');
  const storage = await read('src/core/wallpaper/storage.ts');

  assert.match(tab, /class="template-grid"/);
  assert.match(tab, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(tab, /'--preview-accent': 'var\(--accent-color\)'/);
  assert.match(tab, /'--preview-accent-rgb': 'var\(--accent-color-rgb\)'/);

  assert.match(storage, /REMOTE_IMAGE_MAX_BYTES/);
  assert.match(storage, /REMOTE_IMAGE_MAX_ENTRIES/);
  assert.match(storage, /getCachedRemoteImage/);
  assert.match(storage, /cacheRemoteImage/);
  assert.doesNotMatch(storage, /cacheRemoteVideo/);
  assert.match(layer, /isRemoteHttpImage/);
  assert.match(layer, /fetchRemoteImageToCache/);
  assert.match(layer, /document\.addEventListener\('visibilitychange', syncVideoPlayback\)/);
  assert.match(layer, /document\.hidden/);
  assert.match(layer, /preload="metadata"/);
});

test('memo notes normalize legacy data and preserve an explicit empty list', async () => {
  const widget = await read('src/features/widgets/builtins/terminal-buffer/TerminalWidget.vue');
  const modal = await read('src/features/widgets/builtins/terminal-buffer/TerminalModal.vue');
  const registry = await read('src/core/registry/widgets.ts');

  assert.match(registry, /label:\s*'备忘录'/);
  assert.match(widget, /getMemoExcerpt/);
  assert.match(modal, /saveMemoNote/);
  assert.match(modal, /filteredNotes/);
  assert.match(modal, /@contextmenu\.prevent="openNoteContextMenu/);
  assert.match(modal, /startRenameCategory/);
  assert.match(modal, /deleteConfirmedCategory/);

  await runBundledTypeScript('memo-note-normalization', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';

    const cleared = normalizeConfig({
      runtime: {
        terminal_buffer: {
          buffer: 'stale legacy buffer',
          theme: 'retro',
          notes: [],
        },
      },
    });
    assert.deepEqual(cleared.runtime.terminal_buffer.notes, []);

    const migratedCommands = normalizeConfig({
      runtime: {
        terminal_buffer: {
          buffer: '',
          theme: 'standard',
          commands: [{
            id: 'legacy-build',
            title: 'Build',
            command: 'npm run build',
            description: 'legacy command memo',
            category: 'dev',
            createdAt: 1,
            updatedAt: 2,
          }],
        },
      },
    });
    assert.equal(migratedCommands.runtime.terminal_buffer.notes.length, 1);
    assert.equal(migratedCommands.runtime.terminal_buffer.notes[0].content, 'npm run build');
    assert.equal(migratedCommands.runtime.terminal_buffer.notes[0].summary, 'legacy command memo');
    assert.equal(migratedCommands.runtime.terminal_buffer.notes[0].category, 'work');

    const migratedBuffer = normalizeConfig({
      runtime: {terminal_buffer: {buffer: '# old note', theme: 'retro'}},
    });
    assert.equal(migratedBuffer.runtime.terminal_buffer.notes.length, 1);
    assert.equal(migratedBuffer.runtime.terminal_buffer.notes[0].content, '# old note');

    const customTags = normalizeConfig({
      runtime: {
        terminal_buffer: {
          buffer: '',
          theme: 'standard',
          categories: [{id: 'client', label: '客户'}],
          notes: [{
            id: 'client-note',
            title: '回访',
            content: '确认需求',
            category: 'client',
            createdAt: 1,
            updatedAt: 1,
          }],
        },
      },
    });
    assert.deepEqual(customTags.runtime.terminal_buffer.categories, [{id: 'client', label: '客户'}]);
    assert.equal(customTags.runtime.terminal_buffer.notes[0].category, 'client');
  `);
});

test('runtime config normalizes dirty extension storage before schema validation', async () => {
  await runBundledTypeScript('runtime-dirty-extension-storage', `
    import assert from 'node:assert/strict';
    import {normalizeConfig} from '../../../src/core/config/normalize.ts';
    import {validateConfigForSave} from '../../../src/core/config/validate.ts';

    const normalized = normalizeConfig({
      runtime: {
        cron: 'legacy-bad-cron',
        auth: {jwtToken: 123},
        terminal: {
          history: 'npm run build',
          theme: 'retro',
          isOpen: 'yes',
        },
        siteState: [],
        widgets: [],
        widgetState: [],
        photo: [],
        siteList: {groups: null, widgets: null},
      },
    });

    const result = validateConfigForSave(normalized);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.deepEqual(normalized.runtime.terminal.history, []);
    assert.equal(normalized.runtime.terminal.theme, 'dark');
    assert.equal(normalized.runtime.terminal.isOpen, false);
    assert.equal(normalized.runtime.auth.jwtToken, '');
    assert.ok(normalized.runtime.cron.expr);
    assert.ok(normalized.runtime.siteList.groups.default_group);
    assert.deepEqual(normalized.runtime.photo.widgets, {});
    assert.deepEqual(normalized.runtime.widgetState, {});
  `);
});

test('sensitive config helpers encrypt local secrets and keep sync payload clean', async () => {
  await runBundledTypeScript('sensitive-config', `
    import assert from 'node:assert/strict';
    import {defaultConfig} from '../../../src/core/config/default.ts';
    import {
      ENCRYPTED_VALUE_PREFIX,
      mergeLocalSensitiveFields,
      openSensitiveConfigFromStorage,
      sealSensitiveConfigForStorage,
      stripSensitiveConfigForSync,
    } from '../../../src/core/config/sensitive.ts';

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const config = clone(defaultConfig);
    config.sync.password = 'webdav-pass';
    config.ai.apiKey = 'ai-key';
    config.runtime.auth.jwtToken = 'jwt-token';

    const sealed = await sealSensitiveConfigForStorage(config);
    assert.ok(sealed.sync.password.startsWith(ENCRYPTED_VALUE_PREFIX));
    assert.ok(sealed.ai.apiKey.startsWith(ENCRYPTED_VALUE_PREFIX));
    assert.ok(sealed.runtime.auth.jwtToken.startsWith(ENCRYPTED_VALUE_PREFIX));
    assert.notEqual(sealed.sync.password, config.sync.password);

    const sealedAgain = await sealSensitiveConfigForStorage(sealed);
    assert.equal(sealedAgain.sync.password, sealed.sync.password);
    assert.equal(sealedAgain.ai.apiKey, sealed.ai.apiKey);

    const opened = await openSensitiveConfigFromStorage(sealed);
    assert.equal(opened.sync.password, 'webdav-pass');
    assert.equal(opened.ai.apiKey, 'ai-key');
    assert.equal(opened.runtime.auth.jwtToken, 'jwt-token');

    const syncPayload = stripSensitiveConfigForSync(config);
    assert.equal(syncPayload.sync.password, '');
    assert.equal(syncPayload.ai.apiKey, '');
    assert.equal(syncPayload.runtime.auth.jwtToken, '');

    const remote = clone(defaultConfig);
    const merged = mergeLocalSensitiveFields(remote, config);
    assert.equal(merged.sync.password, 'webdav-pass');
    assert.equal(merged.ai.apiKey, 'ai-key');
    assert.equal(merged.runtime.auth.jwtToken, 'jwt-token');
  `);
});

test('P0 tile contracts freeze schemas, deterministic layout behavior, and compatibility gates', async () => {
  const manifestSchema = JSON.parse(await read('docs/schemas/tile-manifest.v1.schema.json'));
  const configSchema = JSON.parse(await read('docs/schemas/config-v6-tile-layout.schema.json'));
  const contracts = await read('src/core/tiles/contracts.ts');
  const solver = await read('src/core/tiles/layoutSolver.ts');
  const compatibility = await read('src/core/tiles/compatibility.ts');

  assert.equal(manifestSchema.properties.manifestVersion.const, 1);
  assert.ok(manifestSchema.properties.id.pattern.includes('/'));
  assert.equal(configSchema.properties.version.const, 6);
  assert.ok(configSchema.$defs.workspace);
  assert.match(contracts, /interface TileManifestWire/);
  assert.match(contracts, /interface BuiltinTileRegistration/);
  assert.match(contracts, /interface TileConfigV6Draft/);
  assert.match(solver, /export function solveCanvasLayout/);
  assert.match(compatibility, /export function evaluateTileCompatibility/);

  await runBundledTypeScript('p0-tile-contracts', `
    import assert from 'node:assert/strict';
    import {findFirstAvailablePlacement, solveCanvasLayout} from '../../../src/core/tiles/layoutSolver.ts';
    import {compareVersions, evaluateTileCompatibility} from '../../../src/core/tiles/compatibility.ts';
    import type {HostCapabilities, TileCompatibility} from '../../../src/core/tiles/contracts.ts';

    const base = {
      cols: 4,
      placements: {
        alpha: {x: 0, y: 0, w: 2, h: 2},
        beta: {x: 2, y: 0, w: 2, h: 2},
        gamma: {x: 0, y: 2, w: 2, h: 1},
      },
      sizeRules: {
        alpha: {default: {w: 2, h: 2}, min: {w: 1, h: 1}, max: {w: 3, h: 3}},
      },
    };

    const moved = solveCanvasLayout(base, {type: 'move', profile: 'desktop', tileId: 'alpha', x: 0, y: 1});
    assert.equal(moved.rejected, undefined);
    assert.deepEqual(moved.placements.alpha, {x: 0, y: 1, w: 2, h: 2});
    assert.deepEqual(moved.placements.gamma, {x: 0, y: 3, w: 2, h: 1});
    assert.deepEqual(base.placements.gamma, {x: 0, y: 2, w: 2, h: 1});
    assert.deepEqual(
      solveCanvasLayout(base, {type: 'move', profile: 'desktop', tileId: 'alpha', x: 0, y: 1}),
      moved,
    );

    const locked = solveCanvasLayout({...base, lockedTileIds: ['beta']}, {type: 'move', profile: 'desktop', tileId: 'alpha', x: 2, y: 0});
    assert.equal(locked.rejected?.code, 'locked');

    const invalidSize = solveCanvasLayout(base, {type: 'resize', profile: 'desktop', tileId: 'alpha', w: 4, h: 2, anchor: 'nw'});
    assert.equal(invalidSize.rejected?.code, 'invalid-size');

    const compacted = solveCanvasLayout({
      cols: 4,
      placements: {
        alpha: {x: 0, y: 3, w: 2, h: 1},
        beta: {x: 2, y: 3, w: 2, h: 1},
      },
    }, {type: 'compact', profile: 'desktop'});
    assert.deepEqual(compacted.placements.alpha, {x: 0, y: 0, w: 2, h: 1});
    assert.deepEqual(compacted.placements.beta, {x: 2, y: 0, w: 2, h: 1});

    const firstFit = findFirstAvailablePlacement(
      {alpha: {x: 0, y: 0, w: 2, h: 1}},
      4,
      {w: 1, h: 1},
    );
    assert.deepEqual(firstFit, {x: 2, y: 0, w: 1, h: 1});

    const host: HostCapabilities = {
      target: 'web',
      hostVersion: '1.2.0',
      browser: {family: 'chrome', version: 120},
      features: {
        indexedStorage: true,
        syncStorage: false,
        networkProxy: false,
        clipboardWrite: false,
        notifications: false,
        openExternal: true,
        contextMenus: false,
        localFileImport: true,
        sandboxRuntime: false,
      },
    };
    const requiredNetwork: TileCompatibility = {
      targets: ['web'],
      minHostVersion: '1.2.0',
      mobileSupport: 'full',
      capabilities: [{feature: 'networkProxy', level: 'required'}],
    };
    assert.equal(evaluateTileCompatibility({compatibility: requiredNetwork, host}).state, 'unsupported');
    const enabledHost = {...host, features: {...host.features, networkProxy: true}};
    assert.equal(evaluateTileCompatibility({compatibility: requiredNetwork, host: enabledHost}).state, 'blocked');
    assert.equal(evaluateTileCompatibility({compatibility: requiredNetwork, host: enabledHost, grantedRequiredFeatures: ['networkProxy']}).state, 'supported');
    const optionalClipboard: TileCompatibility = {
      ...requiredNetwork,
      capabilities: [{feature: 'clipboardWrite', level: 'optional'}],
    };
    assert.equal(evaluateTileCompatibility({compatibility: optionalClipboard, host}).state, 'degraded');
    assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
  `);
});

let failed = 0;
for (const check of checks) {
  try {
    await check.fn();
    console.log(`ok - ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${check.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  await rm(tmpRoot, {recursive: true, force: true});
  process.exit(1);
}

await rm(tmpRoot, {recursive: true, force: true});
console.log(`${checks.length} test(s) passed`);
