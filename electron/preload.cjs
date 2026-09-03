const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  windowClose: () => ipcRenderer.invoke("win:close"),
  windowMinimize: () => ipcRenderer.invoke("win:minimize"),
  windowMaximize: () => ipcRenderer.invoke("win:maximize"),
  listAdapters: () => ipcRenderer.invoke("list_adapters"),
  getCurrentDns: (adapterIndex) => ipcRenderer.invoke("get_current_dns", adapterIndex),
  setDns: (adapterIndex, servers) => ipcRenderer.invoke("set_dns", adapterIndex, servers),
  resetDnsToDhcp: (adapterIndex) => ipcRenderer.invoke("reset_dns_to_dhcp", adapterIndex),
});
