// web-ext configuration. Auto-discovered by web-ext (run / lint / sign).
// All commands operate on the Firefox build in ./dist produced by
// `npm run build:firefox` (which writes the Firefox manifest into dist/).
//
// Signing reads credentials from the environment (do NOT commit them):
//   WEB_EXT_API_KEY     = AMO JWT issuer   (user:xxxx:xxx)
//   WEB_EXT_API_SECRET  = AMO JWT secret
// then: npm run ff:sign   (defaults to the self-distribution "unlisted" channel)
module.exports = {
    sourceDir: './dist',
    artifactsDir: './dist-firefox',
    build: {
        overwriteDest: true,
    },
    run: {
        target: ['firefox-desktop'],
        // Open the extension's new tab on launch so the override is visible immediately.
        startUrl: ['about:newtab'],
        browserConsole: true,
    },
    lint: {
        warningsAsErrors: false,
    },
    sign: {
        // Self-distributed signed .xpi. Use 'listed' to publish on AMO instead.
        channel: 'unlisted',
    },
};
