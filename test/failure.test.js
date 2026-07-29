// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { describeFailure, FALLBACK } = require('../src/failure.js')
const { DeezerError } = require('../src/api/deezer.js')

//! Passed Through
test('keeps the message the API client wrote', () => {
    const err = new DeezerError('Could not reach Deezer. Check your internet connection.', {
        kind: 'network'
    })

    assert.deepEqual(describeFailure(err), {
        ok: false,
        kind: 'network',
        message: 'Could not reach Deezer. Check your internet connection.'
    })
})

test('carries the kind so the renderer can tell the cases apart', () => {
    assert.equal(describeFailure(new DeezerError('Slow.', { kind: 'timeout' })).kind, 'timeout')
    assert.equal(describeFailure(new DeezerError('Easy.', { kind: 'rate-limit' })).kind, 'rate-limit')
})

//! Replaced
// A message this app did not write could carry a path, a response fragment or
// some other internal, none of which belongs on screen.
test('replaces the message of a failure the app did not raise', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'title')")

    assert.deepEqual(describeFailure(bug), { ok: false, kind: 'unknown', message: FALLBACK })
})

test('replaces an http failure, which names a status the user cannot act on', () => {
    const http = new DeezerError('Deezer returned 503.', { status: 503 })

    assert.equal(describeFailure(http).kind, 'unknown')
    assert.equal(describeFailure(http).message, FALLBACK)
})

test('survives being handed something that is not an error at all', () => {
    for (const value of [null, undefined, 'boom', 42, {}, { kind: 'network' }]) {
        const described = describeFailure(value)

        assert.equal(described.ok, false)
        assert.equal(described.message, FALLBACK)
    }
})
