import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'path'

export default defineConfig({
    plugins: [vue()],
    base: './',
    server: {
        proxy: {
            '/api/geo': {
                target: 'https://geocoding-api.open-meteo.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/geo/, '')
            },
            '/api/weather': {
                target: 'https://api.open-meteo.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/weather/, '')
            }
        }
    },

    // ✨ 关键修正：移除 terser 配置，改用内置 esbuild
    esbuild: {
        // 同样可以实现移除 console 和 debugger
        drop: ['console', 'debugger'],
    },

    build: {
        outDir: 'dist',
        assetsInlineLimit: 4096,
        // 默认使用 esbuild 压缩，无需额外安装
        minify: 'esbuild',

        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                background: resolve(__dirname, 'src/background.ts')
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',

                // 保持之前的合并策略，减少请求数
                manualChunks(id) {
                    if (id.includes('src/background.ts')) {
                        return 'background';
                    }
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                }
            }
        }
    }
})