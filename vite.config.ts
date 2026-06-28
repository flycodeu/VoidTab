// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import {fetchStockPayload, parseStockSymbols} from './api/stock-core.js'
import {fetchFaviconProxyPayload} from './api/favicon-core.js'

const getNodePackageName = (id: string) => {
    const normalizedId = id.replace(/\\/g, '/')
    const marker = '/node_modules/'
    const markerIndex = normalizedId.lastIndexOf(marker)
    if (markerIndex < 0) return ''

    const segments = normalizedId.slice(markerIndex + marker.length).split('/')
    if (!segments[0]) return ''
    if (segments[0].startsWith('@')) return `${segments[0]}/${segments[1] || ''}`
    return segments[0]
}

const getVendorChunkName = (id: string) => {
    const packageName = getNodePackageName(id)
    if (!packageName) return undefined

    if (packageName === '@phosphor-icons/vue') return undefined
    if (
        packageName === 'vue' ||
        packageName === 'pinia' ||
        packageName.startsWith('@vue/') ||
        packageName.startsWith('@vueuse/')
    ) {
        return 'vendor-vue'
    }
    if (
        packageName === 'markdown-it' ||
        packageName === 'highlight.js' ||
        packageName === 'dompurify'
    ) {
        return 'vendor-markdown'
    }
    if (
        packageName === 'lunar-javascript' ||
        packageName === 'lunar-typescript' ||
        packageName === 'cron-parser' ||
        packageName === 'cronstrue'
    ) {
        return 'vendor-widgets-time'
    }
    if (packageName === 'fuse.js' || packageName === 'pinyin-pro') return 'vendor-search'
    if (packageName === 'idb' || packageName === 'uuid' || packageName === 'immer') return 'vendor-data'
    if (
        packageName === 'sortablejs' ||
        packageName === 'vue-draggable-plus' ||
        packageName === 'vuedraggable'
    ) {
        return 'vendor-dnd'
    }

    return 'vendor-core'
}

const createStockApiDevPlugin = () => ({
    name: 'voidtab-stock-api-dev',
    configureServer(server: any) {
        server.middlewares.use('/api/stock', async (req: any, res: any) => {
            const url = new URL(req.url || '/', 'http://localhost')

            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

            if (req.method === 'OPTIONS') {
                res.statusCode = 204
                res.end()
                return
            }

            if (req.method !== 'GET') {
                res.statusCode = 405
                res.end(JSON.stringify({error: 'Method not allowed'}))
                return
            }

            const symbols = parseStockSymbols(url.searchParams.get('symbols'))
            if (!symbols.length) {
                res.statusCode = 400
                res.end(JSON.stringify({error: 'Missing symbols'}))
                return
            }

            try {
                const payload = await fetchStockPayload(symbols, {
                    range: url.searchParams.get('range') || '1d',
                    interval: url.searchParams.get('interval') || '5m',
                })
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify(payload))
            } catch (error: any) {
                res.statusCode = error?.statusCode || 502
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({
                    error: error instanceof Error ? error.message : 'Stock quote unavailable',
                    errors: error?.errors || [],
                }))
            }
        })
    },
})

const createFaviconApiDevPlugin = () => ({
    name: 'voidtab-favicon-api-dev',
    configureServer(server: any) {
        server.middlewares.use('/api/favicon', async (req: any, res: any) => {
            const url = new URL(req.url || '/', 'http://localhost')

            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

            if (req.method === 'OPTIONS') {
                res.statusCode = 204
                res.end()
                return
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.statusCode = 405
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({error: 'Method not allowed'}))
                return
            }

            try {
                const payload = await fetchFaviconProxyPayload(url.searchParams.get('url'))
                res.statusCode = 200
                res.setHeader('Content-Type', payload.contentType)
                res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
                res.setHeader('X-VoidTab-Favicon-Source', payload.source)
                res.end(req.method === 'HEAD' ? undefined : payload.body)
            } catch (error: any) {
                res.statusCode = error?.statusCode || 502
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({
                    error: error instanceof Error ? error.message : 'Favicon unavailable',
                }))
            }
        })
    },
})

const createSandboxRuntimeDevPlugin = () => ({
    name: 'voidtab-sandbox-runtime-dev',
    configureServer(server: any) {
        server.middlewares.use('/assets/sandbox-page.js', async (req: any, res: any, next: any) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                next()
                return
            }
            try {
                const result = await server.transformRequest('/src/sandbox-page.ts')
                if (!result?.code) throw new Error('sandbox runtime transform failed')
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
                res.setHeader('Cache-Control', 'no-store')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.end(req.method === 'HEAD' ? undefined : result.code)
            } catch (error) {
                next(error)
            }
        })
    },
})

export default defineConfig(({ mode }) => {
    // mode === 'ext' 时才把 background 作为入口构建
    const isExt = mode === 'ext'

    return {
        plugins: [vue(), createStockApiDevPlugin(), createFaviconApiDevPlugin(), createSandboxRuntimeDevPlugin()],
        base: './',

        server: {
            proxy: {
                '/jianguoyun': {
                    target: 'https://dav.jianguoyun.com', // 🟢 只代理到域名
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/jianguoyun/, ''), // 🟢 剥离前缀
                    secure: false,
                },
            },
        },

        // 移除 terser 配置，改用内置 esbuild
        esbuild: {
            drop: ['console', 'debugger'],
        },

        build: {
            outDir: 'dist',
            assetsInlineLimit: 4096,
            chunkSizeWarningLimit: 900,
            minify: 'esbuild',

            rollupOptions: {
                //   web 构建不要包含 background 入口
                input: isExt
                    ? {
                        main: resolve(__dirname, 'index.html'),
                        'sandbox-page': resolve(__dirname, 'src/sandbox-page.ts'),
                        background: resolve(__dirname, 'src/background.ts'),
                    }
                    : {
                        main: resolve(__dirname, 'index.html'),
                        'sandbox-page': resolve(__dirname, 'src/sandbox-page.ts'),
                    },

                output: {
                    entryFileNames: 'assets/[name].js',
                    chunkFileNames: 'assets/[name].js',
                    assetFileNames: 'assets/[name].[ext]',

                    // 手动分包：背景脚本只在 ext 模式下存在
                    manualChunks(id) {
                        // ⚠️ 注意：background.ts 是独立入口时，不需要再手动切它的 chunk
                        return getVendorChunkName(id)
                    },
                },
            },
        },
    }
})
