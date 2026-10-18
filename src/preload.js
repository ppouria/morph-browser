const { contextBridge, ipcRenderer } = require('electron');

// The renderer only sees these functions. It has no direct access to Node or Electron.
contextBridge.exposeInMainWorld('api', {
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (input) => ipcRenderer.invoke('profiles:save', input),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  launchProfile: (id) => ipcRenderer.invoke('profiles:launch', id),
  stopProfile: (id) => ipcRenderer.invoke('profiles:stop', id),
  listProxies: () => ipcRenderer.invoke('proxies:list'),
  saveProxy: (input) => ipcRenderer.invoke('proxies:save', input),
  deleteProxy: (id) => ipcRenderer.invoke('proxies:delete', id),
  listMajors: () => ipcRenderer.invoke('browsers:majors'),
  listBrowserVersions: () => ipcRenderer.invoke('browsers:versions'),
  listInstalledBuilds: () => ipcRenderer.invoke('browsers:installed'),
  removeBuild: (version) => ipcRenderer.invoke('browsers:remove', version),
  parseProxy: (text, defaultType) => ipcRenderer.invoke('proxy:parse', text, defaultType),
  checkProxy: (proxy) => ipcRenderer.invoke('proxy:check', proxy),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onChange: (callback) => ipcRenderer.on('profiles:changed', () => callback()),
  onBrowserProgress: (callback) => ipcRenderer.on('browsers:progress', (_e, progress) => callback(progress)),
});
