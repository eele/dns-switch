const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  windowClose: () => ipcRenderer.invoke("win:close"),
  windowMinimize: () => ipcRenderer.invoke("win:minimize"),
  windowMaximize: () => ipcRenderer.invoke("win:maximize"),
});
