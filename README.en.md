# VoidTab

English | [简体中文](./README.md)

[![Version](https://img.shields.io/badge/version-1.0.4-0ea5e9)](./CHANGELOG.md)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Demo](https://img.shields.io/badge/Demo-flycode.icu-0ea5e9)](https://www.flycode.icu)

VoidTab is a browser new-tab extension built with Vue 3, TypeScript, and Manifest V3. It combines quick links, search, widgets, themes, terminal mode, and WebDAV sync into a lightweight cyberpunk dashboard.

![VoidTab preview](img/img_0.png)

## Documentation

- [简体中文 README](./README.md)
- [Changelog](./CHANGELOG.md)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voidtab-cyberpunk-dashb/apddbplmmpiiocfilhceiopjcjpkcbdj)
- [Releases](https://github.com/flycodeu/VoidTab/releases)

## Highlights

- **Immersive interface**: glassmorphism UI, light and dark themes, cyberpunk neon accents, remote images, Bing daily wallpaper, and local image or video backgrounds.
- **Quick-link management**: groups, drag-and-drop sorting, automatic site icons, bookmark HTML import, and a custom context menu.
- **Search hub**: built-in Google, Bing, Baidu, and custom search engines with search history.
- **Terminal mode**: switch between GUI and CLI-style workflows with command input, history, and autocomplete.
- **Widget ecosystem**: weather, calendar, countdown, Cron parser, GitHub Trending, stock ticker, system monitor, JWT, Base64, photo wall, mini games, and more.
- **Data sync**: WebDAV sync for settings, groups, sites, and preferences. Works with services such as Jianguoyun and Nextcloud.
- **AI assistant**: configurable AI chat panel with compatible API providers.

![VoidTab interface](img/img.png)

## Installation

### Install from Edge Add-ons

Search for `VoidTab` in Edge Add-ons, or open:

[VoidTab - Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voidtab-cyberpunk-dashb/apddbplmmpiiocfilhceiopjcjpkcbdj)

The store version is convenient and receives automatic updates, but release timing depends on store review.

### Install manually

1. Download the latest package from [Releases](https://github.com/flycodeu/VoidTab/releases).
2. Extract the package.
3. Open `chrome://extensions/` or `edge://extensions/`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the extracted `dist` directory.

### Build from source

```bash
git clone https://github.com/flycodeu/VoidTab.git
cd VoidTab
npm install
npm run build
```

The extension build is generated in `dist/`.

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` by default. Web mode is useful for UI development, but Chrome Extension APIs, Chrome Storage sync, and some cross-origin features must be verified in an extension runtime.

Common commands:

```bash
npm run test
npm run typecheck
npm run build:web
npm run build:ext
npm run build
```

## Project Structure

```text
src/
├── app/shell/                 # App shell, wallpaper layer, and brand elements
├── core/                      # Config, storage, sync, theme, and registries
├── features/                  # Feature modules
│   ├── ai/                    # AI chat panel
│   ├── context-menu/          # Custom global context menu
│   ├── home/                  # Home grid and site cards
│   ├── navigation/            # Sidebar, top actions, and mobile group nav
│   ├── settings/              # Settings modal and tabs
│   ├── terminal/              # Terminal mode component
│   └── widgets/               # Built-in widgets and widget marketplace
├── shared/                    # Shared UI, icons, composables, utilities, and types
└── stores/                    # Pinia stores
```

## Add a Widget

1. Create a widget folder under `src/features/widgets/builtins/`, for example `todo/`.
2. Add `TodoWidget.vue`, and optionally `TodoModal.vue` for configuration.
3. Register widget metadata in `src/core/registry/widgets.ts`.
4. Extend related config types, usually in `src/core/config/types.ts`.
5. Run `npm run test` and `npm run typecheck`.

## Tech Stack

- Vue 3 + Composition API
- TypeScript
- Vite 5
- Manifest V3
- Tailwind CSS
- Pinia
- IndexedDB
- Chrome Storage API
- WebDAV
- Phosphor Icons

## Privacy and Data

VoidTab stores settings locally by default. When WebDAV sync is enabled, settings are synced to the user-configured WebDAV service. Sensitive fields for AI, WebDAV, and runtime auth are protected before local storage, and sync payloads strip sensitive values. Third-party APIs are only used by the related enabled widgets.

## Credits

- Google Gemini and ChatGPT for code generation, refactoring, and documentation assistance.
- Open-Meteo for free weather data.
- Phosphor Icons for the icon set.

## License

VoidTab is released under the [MIT License](./LICENSE).
