const { contextBridge, ipcRenderer } = require('electron');

// The renderer can only call named handlers defined in main.js. No arbitrary shell access.
contextBridge.exposeInMainWorld('api', {
  call: (name, args) => ipcRenderer.invoke('call', name, args),
  onSummon: (cb) => { if (typeof cb === 'function') ipcRenderer.on('summon', () => cb()); }, // Ctrl+Alt+Space: open Aurora with the command bar ready
  launcher: (name, args) => ipcRenderer.invoke('launcher', name, args),
  onLauncher: (cb) => { if (typeof cb === 'function') { ipcRenderer.on('launcher:show', () => cb('show')); ipcRenderer.on('launcher:hide', () => cb('hide')); } },
  onGoto: (cb) => { if (typeof cb === 'function') ipcRenderer.on('goto', (_e, p) => cb(p)); },
  platform: process.platform
});
