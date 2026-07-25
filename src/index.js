//

//! Import
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const puppeteering = require('./musicalist.js')
const path = require('node:path')

//! Logic

//* Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
     app.quit()
}

//* Create a browser window
const createWindow = () => {
     const win = new BrowserWindow({
          width: 800,
          height: 600,
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

//! Puppeteer Listener
ipcMain.handle('run-puppeteer', async (event, { songs, initialDelay, keyDelay }) => {
     const result = await puppeteering(songs, initialDelay, keyDelay, {
          // stream each scraped song back to the renderer as it is finished
          onProgress: (song) => {
               if (!event.sender.isDestroyed()) {
                    event.sender.send('puppeteer-progress', song)
               }
          }
     })
     return result
})
