// Firefox post-build step.
//
// Run AFTER `vite build --mode ext` (which produces dist/ with the main app and a
// Chromium-flavoured background). This step:
//   1. re-bundles src/background.ts as a self-contained classic IIFE so it can be
//      loaded via Firefox's `background.scripts` (no ES module / code-split deps),
//   2. overwrites dist/manifest.json with the Firefox manifest.
//
// Usage: node scripts/build-firefox.mjs   (or `npm run build:firefox`)
import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function run() {
    await build({
        entryPoints: [resolve(root, 'src/background.ts')],
        outfile: resolve(root, 'dist/assets/background.js'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['firefox115'],
        minify: true,
        legalComments: 'none',
        drop: ['console', 'debugger'],
        define: {'process.env.NODE_ENV': '"production"'},
    });

    await copyFile(resolve(root, 'manifest.firefox.json'), resolve(root, 'dist/manifest.json'));

    console.log('[firefox] background re-bundled as IIFE and manifest.firefox.json applied -> dist/');
}

run().catch((error) => {
    console.error('[firefox] build failed:', error);
    process.exit(1);
});
