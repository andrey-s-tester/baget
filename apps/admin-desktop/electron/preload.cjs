const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yanakDesktop", {
  loadConfig: () => ipcRenderer.invoke("yanak:config-load"),
  saveConfig: (cfg) => ipcRenderer.invoke("yanak:config-save", cfg),
  getAppVersion: () => ipcRenderer.invoke("yanak:app-version"),
  getUiMode: () => ipcRenderer.invoke("yanak:ui-mode"),
  copyToClipboard: (text) => ipcRenderer.invoke("yanak:clipboard-write", String(text ?? ""))
});
