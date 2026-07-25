// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
     runLookup: (songs, market) => ipcRenderer.invoke('run-lookup', { songs, market }),
     // subscribe to per-song streaming updates; returns an unsubscribe function
     onProgress: (callback) => {
          const listener = (_event, song) => callback(song)
          ipcRenderer.on('lookup-progress', listener)
          return () => ipcRenderer.removeListener('lookup-progress', listener)
     },
     // credentials: the secret is write-only from the renderer's point of view
     getCredentials: () => ipcRenderer.invoke('get-credentials'),
     setCredentials: (clientId, clientSecret) =>
          ipcRenderer.invoke('set-credentials', { clientId, clientSecret }),
     clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
     // write the collected rows to a file the user picks
     exportResults: (rows, summary, format) =>
          ipcRenderer.invoke('export-results', { rows, summary, format }),
     // open a link in the user's default browser
     openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
