// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
     runPuppeteer: (songs, initialDelay, keyDelay) =>
          ipcRenderer.invoke('run-puppeteer', { songs, initialDelay, keyDelay }),
     // subscribe to per-song streaming updates; returns an unsubscribe function
     onProgress: (callback) => {
          const listener = (_event, song) => callback(song)
          ipcRenderer.on('puppeteer-progress', listener)
          return () => ipcRenderer.removeListener('puppeteer-progress', listener)
     },
     // open a link in the user's default browser
     openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
