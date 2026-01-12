/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // 定义赛博朋克核心色板
                cyber: {
                    dark: '#0f172a',
                    light: '#e2e8f0',
                    neon: '#06b6d4',  // 青色
                    purple: '#8b5cf6', // 紫色
                    glass: 'rgba(255, 255, 255, 0.05)',
                }
            },
            boxShadow: {
                // 定义发光效果
                'neon-blue': '0 0 10px rgba(6, 182, 212, 0.5), 0 0 20px rgba(6, 182, 212, 0.3)',
                'neon-purple': '0 0 10px rgba(139, 92, 246, 0.5), 0 0 20px rgba(139, 92, 246, 0.3)',
                'glass-inset': 'inset 0 0 20px rgba(255, 255, 255, 0.05)',
            },
            backdropBlur: {
                'xs': '2px',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            }
        },
    },
    plugins: [],
}