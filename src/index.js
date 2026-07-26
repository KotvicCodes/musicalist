// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { lookupSongs } = require('./api/lookup.js')
const credentials = require('./credentials.js')
const { toCsv, toJson } = require('./export.js')
const fs = require('node:fs/promises')
const path = require('node:path')

//! Logic

//* Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
     app.quit()
}

//* Create a browser window
const createWindow = () => {
     const win = new BrowserWindow({
          width: 900,
          height: 700,
          webPreferences: {
               preload: path.join(__dirname, 'preload.js')
          }
     })
     // load index.html
     win.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
     createWindow()

     // reopens the window on macOS by clicking dock icon if none are open
     app.on('activate', () => {
          if (BrowserWindow.getAllWindows().length === 0) {
               createWindow()
          }
     })
})

//* Quit
app.on('window-all-closed', () => {
     if (process.platform !== 'darwin') {
          app.quit()
     }
})

//! Open External Links
// Only allow http(s) so a stray value can never launch arbitrary schemes.
ipcMain.handle('open-external', async (event, url) => {
     if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
          await shell.openExternal(url)
     }
})

//! Credentials
// The secret never travels back to the renderer, only whether one is stored.
ipcMain.handle('get-credentials', async () => credentials.describe())

ipcMain.handle('set-credentials', async (event, { clientId, clientSecret }) => {
     const result = credentials.save({ clientId, clientSecret })
     return { ...result, ...credentials.describe() }
})

ipcMain.handle('clear-credentials', async () => {
     credentials.clear()
     return credentials.describe()
})

//! Lookup Listener
ipcMain.handle('run-lookup', async (event, { songs, market }) => {
     const stored = credentials.load()
     if (!stored) {
          throw new Error('Add your Spotify Client ID and Secret in Advanced settings first.')
     }

     return lookupSongs(songs, {
          clientId: stored.clientId,
          clientSecret: stored.clientSecret,
          market,
          // stream each finished song back to the renderer as it is ready
          onProgress: (song) => {
               if (!event.sender.isDestroyed()) {
                    event.sender.send('lookup-progress', song)
               }
          }
     })
})

//! Export Results
ipcMain.handle('export-results', async (event, { rows, summary, format }) => {
     const isCsv = format === 'csv'
     const stamp = new Date().toISOString().slice(0, 10)

     const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath: `musicalist-${stamp}.${isCsv ? 'csv' : 'json'}`,
          filters: [
               isCsv ? { name: 'CSV', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }
          ]
     })

     if (canceled || !filePath) return { saved: false }

     await fs.writeFile(filePath, isCsv ? toCsv(rows) : toJson(rows, summary), 'utf8')
     return { saved: true, fileName: path.basename(filePath) }
})
