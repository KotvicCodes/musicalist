// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const { FusesPlugin } = require('@electron-forge/plugin-fuses')
const { FuseV1Options, FuseVersion } = require('@electron/fuses')

module.exports = {
     packagerConfig: {
          asar: true,
          icon: 'assets/icon',
          // Packager only signs the macOS bundle when osxSign is set. Without it the
          // only signature left on the app is the ad-hoc one the fuses plugin applies
          // partway through packaging, before the binaries are renamed and before the
          // Info.plist gets the app name, version and asar hash. That seal no longer
          // matches what ships, so macOS calls the download damaged and offers no way
          // past it. Signing here runs last, over the finished bundle. There is no
          // paid Apple certificate, so this is still ad-hoc: identity '-' with
          // validation off, which skips the keychain lookup that has nothing to find.
          osxSign: {
               identity: '-',
               identityValidation: false
          }
     },
     rebuildConfig: {},
     makers: [
          {
               name: '@electron-forge/maker-squirrel',
               config: {}
          },
          {
               // Also built for Windows and Linux so there is a portable option on every
               // platform, for anyone who would rather not run an installer or who is not
               // on a deb or rpm distribution.
               name: '@electron-forge/maker-zip',
               platforms: ['darwin', 'win32', 'linux']
          },
          {
               name: '@electron-forge/maker-deb',
               config: {}
          },
          {
               name: '@electron-forge/maker-rpm',
               config: {}
          }
     ],
     plugins: [
          {
               name: '@electron-forge/plugin-auto-unpack-natives',
               config: {}
          },
          // Fuses are used to enable/disable various Electron functionality
          // at package time, before code signing the application
          new FusesPlugin({
               version: FuseVersion.V1,
               [FuseV1Options.RunAsNode]: false,
               [FuseV1Options.EnableCookieEncryption]: true,
               [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
               [FuseV1Options.EnableNodeCliInspectArguments]: false,
               [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
               [FuseV1Options.OnlyLoadAppFromAsar]: true
          })
     ]
}
