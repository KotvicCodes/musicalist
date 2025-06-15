// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
     runPuppeteer: (data, data2, data3) => ipcRenderer.invoke('run-puppeteer', { data, data2, data3 })
})