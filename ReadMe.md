# 🌌 VoidTab - Cyberpunk Browser Dashboard

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vue](https://img.shields.io/badge/Vue.js-3.x-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite)

**VoidTab** 是一个基于 **Vue 3 + TypeScript** 构建的极简、赛博朋克风格浏览器起始页。

它摒弃了传统导航页的臃肿与广告，专注于**极致的视觉体验**与**纯粹的效率**。拥有高度定制化的毛玻璃
UI、沉浸式的数据控制台（HUD）以及完全本地化的数据存储。
![img.png](img/img.png)
> 🤖 **Fun Fact:** 本项目 99% 的代码由 AI (Google Gemini) 辅助编写，是一个探索 AI 辅助独立开发的实验性项目。

---

## ✨ 功能特性 (Features)

### 🎨 极致视觉

- **毛玻璃拟态 (Glassmorphism)**：全局采用高斯模糊与半透明设计，质感细腻。
- **动态主题**：支持浅色/深色模式切换，深色模式下拥有独特的赛博霓虹光效。
- **自定义壁纸**：支持网络图片链接或本地上传背景。
![img_2.png](img/img_2.png)
### 🕹️ 战术控制台 (Data HUD)

通过右上角按钮呼出沉浸式仪表盘：

- **🌤️ 天气气象站**：自动定位，提供实时温度、湿度、风速及未来 7 天预报，内置中国农历与宜忌查询。
- **📈 GitHub 趋势**：实时获取 GitHub 热门开源项目，展示 Star 数与语言分布，点击直达。
- **🖥️ 系统监控**：浏览器级硬件监控，实时显示 FPS、CPU 核心数、内存占用估算及网络延迟。
![img_1.png](img/img_1.png)

### ⚡ 高效交互

- **专注模式 (Focus Mode)**：一键隐藏所有杂项，仅保留时间与搜索框，提供极致的沉浸式体验。
- **流式布局**：精心调教的 Flex 布局，搜索框、时间与图标网格完美融合。
- **本地优先**：无需注册登录，所有配置（图标、布局、设置）均存储于浏览器 `localStorage`。
- **数据备份**：支持一键导出/导入 JSON 配置，数据只有你自己掌握。

---

## 🛠️ 技术栈 (Tech Stack)

* **Core**: [Vue 3](https://vuejs.org/) (Composition API)
* **Build**: [Vite](https://vitejs.dev/)
* **Language**: [TypeScript](https://www.typescriptlang.org/)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/)
* **State**: [Pinia](https://pinia.vuejs.org/)
* **Icons**: [Phosphor Icons](https://phosphoricons.com/)
* **Hooks**: [VueUse](https://vueuse.org/) (用于传感器、定位、时间等)
* **Utils**: [Lunar-javascript](https://github.com/6tail/lunar-javascript) (农历转换)

---

## 🚀 快速开始 (Getting Started)

如果你想在本地运行或进行二次开发，请按照以下步骤操作：

### 1. 克隆仓库

```bash
git clone [https://github.com/flycodeu/VoidTab.git](https://github.com/flycodeu/VoidTab.git)
cd voidtab
```

### 2. 安装依赖

```bash
npm install
```

### 3.启动开发服务器

```bash
npm run dev
 ```

浏览器访问 http://localhost:5173 即可看到效果。

### 4. 构建生产版本

```bash
npm run build
 ```

## 📂 项目结构
```
src/
├── assets/             # 静态资源
├── components/         # 组件库
│   ├── layout/         # 布局组件 (Sidebar, MainGrid, WidgetPanel)
│   ├── settings/       # 设置面板 (SettingsModal)
│   ├── ui/             # 基础 UI (Dialog, ContextMenu, Cursor)
│   └── widgets/        # 功能小组件 (Weather, GitHub, System, Search)
├── composables/        # 组合式函数 (Hooks)
├── stores/             # Pinia 状态管理 (ConfigStore)
├── App.vue             # 主入口
└── style.css           # 全局样式 & CSS 变量
```

## ❤️ 致谢
感谢 Google Gemini 提供强大的代码生成与重构支持。
感谢 Open-Meteo 提供免费且无需 Key 的天气 API 服务。