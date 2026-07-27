// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Reportable Failures
// Anything thrown out of an ipcMain handler is re-serialised by Electron, and
// the renderer's rejection arrives prefixed with "Error invoking remote method
// 'run-lookup':". That buries the one sentence the user can act on behind
// framing they cannot. Handlers return this shape instead of throwing, so the
// message the API client wrote is the message that reaches the screen.
//
// Only kinds this app raises itself are passed through verbatim. Anything else
// is a bug rather than a condition the user can do something about, and its
// message could carry internals, paths or response fragments that have no
// business in the UI.
const REPORTABLE = new Set(['network', 'rate-limit', 'timeout'])

const FALLBACK = 'Something went wrong during the lookup.'

function describeFailure(err) {
    if (err && REPORTABLE.has(err.kind) && typeof err.message === 'string' && err.message) {
        return { ok: false, kind: err.kind, message: err.message }
    }
    return { ok: false, kind: 'unknown', message: FALLBACK }
}

//! Export
module.exports = { describeFailure, REPORTABLE, FALLBACK }
