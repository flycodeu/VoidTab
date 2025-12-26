import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
console.log("VITE 配置已加载！正在启动代理服务...");
export default defineConfig({
    plugins: [vue()],
    base: './', // 确保相对路径
    server: {
        // 添加代理配置
        proxy: {
            // 1. 代理地理编码 API (解决你现在的报错)
            '/api/geo': {
                target: 'https://geocoding-api.open-meteo.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/geo/, '')
            },
            // 2. 顺便把天气 API 也代理了 (预防未来报错)
            '/api/weather': {
                target: 'https://api.open-meteo.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/weather/, '')
            }
        }
    },
    build: {
        // 关键配置：输出目录设为 dist
        outDir: 'dist',
        rollupOptions: {
            // 输入入口：告诉 Vite 有两个文件要处理
            input: {
                main: resolve(__dirname, 'index.html'),
                background: resolve(__dirname, 'src/background.ts')
            },
            // 输出配置：强制去掉文件名后的哈希乱码
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    }
})