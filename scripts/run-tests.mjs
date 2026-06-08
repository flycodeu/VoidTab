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
});

test('favicon probing avoids extension fetch false negatives', async () => {
  const icon = await read('src/shared/utils/icon.ts');
  const cache = await read('src/shared/utils/siteIconCache.ts');

  assert.match(icon, /canUseBrowserFaviconApi/);
  assert.match(icon, /permissions\.includes\('favicon'\)/);
  assert.doesNotMatch(icon, /if\s*\(\s*isExtensionContext\(\)\s*\)\s*return true/);
  assert.match(icon, /PERSISTENT_FAIL_STORAGE_KEY\s*=\s*'voidtab:icon_candidate_fail:v3'/);
  assert.match(icon, /createProbeImageObjectUrl/);
  assert.match(icon, /FETCHABLE_ICON_PROBE_HOSTS/);
  assert.match(icon, /probeIconCandidateBatch/);
  assert.match(icon, /parallelism: options\?\.parallelism/);
  assert.match(cache, /SITE_ICON_CACHE_VERSION\s*=\s*12/);
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

  assert.match(icon, /return getFastIconCandidates\(url\)\[0\] \|\| ''/);
  assert.doesNotMatch(icon, /getFastIconCandidates\(url\)\[0\] \|\| explicitDirect \|\| legacyDirect/);
  assert.match(icon, /first_party_proxy/);
  assert.match(icon, /buildFirstPartyProxyCandidates/);
  assert.match(icon, /!proxyCandidates\.length/);
  assert.match(icon, /candidate\.provider !== 'first_party_proxy'/);
  assert.match(siteIcon, /url\.includes\('\/api\/favicon'\) \? 5200 : 1600/);
  assert.match(icon, /if \(privateOrLocal\) \{\s*candidates\.push\(\.\.\.buildSiteOriginCandidates\(origin\)\);/);
  assert.match(preloader, /if \(isExtensionContext\(\)\) return true/);
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
  assert.match(panel, /import DOMPurify from 'dompurify'/);
  assert.match(panel, /html:\s*false/);
  assert.match(panel, /DOMPurify\.sanitize/);
  assert.match(panel, /ALLOWED_URI_REGEXP/);
});

test('config storage encrypts sensitive local fields and strips sync payload', async () => {
  const sensitive = await read('src/core/config/sensitive.ts');
  const repository = await read('src/core/config/repository.ts');
  const syncActions = await read('src/stores/config/syncActions.ts');

  assert.match(sensitive, /sync\.password/);
  assert.match(sensitive, /ai\.apiKey/);
  assert.match(sensitive, /runtime\.auth\.jwtToken/);
  assert.match(sensitive, /ENCRYPTED_VALUE_PREFIX\s*=\s*'enc:v1:'/);
  assert.match(repository, /sealSensitiveConfigForStorage/);
  assert.match(repository, /openSensitiveConfigFromStorage/);
  assert.match(repository, /loadForBoot/);
  assert.match(repository, /completeBootLoad/);
  assert.match(repository, /restoreWallpaper:\s*false/);
  assert.match(repository, /saveLegacyMigration:\s*false/);
  assert.match(syncActions, /stripSensitiveConfigForSync/);
  assert.match(syncActions, /mergeLocalSensitiveFields/);
  assert.match(syncActions, /buildSyncPayload/);
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

  assert.match(lifecycle, /BOOT_SOFT_TIMEOUT_MS/);
  assert.match(lifecycle, /config\.load\.boot/);
  assert.match(lifecycle, /fallback-timeout/);
  assert.match(lifecycle, /config\.postBoot/);
  assert.match(lifecycle, /localRevision\.value !== fallbackRevision/);
  assert.match(repository, /ConfigBootDeferredWork/);
  assert.match(repository, /deferred\.wallpaper/);
  assert.match(repository, /deferred\.legacySave/);
});

test('main wheel navigation switches groups only at scroll boundaries', async () => {
  const app = await read('src/App.vue');
  const home = await read('src/features/home/components/HomeMain.vue');
  const wheel = await read('src/shared/composables/useBoundaryGroupWheel.ts');

  assert.match(app, /useBoundaryGroupWheel/);
  assert.match(app, /groupWheel\.mount\(\)/);
  assert.match(app, /groupWheel\.unmount\(\)/);
  assert.match(app, /resetMainScroll/);
  assert.match(app, /scheduleBackgroundIconRefresh/);
  assert.match(app, /if \(!isExtensionContext\(\)\) return/);
  assert.match(app, /refreshAutoSiteIconsBatch\(\{maxDomains:\s*48\}\)/);
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
    assert.equal(normalized.layout[0].items[0].iconType, 'text');
    assert.equal(normalized.layout[0].items[1].kind, 'widget');
    assert.equal(normalized.layout[0].items[1].w, 4);
    assert.equal(normalized.layout[0].items[1].h, 1);
    assert.equal(normalized.runtime.siteIcons.records['example.com'].cacheMode, 'miss');
    assert.equal(normalized.runtime.siteIcons.records['example.com'].provider, 'google_s2');
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
