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
  assert.match(syncActions, /stripSensitiveConfigForSync/);
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

test('MainGrid debounces resize and ResizeObserver recalculation', async () => {
  const grid = await read('src/features/home/components/MainGrid.vue');
  assert.match(grid, /useDebounceFn/);
  assert.match(grid, /recalcGridDebounced/);
  assert.match(grid, /new ResizeObserver\(\(\) => recalcGridDebounced\(\)\)/);
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
    import {CURRENT_CONFIG_VERSION} from '../../../src/core/config/types.ts';

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

    assert.equal(normalized.version, CURRENT_CONFIG_VERSION);
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
      items: [{ id: 'existing-site', title: 'Example', url: 'https://example.com/path' }]
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
    import {solveCanvasLayout} from '../../../src/core/tiles/layoutSolver.ts';
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
