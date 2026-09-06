# DNS Switch

跨平台 DNS 切换工具 — 切换不同网络适配器的 DNS 服务器，无需打开系统设置。

![screenshot](docs/screenshot.png)

## 功能特性

- **跨平台**：Windows / macOS / Linux（Windows 为主力开发平台）
- **快速切换**：预设 DNS 分组（AliDNS / Google DNS / DNSPod），一键切换或恢复 DHCP
- **管理预设**：支持添加 / 编辑 / 删除自定义 DNS 分组
- **查看当前 DNS**：实时显示各适配器的 DNS 服务器地址
- **原生应用体验**：基于 Tauri 2，窗口小、内存占用低、启动快
- **自定义标题栏**：无边框窗口 + 自定义圆角和阴影（Windows 10/11 渲染一致）

## 项目结构

```
dns_switch/
├── src/                    # Svelte 5 前端
│   ├── main.ts
│   ├── App.svelte
│   ├── theme.css
│   ├── api.ts              # Tauri invoke 封装
│   └── components/
│       ├── TitleBar.svelte
│       ├── DnsRow.svelte
│       ├── ContextMenu.svelte
│       └── ConfirmDialog.svelte
├── src-tauri/              # Tauri 2 后端（Rust）
│   ├── src/
│   │   ├── main.rs         # 入口 + DWM 圆角禁用
│   │   └── commands.rs     # DNS 命令（调用 PowerShell）
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── icons/
├── tests/
│   └── e2e/                # Playwright E2E 测试
├── scripts/
│   └── generate-icon.mjs   # 图标生成脚本
├── index.html
├── package.json
└── vite.config.ts
```

## 开发

### 前置要求

- Node.js ≥ 18
- Rust（stable，Windows 需 MSVC Build Tools）
- Tauri 2 系统依赖：
  - **Windows**: WebView2 Runtime（Win10/11 默认自带）
  - **macOS**: Xcode CLT
  - **Linux**: `libgtk-3-dev`, `libwebkit2gtk-4.0-dev` 等（见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/)）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npx tauri dev
```

会同时启动 Vite 开发服务器（HMR）和 Tauri 窗口。

### 构建发布包

```bash
npx tauri build
```

产物在 `src-tauri/target/release/bundle/` 下（MSI / NSIS / AppImage / deb 等）。

### 仅构建前端

```bash
npm run build       # 输出到 dist/
npm run dev         # Vite 开发服务器（纯浏览器，使用 mock 数据）
```

## 测试

### Playwright E2E（纯浏览器模式）

```bash
npx playwright install chromium
npm run test:e2e
```

前端在非 Tauri 环境（纯浏览器）下使用 mock 数据，所有交互逻辑可完整测试。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | [Tauri 2](https://tauri.app) |
| 前端 | Svelte 5 (runes) + TypeScript |
| 构建 | Vite 5 |
| 后端 | Rust（调用系统 DNS 命令） |
| 窗口 | 无边框 + CSS 圆角/阴影（Win10/11 一致） |

## Windows 圆角/阴影一致性方案

Windows 11 的 DWM 会对所有窗口自动应用圆角（`DWMWCP_ROUND`），而 Windows 10 没有此行为。
为保证两个系统上窗口外观完全一致：

1. `tauri.conf.json` 中设置 `decorations: false` + `transparent: true` + `shadow: false`
   → 去掉系统标题栏、系统阴影、系统圆角
2. Rust 侧调用 `DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND)`
   → 显式禁用 Win11 DWM 圆角（Win10 上该调用静默失败，无副作用）
3. 前端 CSS 统一提供 `border-radius: 8px` + `box-shadow`
   → 圆角和阴影完全由 CSS 控制，两个系统渲染一致
