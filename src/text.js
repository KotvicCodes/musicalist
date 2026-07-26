// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Scope
// Wrapped so nothing leaks into the renderer's shared global scope, where it
// would collide with the names the renderer imports from this namespace.
;(function () {
    //! Escape Text Before Injecting As HTML
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    //! Collect Songs From Textarea
    function textToArray(text) {
        let array = []
        text = String(text ?? '').trim()

        if (text.length === 0) {
            return array
        }
        const lines = text.split(',')
        array = lines.map((line) => line.trim()).filter((line) => line.length > 0)
        // remove duplicates
        array = [...new Set(array)]

        return array
    }

    //! Export
    // Loaded two ways: as a CommonJS module by the tests and the main
    // process, and as a plain script by the renderer, which has no require().
    const api = { escapeHtml, textToArray }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api
    } else {
        window.MusicalistText = api
    }
})()
