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

    //! Separators
    // Splitting on commas alone turned every title that contains one into two
    // queries, and "Hey, Soul Sister" then returned two confident wrong matches
    // rather than one right one. So the separator is the user's choice, and the
    // default reads the text.
    const SEPARATORS = {
        newline: /\r?\n+/,
        comma: ',',
        semicolon: ';'
    }

    const AUTO = 'auto'

    // Auto takes newlines whenever the text has any, because one song per line
    // cannot be ambiguous, whereas a comma is as likely to be inside a title as
    // between two. A list that really is comma separated and merely wraps is
    // what the explicit choice is for.
    function detect(text) {
        return SEPARATORS.newline.test(text) ? 'newline' : 'comma'
    }

    // Someone writing one song per line often still puts a comma at the end of
    // each. That is punctuation between entries, not part of the last title.
    function trimEntry(entry, mode) {
        const trimmed = String(entry).trim()
        return mode === 'newline' ? trimmed.replace(/[,;]+$/, '').trim() : trimmed
    }

    //! Collect Songs From Textarea
    function textToArray(text, separator = AUTO) {
        const source = String(text ?? '').trim()
        if (source.length === 0) return []

        const mode = separator === AUTO || !SEPARATORS[separator] ? detect(source) : separator

        const entries = source
            .split(SEPARATORS[mode])
            .map((entry) => trimEntry(entry, mode))
            .filter((entry) => entry.length > 0)

        // remove duplicates
        return [...new Set(entries)]
    }

    //! Export
    // Loaded two ways: as a CommonJS module by the tests and the main
    // process, and as a plain script by the renderer, which has no require().
    const api = { escapeHtml, textToArray, SEPARATORS, AUTO }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api
    } else {
        window.MusicalistText = api
    }
})()
