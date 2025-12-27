# 🛠️ VoidTab 技术架构与实现指南

本文档深入解析 VoidTab 的核心技术实现，包括浏览器扩展的构建原理、WebDAV 同步机制的设计以及底层存储的抽象逻辑。旨在帮助开发者理解如何进行二次开发以及如何将其部署为
Chrome/Edge 扩展。

---

## 1. 浏览器扩展架构 (Browser Extension Architecture)

VoidTab 基于 **Manifest V3** 规范构建，这是 Chrome 和 Edge 扩展目前的通用标准。这意味着同一套代码构建出的产物，可以同时被这两个主流浏览器加载。

### 1.1 核心机制：New Tab 接管

在 `manifest.json` 中，我们声明了 `chrome_url_overrides` 权限，以接管浏览器的新标签页。这是插件的核心入口。

```json
{
  "manifest_version": 3,
  "name": "VoidTab",
  "version": "1.0.0",
  "chrome_url_overrides": {
    "newtab": "index.html"
  },
  "permissions": [
    "storage",
    "unlimitedStorage"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

- index.html: 这是扩展的入口文件。当用户打开新标签页时，浏览器实际上加载的是插件包内的这个 HTML 文件。
- Permissions:
    - storage: 用于调用 chrome.storage.local API 存储用户配置。
    - unlimitedStorage: 防止配置数据（如Base64图片壁纸）超过 5MB 限制。
    - host_permissions: 允许插件跨域请求（如获取天气、GitHub API、WebDAV 同步）。

### 1.2 构建流程 (Vite Build)

项目使用 Vite 进行构建。与普通 SPA 应用不同，扩展需要输出为静态文件目录。

- 开发模式 (npm run dev): 启动本地 Server，用于快速 UI 调试（此时无法调用 Chrome 特有 API）。

- 生产构建 (npm run build):
    - Vite 将 Vue 组件、TS 代码编译为原生 JS/CSS。
    - 自动复制 manifest.json 和图标资源到 dist 目录。
    - 产物: dist 文件夹即为“已解压的扩展程序”。

### 1.3 如何加载到浏览器 (Edge / Chrome)

1. 执行 npm run build 生成 dist 目录。

2. 打开浏览器扩展管理页（chrome://extensions 或 edge://extensions）。

3. 开启 开发者模式。

4. 点击 加载已解压的扩展程序，选择本项目的 dist 文件夹即可。

## 2. WebDAV 数据同步引擎 (Sync Engine)

VoidTab 不依赖任何第三方私有后端，而是利用标准的 WebDAV 协议 实现数据同步。这使得用户可以使用坚果云、Nextcloud、NAS 等任何支持
WebDAV 的服务。

### 2.1 架构设计

同步逻辑位于 src/core/sync 模块，采用了 无状态传输 (Stateless Transport) 设计。

- Provider: 定义了 upload 和 download 接口。

- Adapter: webdav.ts 实现了具体的 WebDAV 协议通信。

### 2.2 通信协议细节

我们使用原生 fetch API 直接与 WebDAV 服务器通信，无需引入沉重的 XML 解析库。

认证 (Authentication): 使用 HTTP Basic Auth。用户的 username 和 password 被转换为 Base64 字符串放入 Header：

```
TypeScript
headers: {
    'Authorization': `Basic ${btoa(username + ':' + password)}`,
    'Content-Type': 'application/json'
}
```

关键操作流程:

- 检查连接 (PROPFIND):

    - 向目标目录发送 PROPFIND 请求（Depth: 0）。
    - 如果返回 200 或 207 (Multi-Status)，说明连接成功且目录存在。

- 上传备份 (PUT):
    - 将 Pinia Store 中的 config 对象序列化为 JSON 字符串。
    - 发送 PUT 请求到 https://dav.server.com/folder/filename.json。
    - 策略: 采用“最后写入优先” (Last Write Wins) 策略，直接覆盖云端文件。

- 恢复备份 (GET):
    - 发送 GET 请求获取 JSON 文本。
    - 执行 JSON.parse 并通过 migrateConfig 函数处理版本迁移（兼容旧版数据结构）。
    - 通过 store.$patch 全量替换本地状态。

## 3. 存储适配器模式 (Storage Adapter Pattern)

为了支持在浏览器插件环境和普通网页环境（开发调试）下无缝切换，我们实现了一层存储抽象适配器。

代码位置: src/core/storage/

### 3.1 抽象接口

```TypeScript

export interface StorageAdapter {
    get<T>(key: string): Promise<T | null>;

    set<T>(key: string, value: T): Promise<void>;

    remove(key: string): Promise<void>;
}
```

### 3.2 两种实现

ChromeAdapter: 生产环境使用。

- 调用 chrome.storage.local.get/set。

- 优势: 异步读写，容量大，浏览器关闭后数据依然持久化，且支持跨设备同步（如果使用 storage.sync）。

WebAdapter: 开发环境使用。

- 调用 localStorage.getItem/setItem。

- 优势: 模拟异步 Promise 返回，确保业务层代码无需修改即可在 localhost 运行。

### 3.3 自动注入

在应用初始化时 (src/core/storage/index.ts)，会自动检测 chrome.storage 是否存在，从而决定使用哪个适配器：

```ts
const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;
export const storage = isExtension ? new ChromeAdapter() : new WebAdapter();
```

## 4. 样式与主题系统 (Theming System)

### 4.1 Tailwind CSS 架构

项目大量使用 Tailwind CSS 的 Utility Classes，但为了实现动态主题，我们将核心颜色抽离为 CSS 变量：

```CSS

/* src/style.css */
:root {
    --glass-bg: rgba(255, 255, 255, 0.1);
    --glass-border: rgba(255, 255, 255, 0.2);
    --text-primary: #ffffff;
}

:root.light {
    --glass-bg: rgba(0, 0, 0, 0.05);
    --text-primary: #1a1a1a;
}
```

### 4.2 毛玻璃实现 (Glassmorphism)

核心类名为 .apple-glass 或直接使用 Utility 组合：

```HTML

<div class="backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl">
```

这种组合利用了 CSS 3 的 backdrop-filter 属性，实现了高性能的背景模糊效果。

## 5. 安全性考量 (Security)
   - 数据隐私: 所有数据（包括 WebDAV 密码）仅存储在用户浏览器的 chrome.storage.local 中，绝不上传至任何第三方统计服务器。 
   - Content Security Policy (CSP): 扩展遵循严格的 CSP 策略，禁止 eval() 和远程脚本加载，确保用户安全。 
   - 应用专用密码: 在 WebDAV 设置指引中，我们强制建议用户使用“应用专用密码”而非账号主密码，以限制权限范围。

## 6. 二次开发建议
   如果你想为 VoidTab 贡献代码：

- 添加搜索引擎: 修改 src/core/config/default.ts 中的 searchEngines 数组即可。

- 添加新组件:

  - 在 src/components/widgets 开发 Vue 组件。 
  - 在 src/components/layout/WidgetPanel.vue 中注册。 

- 调试同步: 建议在 src/core/sync/providers/webdav.ts 中的 fetch 请求处添加 console.log，配合 Network 面板观察
Request/Response。