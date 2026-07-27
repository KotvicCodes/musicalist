// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { popularity, extractCounts, BATCH_SIZE } = require('../src/api/listenbrainz.js')
const { response, stubFetch } = require('./helpers.js')

//! Extraction
test('keys the counts by recording id', () => {
    const counts = extractCounts([
        { recording_mbid: 'rec-1', total_listen_count: 91_204, total_user_count: 3812 },
        { recording_mbid: 'rec-2', total_listen_count: 12, total_user_count: 4 }
    ])

    assert.deepEqual(counts.get('rec-1'), { listenCount: 91_204, listenerCount: 3812 })
    assert.equal(counts.get('rec-2').listenCount, 12)
})

test('keeps a genuine zero, which is not the same as no answer', () => {
    // nobody has submitted a listen is a real result; absent from the response
    // entirely is the gap
    const counts = extractCounts([
        { recording_mbid: 'rec-1', total_listen_count: 0, total_user_count: 0 }
    ])

    assert.equal(counts.get('rec-1').listenCount, 0)
    assert.equal(counts.get('rec-3'), undefined)
})

test('ignores malformed entries rather than throwing', () => {
    assert.equal(extractCounts(null).size, 0)
    assert.equal(extractCounts({}).size, 0)
    assert.equal(extractCounts([null, {}, { recording_mbid: 42 }]).size, 0)
})

//! Batching
test('asks for the whole list in one request', async (t) => {
    const fetch = stubFetch(() =>
        response([{ recording_mbid: 'rec-1', total_listen_count: 5, total_user_count: 2 }])
    )
    t.after(fetch.restore)

    await popularity(['rec-1', 'rec-2', 'rec-3'])

    // the point of this endpoint: one call for the run, not one per song
    assert.equal(fetch.calls.length, 1)

    const sent = JSON.parse(fetch.calls[0].options.body)
    assert.deepEqual(sent.recording_mbids, ['rec-1', 'rec-2', 'rec-3'])
    assert.equal(fetch.calls[0].options.method, 'POST')
})

test('deduplicates ids and drops the empty ones', async (t) => {
    const fetch = stubFetch(() => response([]))
    t.after(fetch.restore)

    await popularity(['rec-1', 'rec-1', null, undefined, 'rec-2'])
    const sent = JSON.parse(fetch.calls[0].options.body)

    assert.deepEqual(sent.recording_mbids, ['rec-1', 'rec-2'])
})

test('splits a list longer than one batch', async (t) => {
    const fetch = stubFetch(() => response([]))
    t.after(fetch.restore)

    const ids = Array.from({ length: BATCH_SIZE + 1 }, (_value, index) => `rec-${index}`)
    await popularity(ids)

    assert.equal(fetch.calls.length, 2)
    assert.equal(JSON.parse(fetch.calls[1].options.body).recording_mbids.length, 1)
})

test('makes no request at all for a run with no recording ids', async (t) => {
    const fetch = stubFetch(() => response([]))
    t.after(fetch.restore)

    assert.equal((await popularity([])).size, 0)
    assert.equal((await popularity(null)).size, 0)
    assert.equal(fetch.calls.length, 0)
})

//! Failures
// Popularity sits on top of a row that is already complete, so nothing here is
// allowed to cost the run.
test('an outage costs the counts, not the songs', async (t) => {
    const fetch = stubFetch(() => {
        throw new Error('ECONNRESET')
    })
    t.after(fetch.restore)

    assert.equal((await popularity(['rec-1'])).size, 0)
})

test('an HTTP failure costs the counts, not the songs', async (t) => {
    const fetch = stubFetch(() => response({}, { status: 503 }))
    t.after(fetch.restore)

    assert.equal((await popularity(['rec-1'])).size, 0)
})

test('sends a deadline with the request', async (t) => {
    const fetch = stubFetch(() => response([]))
    t.after(fetch.restore)

    await popularity(['rec-1'])

    assert.ok(fetch.calls[0].options.signal instanceof AbortSignal)
})

test('stops batching once the run is stopped', async (t) => {
    const controller = new AbortController()
    const fetch = stubFetch(() => {
        controller.abort()
        return response([])
    })
    t.after(fetch.restore)

    const ids = Array.from({ length: BATCH_SIZE * 3 }, (_value, index) => `rec-${index}`)
    await popularity(ids, controller.signal)

    assert.equal(fetch.calls.length, 1)
})
