# Security Policy

Musicalist is a desktop app that reads a list of songs, asks four public APIs about them, and writes the answers to a file you choose. It has no accounts, no API keys, no server of its own and no telemetry, so the interesting security questions are about the app on your machine rather than about a service.

## Reporting a vulnerability

Report privately through GitHub, using [the advisory form](https://github.com/KotvicCodes/musicalist/security/advisories/new). That keeps the report between you and the maintainer until there is a fix. Please do not open a public issue, a pull request or a discussion for a security problem, because either one publishes the details before anyone can act on them.

If the form is unavailable, say so in a public issue without any detail of the problem itself, and a private channel will be arranged.

A useful report says which version you tested and on which system, what an attacker gets out of it, and enough steps to reproduce it. A proof of concept is welcome but not required; a clear description of the path is worth more than a working exploit.

This is a one-person project, so there is no rota and no guaranteed clock. Expect an acknowledgement within a week. Once a report is confirmed, the fix ships in the next release, and the advisory is published with credit to you unless you would rather stay anonymous. Please give that fix a chance to reach people before writing publicly about the issue.

## Supported versions

| Version                                                                         | Supported |
| ------------------------------------------------------------------------------- | --------- |
| The [latest release](https://github.com/KotvicCodes/musicalist/releases/latest) | Yes       |
| Anything older                                                                  | No        |

Fixes go into a new release rather than being backported. Musicalist follows [Semantic Versioning](https://semver.org), and every release is built from a tag by [the build workflow](.github/workflows/build.yml), so updating means downloading the newest package for your system.

## What the app already does

Worth knowing before you report, and worth checking if you are reviewing the code:

- The renderer runs with `contextIsolation` on, `nodeIntegration` off and `sandbox` on, pinned in [src/index.js](src/index.js) rather than left to whichever Electron version is installed. Everything it can ask the main process to do goes through the small bridge in [src/preload.js](src/preload.js).
- The page carries a strict Content Security Policy: scripts and styles from itself only, `connect-src 'none'`, no objects, no frames, no base URI and no form action. Every network call is made by the main process, not the page.
- Window opening is denied outright, and navigation away from the bundled page is blocked, so no remote origin can end up holding a window that carries the preload bridge.
- Links open in your own browser only after the URL is parsed and its scheme checked against an allowlist of `http:` and `https:`, in [src/url.js](src/url.js), so a stray value cannot launch an arbitrary protocol handler.
- Electron fuses in [forge.config.js](forge.config.js) disable `RunAsNode`, the `NODE_OPTIONS` variable and the CLI inspect arguments, enable cookie encryption, require the app to load from the asar, and validate its integrity.
- Nothing you type is stored, logged or sent anywhere except to the four APIs the README names, and export writes only to the path you pick in the save dialog.

## Scope

In scope: anything that lets code or data from outside the app reach your machine or your files. Escapes from the renderer into the main process, abuse of the IPC handlers, a path where an API response leads to code execution or to a file being written somewhere you did not choose, and a way past the link allowlist or the navigation blocks.

Out of scope, and already known:

- **The builds are not code signed.** macOS and Windows both warn on first launch, which the README explains at length. Signing needs paid Apple and Windows certificates. The hardened runtime is off for the same reason, since it is only worth having as a prerequisite for notarisation and would otherwise stop the app from launching at all.
- **Problems in Deezer, MusicBrainz, AcousticBrainz, ListenBrainz or the Cover Art Archive.** Report those to the project concerned. What is in scope here is how Musicalist handles what they return.
- **Rate limits and how long a run takes.** Deliberate, and described in the README.
- **Wrong or missing metadata.** A matching problem, not a security one; open an ordinary issue.
- **Anything that needs an attacker who already runs code as you**, or that depends on running modified source.
