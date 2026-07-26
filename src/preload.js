// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
     runLookup: (songs) => ipcRenderer.invoke('run-lookup', { songs }),
     // subscribe to per-song streaming updates; returns an unsubscribe function
     onProgress: (callback) => {
          const listener = (_event, song) => callback(song)
          ipcRenderer.on('lookup-progress', listener)
          return () => ipcRenderer.removeListener('lookup-progress', listener)
     },
     // write the collected rows to a file the user picks
     exportResults: (rows, summary, format) =>
          ipcRenderer.invoke('export-results', { rows, summary, format }),
     // open a link in the user's default browser
     openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
