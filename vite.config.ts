// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

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

    if (packageName === '@phosphor-icons/vue') return 'vendor-icons'
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

export default defineConfig(({ mode }) => {
    // mode === 'ext' 时才把 background 作为入口构建
    const isExt = mode === 'ext'

    return {
        plugins: [vue()],
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
                        background: resolve(__dirname, 'src/background.ts'),
                    }
                    : {
                        main: resolve(__dirname, 'index.html'),
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
