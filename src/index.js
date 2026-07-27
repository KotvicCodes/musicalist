// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { lookupSongs } = require('./api/lookup.js')
const { toCsv, toJson } = require('./export.js')
const { isSafeExternalUrl } = require('./url.js')
const { describeFailure } = require('./failure.js')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

//! Logic

//* Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
    app.quit()
}

//* Create a browser window
const PAGE = path.join(__dirname, 'index.html')

const createWindow = () => {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // All three are Electron's defaults today. Pinned here so the app's
            // posture is a decision this file makes, rather than a property of
            // whichever Electron version happens to be installed.
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    // The CSP in index.html governs what the page may load. It does not govern
    // where the window may go, and neither of these paths is covered by it.
    // Nothing in the renderer opens a window or navigates today; this is the
    // same backstop the CSP comment describes for escaping, because either
    // route would hand a remote origin a window carrying the preload bridge.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const pageUrl = pathToFileURL(PAGE).href
    win.webContents.on('will-navigate', (event, url) => {
        if (url !== pageUrl) event.preventDefault()
    })

    // load index.html
    win.loadFile(PAGE)
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
// Only allow http(s) so a stray value can never launch arbitrary schemes. The
// predicate lives in its own module so it can be tested against the schemes it
// is supposed to refuse, which is not something reachable from here.
ipcMain.handle('open-external', async (event, url) => {
    if (isSafeExternalUrl(url)) {
        await shell.openExternal(url)
    }
})

//! Lookup Listener
// Both APIs are open, so there is nothing to configure and nothing to check
// before a run: the songs go straight out.
//
// The result is returned as an envelope rather than thrown, because Electron
// re-serialises anything a handler throws and the renderer would show the one
// sentence worth reading behind its own "Error invoking remote method" framing.
ipcMain.handle('run-lookup', async (event, { songs }) => {
    try {
        const rows = await lookupSongs(songs, {
            // stream each finished song back to the renderer as it is ready
            onProgress: (song) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('lookup-progress', song)
                }
            }
        })
        return { ok: true, rows }
    } catch (err) {
        return describeFailure(err)
    }
})

//! Export Results
ipcMain.handle('export-results', async (event, { rows, summary, format }) => {
    const isCsv = format === 'csv'
    const stamp = new Date().toISOString().slice(0, 10)

    const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `musicalist-${stamp}.${isCsv ? 'csv' : 'json'}`,
        filters: [isCsv ? { name: 'CSV', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }]
    })

    if (canceled || !filePath) return { saved: false }

    try {
        await fs.writeFile(filePath, isCsv ? toCsv(rows) : toJson(rows, summary), 'utf8')
    } catch (err) {
        // The reason, never the path: the user chose where this went and it may
        // sit somewhere they would rather not have on screen.
        return { saved: false, reason: err.code || 'the file could not be written' }
    }

    return { saved: true, fileName: path.basename(filePath) }
})
