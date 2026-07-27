// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Scope
// Plain CommonJS rather than the dual export the renderer's modules use: only
// the main process needs this, and the renderer has no business deciding what
// counts as safe to hand the operating system.

//! External Links
// shell.openExternal passes the URL straight to the OS, which will launch
// whatever is registered for the scheme: a mail client, a file manager, a
// protocol handler installed by some other application. Only the two schemes a
// Help link can legitimately need get through.
//
// Parsing rather than pattern matching is the point. A regex anchored on
// `https?://` still lets `https:/\/` and a scheme-relative `//example.com`
// through on some parsers, and says nothing about what the rest of the string
// is; the URL parser answers the actual question, which is what scheme the
// system would end up dispatching on.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function isSafeExternalUrl(value) {
    if (typeof value !== 'string') return false

    let parsed
    try {
        // No base, so anything without its own scheme is rejected rather than
        // quietly resolved against the app's own file:// origin.
        parsed = new URL(value)
    } catch {
        return false
    }

    return ALLOWED_PROTOCOLS.has(parsed.protocol)
}

//! Export
module.exports = { isSafeExternalUrl }
