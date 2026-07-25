//

//! Import
const { app, safeStorage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

//! Constants
const FILE_NAME = 'credentials.bin'

//! Session Fallback
// Used when the OS keychain is unavailable. Credentials then live for the
// lifetime of the process only; they are never written to disk in the clear.
let sessionOnly = null

function filePath() {
     return path.join(app.getPath('userData'), FILE_NAME)
}

//! Environment
// A dev convenience so the app can run without touching the settings pane.
function fromEnvironment() {
     const clientId = process.env.SPOTIFY_CLIENT_ID
     const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
     if (!clientId || !clientSecret) return null
     return { clientId, clientSecret, source: 'environment' }
}

//! Load
function load() {
     const fromEnv = fromEnvironment()
     if (fromEnv) return fromEnv

     if (sessionOnly) return { ...sessionOnly, source: 'session' }

     try {
          if (!fs.existsSync(filePath())) return null
          if (!safeStorage.isEncryptionAvailable()) return null

          const decrypted = safeStorage.decryptString(fs.readFileSync(filePath()))
          const parsed = JSON.parse(decrypted)
          if (!parsed.clientId || !parsed.clientSecret) return null

          return { clientId: parsed.clientId, clientSecret: parsed.clientSecret, source: 'file' }
     } catch {
          // A corrupt or undecryptable file is treated as no credentials at all.
          return null
     }
}

//! Save
// Returns how the credentials were stored so the UI can warn when they will not
// survive a restart, rather than silently degrading to plaintext.
function save({ clientId, clientSecret }) {
     if (!clientId || !clientSecret) {
          throw new Error('Both a Client ID and a Client Secret are required.')
     }

     if (!safeStorage.isEncryptionAvailable()) {
          sessionOnly = { clientId, clientSecret }
          return { persisted: false }
     }

     const payload = JSON.stringify({ clientId, clientSecret })
     fs.writeFileSync(filePath(), safeStorage.encryptString(payload))
     sessionOnly = null
     return { persisted: true }
}

//! Clear
function clear() {
     sessionOnly = null
     try {
          if (fs.existsSync(filePath())) fs.unlinkSync(filePath())
     } catch {
          // nothing to do; the file is already unreadable or gone
     }
}

//! Describe
// What the renderer is allowed to know. The secret itself never crosses the
// bridge, only the fact that one is on file.
function describe() {
     const current = load()
     if (!current) return { clientId: '', hasSecret: false, source: null }
     return { clientId: current.clientId, hasSecret: true, source: current.source }
}

//! Export
module.exports = { load, save, clear, describe }
