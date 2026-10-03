const { contextBridge, ipcRenderer } = require('electron');
const methods = ['status', 'set-theme', 'setup', 'unlock', 'lock', 'list', 'save', 'delete', 'copy', 'test', 'enable-biometric', 'biometric-unlock', 'disable-biometric'];
const api = Object.fromEntries(methods.map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), (...args) => ipcRenderer.invoke(name, ...args)]));
api.onLocked = callback => { const listener = () => callback(); ipcRenderer.on('vault-locked', listener); return () => ipcRenderer.removeListener('vault-locked', listener); };
contextBridge.exposeInMainWorld('vault', api);
