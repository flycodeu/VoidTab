// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

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
            minify: 'esbuild',

            rollupOptions: {
                //   关键：web 构建不要包含 background 入口
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
                        // 这里只保留 vendor 拆分即可，避免奇怪的依赖/预加载行为
                        if (id.includes('node_modules')) {
                            return 'vendor'
                        }
                    },
                },
            },
        },
    }
})
