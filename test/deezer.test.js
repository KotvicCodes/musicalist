// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { createClient, mapTrack, request, DeezerError } = require('../src/api/deezer.js')
const {
    response,
    stubFetch,
    stubHangingFetch,
    deezerHit,
    deezerTrack,
    deezerAlbum
} = require('./helpers.js')

//! Helpers
// Routes the three endpoints a single search touches. Any of them can be told
// to answer with something other than the happy path.
function stubDeezer({ hits, track, album, error } = {}) {
    return stubFetch((url) => {
        if (error) return response(error)
        if (url.includes('/search')) {
            return response({ data: hits === undefined ? [deezerHit()] : hits })
        }
        if (url.includes('/track/')) return response(track === undefined ? deezerTrack() : track)
        return response(album === undefined ? deezerAlbum() : album)
    })
}

//! Mapping
test('maps a full track', () => {
    const mapped = mapTrack(deezerTrack(), deezerAlbum())

    assert.equal(mapped.title, 'Bohemian Rhapsody')
    assert.equal(mapped.author, 'Queen')
    assert.equal(mapped.album, 'A Night at the Opera')
    assert.equal(mapped.albumType, 'album')
    assert.equal(mapped.albumTotalTracks, 12)
    assert.deepEqual(mapped.releaseDate, ['2011-01-01'])
    assert.equal(mapped.releaseDatePrecision, 'day')
    assert.equal(mapped.isrc, 'GBUM71029604')
    assert.equal(mapped.bpm, 143.9)
    assert.equal(mapped.trackNumber, 11)
    assert.equal(mapped.discNumber, 1)
    assert.equal(mapped.explicit, false)
    assert.equal(mapped.deezerUrl, 'https://www.deezer.com/track/42')
    assert.deepEqual(mapped.deezerGenres, ['Rock'])
    assert.equal(mapped.coverArt, 'https://img/big.jpg')
})

test('converts the duration from seconds to milliseconds', () => {
    assert.equal(mapTrack(deezerTrack({ duration: 354 })).durationMs, 354_000)
    assert.equal(mapTrack(deezerTrack({ duration: undefined })).durationMs, null)
})

test('treats a bpm of zero as unknown rather than motionless', () => {
    assert.equal(mapTrack(deezerTrack({ bpm: 0 })).bpm, null)
    assert.equal(mapTrack(deezerTrack({ bpm: undefined })).bpm, null)
    assert.equal(mapTrack(deezerTrack({ bpm: 92.5 })).bpm, 92.5)
})

test('ignores the placeholder date Deezer uses for an unknown release', () => {
    const mapped = mapTrack(deezerTrack({ release_date: '0000-00-00' }), { title: 'X' })

    assert.deepEqual(mapped.releaseDate, [])
    assert.equal(mapped.releaseDatePrecision, null)
})

test('joins every credited artist, not just the first', () => {
    const mapped = mapTrack(
        deezerTrack({
            contributors: [
                { id: 1, name: 'Queen' },
                { id: 2, name: 'David Bowie' }
            ]
        })
    )

    assert.equal(mapped.author, 'Queen, David Bowie')
    assert.equal(mapped.artists.length, 2)
    assert.equal(mapped.artists[1].name, 'David Bowie')
})

test('counts an artist credited under two roles only once', () => {
    const mapped = mapTrack(
        deezerTrack({
            contributors: [
                { id: 1, name: 'Queen', role: 'Main' },
                { id: 1, name: 'Queen', role: 'Featured' }
            ]
        })
    )

    assert.equal(mapped.artists.length, 1)
    assert.equal(mapped.author, 'Queen')
})

test('falls back to the single artist when there are no contributors', () => {
    const mapped = mapTrack(deezerHit())

    assert.equal(mapped.author, 'Queen')
    assert.equal(mapped.artists[0].id, 1)
})

test('survives a track with no album, artists or ids', () => {
    const mapped = mapTrack({ title: 'Untitled' })

    assert.equal(mapped.title, 'Untitled')
    assert.equal(mapped.author, null)
    assert.equal(mapped.album, null)
    assert.equal(mapped.albumType, null)
    assert.deepEqual(mapped.releaseDate, [])
    assert.deepEqual(mapped.deezerGenres, [])
    assert.equal(mapped.isrc, null)
    assert.equal(mapped.bpm, null)
    assert.equal(mapped.coverArt, null)
})

test('maps nothing to nothing', () => {
    assert.equal(mapTrack(null), null)
})

test('treats a missing genres block as no genres', () => {
    assert.deepEqual(mapTrack(deezerTrack(), deezerAlbum({ genres: undefined })).deezerGenres, [])
    assert.deepEqual(mapTrack(deezerTrack(), deezerAlbum({ genres: {} })).deezerGenres, [])
})

//! Search
test('searches, then fetches the track and its album', async (t) => {
    const fetch = stubDeezer()
    t.after(fetch.restore)

    const track = await createClient().searchTrack('Bohemian Rhapsody')

    assert.equal(track.title, 'Bohemian Rhapsody')
    assert.equal(track.bpm, 143.9)
    assert.deepEqual(track.deezerGenres, ['Rock'])
    assert.equal(fetch.calls.length, 3)
})

test('sends the query and a limit of one', async (t) => {
    const fetch = stubDeezer()
    t.after(fetch.restore)

    await createClient().searchTrack('Billie Jean')
    const searchUrl = fetch.calls[0].url

    assert.match(searchUrl, /q=Billie\+Jean/)
    assert.match(searchUrl, /limit=1/)
})

test('returns null when the search finds nothing', async (t) => {
    const fetch = stubDeezer({ hits: [] })
    t.after(fetch.restore)

    assert.equal(await createClient().searchTrack('asdkjhaskdjh'), null)
    // no point asking for a track that was never found
    assert.equal(fetch.calls.length, 1)
})

test('keeps the search hit when the track detail comes back empty', async (t) => {
    const fetch = stubDeezer({ track: { error: { type: 'DataException', code: 800 } } })
    t.after(fetch.restore)

    const track = await createClient().searchTrack('Bohemian Rhapsody')

    assert.equal(track.title, 'Bohemian Rhapsody')
    assert.equal(track.isrc, 'GBUM71029604')
    // the detail-only fields are simply absent
    assert.equal(track.bpm, null)
})

test('an album that cannot be read still yields the track', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/search')) return response({ data: [deezerHit()] })
        if (url.includes('/track/')) return response(deezerTrack())
        return response({}, { status: 500 })
    })
    t.after(fetch.restore)

    const track = await createClient().searchTrack('Bohemian Rhapsody')

    assert.equal(track.title, 'Bohemian Rhapsody')
    assert.equal(track.bpm, 143.9)
    assert.deepEqual(track.deezerGenres, [])
    assert.equal(track.albumType, null)
})

test('caches album lookups within a run', async (t) => {
    const fetch = stubDeezer()
    t.after(fetch.restore)

    const deezer = createClient()
    await deezer.searchTrack('Bohemian Rhapsody')
    await deezer.searchTrack('Love of My Life')

    assert.equal(fetch.calls.filter((call) => call.url.includes('/album/')).length, 1)
})

//! Errors
// Deezer answers everything with HTTP 200 and puts the failure in the body, so
// these must be caught by inspecting what came back, not the status code.
test('flags an unreachable network separately from a rejection', async (t) => {
    const fetch = stubFetch(() => {
        throw new Error('getaddrinfo ENOTFOUND')
    })
    t.after(fetch.restore)

    await assert.rejects(() => createClient().searchTrack('Anything'), { kind: 'network' })
})

test('does not mistake a 200 carrying an error body for a result', async (t) => {
    const fetch = stubDeezer({
        error: { error: { type: 'InvalidQueryException', message: 'bad', code: 600 } }
    })
    t.after(fetch.restore)

    await assert.rejects(
        () => createClient().searchTrack('Anything'),
        (err) => {
            assert.ok(err instanceof DeezerError)
            assert.match(err.message, /InvalidQueryException/)
            return true
        }
    )
})

test('retries a quota rejection and then succeeds', async (t) => {
    let attempts = 0
    const fetch = stubFetch(() => {
        attempts += 1
        if (attempts === 1) return response({ error: { type: 'Exception', code: 4 } })
        return response(deezerTrack())
    })
    t.after(fetch.restore)

    const body = await request('/track/42', { quotaWaitMs: 0 })

    assert.equal(attempts, 2)
    assert.equal(body.title, 'Bohemian Rhapsody')
})

test('gives up on a quota rejection as a rate limit, not a bad song', async (t) => {
    const fetch = stubFetch(() => response({ error: { type: 'Exception', code: 4 } }))
    t.after(fetch.restore)

    await assert.rejects(() => request('/track/42', { quotaWaitMs: 0 }), { kind: 'rate-limit' })
    assert.equal(fetch.calls.length, 3)
})

test('reports a missing id as nothing rather than an error', async (t) => {
    const fetch = stubFetch(() => response({ error: { type: 'DataException', code: 800 } }))
    t.after(fetch.restore)

    assert.equal(await request('/track/999999999999'), null)
})

test('reports an HTTP failure with its status', async (t) => {
    const fetch = stubFetch(() => response({}, { status: 503 }))
    t.after(fetch.restore)

    await assert.rejects(() => createClient().searchTrack('Anything'), { status: 503 })
})

//! Deadlines
// A connection that opens and then goes quiet is the one failure no status code
// describes, and the one Node's fetch will wait on forever.
test('gives up on a request that is accepted and then never answered', async (t) => {
    const fetch = stubHangingFetch()
    t.after(fetch.restore)

    await assert.rejects(() => request('/track/42', { timeoutMs: 300 }), { kind: 'timeout' })
})

test('treats a stalled request as one bad song, not a dead connection', async (t) => {
    const fetch = stubHangingFetch()
    t.after(fetch.restore)

    // 'network' is the kind that aborts the whole run. A slow answer is not
    // grounds for that, so a deadline must report something else.
    await assert.rejects(
        () => request('/track/42', { timeoutMs: 300 }),
        (err) => {
            assert.notEqual(err.kind, 'network')
            return true
        }
    )
})

test('sends a deadline with every request', async (t) => {
    const fetch = stubDeezer()
    t.after(fetch.restore)

    await createClient().searchTrack('Bohemian Rhapsody')

    assert.ok(fetch.calls.length > 0)
    for (const call of fetch.calls) {
        assert.ok(call.options.signal instanceof AbortSignal)
    }
})

test('carries the deadline into a quota retry', async (t) => {
    let attempts = 0
    const fetch = stubFetch((_url, options) => {
        attempts += 1
        assert.ok(options.signal instanceof AbortSignal)
        if (attempts === 1) return response({ error: { type: 'Exception', code: 4 } })
        return response(deezerTrack())
    })
    t.after(fetch.restore)

    await request('/track/42', { quotaWaitMs: 0 })

    assert.equal(attempts, 2)
})
