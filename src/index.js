//

//! Import

const { app, BrowserWindow, ipcMain } = require('electron')
const puppeteering = require('./musicalist.js')
const path = require('node:path')


//! Logic

//* Handle creating/removing shortcuts on Windows when installing/uninstalling

if(require('electron-squirrel-startup')) {
     app.quit()
}


//* Create a browser window

const createWindow = () => {
     const win = new BrowserWindow({
          width: 800,
          height: 600,
          webPreferences: {
               preload: path.join(__dirname, 'preload.js'),
          },
     })
     // load index.html
     win.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
     createWindow()

     // reopens the window on macOS by clicking dock icon if none are open
     app.on('activate', () => {
          if(BrowserWindow.getAllWindows().length === 0) {
               createWindow()
          }
     })
})


//* Quit

app.on('window-all-closed', () => {
     if(process.platform !== 'darwin') {
          app.quit()
     }
})


//! Puppeteer Listener

ipcMain.handle('run-puppeteer', async (event, { data, data2, data3 }) => {
     const result = await puppeteering(data, data2, data3)
     return result
})