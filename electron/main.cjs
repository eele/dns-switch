const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;

// ── Enable remote debugging for E2E (must be before app ready) ──
if (process.env.DNS_SWITCH_E2E === "1") {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}

// The visible window content is 580×480; the BrowserWindow is enlarged by
// 24px per side (see --window-margin in src/theme.css) so the outer drop
// shadow of #root can render in the transparent margin without being
// clipped at the window boundary.
const WINDOW_MARGIN = 24;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 580 + WINDOW_MARGIN * 2,
    height: 480 + WINDOW_MARGIN * 2,
    minWidth: 420 + WINDOW_MARGIN * 2,
    minHeight: 360 + WINDOW_MARGIN * 2,
    frame: false,
    title: "DNS Switch",
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the built Svelte app (dist/ is always one level above electron/)
  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC handlers for window controls ─────────────────────────
ipcMain.handle("win:close", () => mainWindow?.close());
ipcMain.handle("win:minimize", () => mainWindow?.minimize());
ipcMain.handle("win:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
