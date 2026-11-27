// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { ElectronAPI, SongRow } from './types.js'

const api: ElectronAPI = {
    runLookup: (songs) => ipcRenderer.invoke('run-lookup', { songs }),
    // stop the run in progress; the rows already collected are kept
    cancelLookup: () => ipcRenderer.invoke('cancel-lookup'),
    // subscribe to per-song streaming updates; returns an unsubscribe function
    onProgress: (callback) => {
        const listener = (_event: IpcRendererEvent, song: SongRow) => callback(song)
        ipcRenderer.on('lookup-progress', listener)
        return () => ipcRenderer.removeListener('lookup-progress', listener)
    },
    // write the collected rows to a file the user picks
    exportResults: (rows, summary, format) =>
        ipcRenderer.invoke('export-results', { rows, summary, format }),
    // open a link in the user's default browser
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
}

contextBridge.exposeInMainWorld('electronAPI', api)
