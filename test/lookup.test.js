// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { lookupSongs, blankRow } = require('../src/api/lookup.js')
const { response, stubFetch, deezerHit, deezerTrack, deezerAlbum } = require('./helpers.js')

//! Helpers
// One stub covering both services, so a run can be driven end to end. Songs are
// keyed by the query they are found under.
function stubEverything({ tracks = {}, mbDown = false, audio = null } = {}) {
    return stubFetch((url) => {
        if (url.includes('acousticbrainz.org')) {
            if (!audio) return response({ message: 'Not found' }, { status: 404 })
            return response({
                highlevel: {
                    danceability: {
                        all: { danceable: audio.danceable, not_danceable: 1 - audio.danceable },
                        probability: audio.danceable,
                        value: 'danceable'
                    }
                }
            })
        }

        if (url.includes('api.deezer.com')) {
            if (url.includes('/search')) {
                const query = new URL(url).searchParams.get('q')
                const track = tracks[query]
                // Titled after the query, because Deezer's hits are now scored
                // against it and a stub answering everything with the same song
                // would be refused exactly as a real wrong hit is.
                return response({ data: track ? [deezerHit({ id: track.id, title: query })] : [] })
            }
            if (url.includes('/track/')) {
                const id = Number(url.split('/track/')[1])
                const track = Object.values(tracks).find((entry) => entry.id === id)
                return response(track || { error: { type: 'DataException', code: 800 } })
            }
            return response(deezerAlbum())
        }

        if (mbDown) throw new Error('ECONNRESET')

        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })

        return response({
            id: 'rec-1',
            'first-release-date': '1975-11-21',
            genres: [{ name: 'rock', count: 13 }],
            tags: [],
            releases: [
                { 'release-group': { 'primary-type': 'Album', 'first-release-date': '1975-11-21' } }
            ]
        })
    })
}

//! Blank Row
test('a blank row carries every field the renderer reads', () => {
    const row = blankRow('Nonsense')

    assert.equal(row.query, 'Nonsense')
    assert.equal(row.found, false)
    assert.equal(row.bpm, null)
    assert.equal(row.deezerUrl, null)
    assert.deepEqual(row.releaseDate, [])
    assert.deepEqual(row.wikiGenres, [])
    assert.deepEqual(row.deezerGenres, [])
    assert.deepEqual(row.genreWeights, [])
    assert.deepEqual(row.artists, [])
})

test('a blank row carries the error field even when nothing went wrong', () => {
    // Every row has the same shape, so the exporter reads one field rather than
    // guarding against its absence on the rows that succeeded.
    const row = blankRow('Nonsense')

    assert.ok('error' in row)
    assert.equal(row.error, null)
})

//! Happy Path
test('merges Deezer and MusicBrainz into one row', async (t) => {
    const fetch = stubEverything({ tracks: { 'Bohemian Rhapsody': deezerTrack() } })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['Bohemian Rhapsody'])

    assert.equal(row.found, true)
    assert.equal(row.title, 'Bohemian Rhapsody')
    assert.equal(row.author, 'Queen')
    assert.equal(row.bpm, 143.9)
    assert.deepEqual(row.deezerGenres, ['Rock'])
    assert.deepEqual(row.wikiGenres, ['rock'])
    // Deezer serves the 2011 reissue; MusicBrainz knows the original
    assert.deepEqual(row.releaseDate, ['2011-01-01'])
    assert.equal(row.originalReleaseDate, '1975-11-21')
    assert.equal(row.releaseType, 'Album')
})

test('streams each row through onProgress as it lands', async (t) => {
    const fetch = stubEverything({
        tracks: {
            'Bohemian Rhapsody': deezerTrack(),
            'Billie Jean': deezerTrack({ id: 43, title: 'Billie Jean' })
        }
    })
    t.after(fetch.restore)

    const seen = []
    const rows = await lookupSongs(['Bohemian Rhapsody', 'Billie Jean'], {
        onProgress: (row) => seen.push(row.query)
    })

    assert.deepEqual(seen, ['Bohemian Rhapsody', 'Billie Jean'])
    assert.equal(rows.length, 2)
})

//! Misses
test('a song Deezer does not know still gets a row', async (t) => {
    const fetch = stubEverything({ tracks: {} })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['asdkjhaskdjh'])

    assert.equal(row.found, false)
    assert.equal(row.query, 'asdkjhaskdjh')
    assert.equal(row.title, null)
})

test('a MusicBrainz outage still yields a Deezer row', async (t) => {
    const fetch = stubEverything({ tracks: { 'Bohemian Rhapsody': deezerTrack() }, mbDown: true })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['Bohemian Rhapsody'])

    assert.equal(row.found, true)
    assert.equal(row.album, 'A Night at the Opera')
    assert.equal(row.bpm, 143.9)
    assert.deepEqual(row.wikiGenres, [])
    assert.equal(row.originalReleaseDate, null)
})

test('one broken song does not abort the rest of the list', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('api.deezer.com')) {
            if (url.includes('/search')) {
                const query = new URL(url).searchParams.get('q')
                if (query === 'Broken') return response({}, { status: 500 })
                return response({ data: [deezerHit()] })
            }
            if (url.includes('/track/')) return response(deezerTrack())
            return response(deezerAlbum())
        }
        return response({ recordings: [] })
    })
    t.after(fetch.restore)

    const rows = await lookupSongs(['Broken', 'Bohemian Rhapsody'])

    assert.equal(rows.length, 2)
    assert.ok(rows[0].error)
    assert.equal(rows[0].found, false)
    assert.equal(rows[1].found, true)
})

//! Fatal Errors
test('a dead connection stops the run instead of failing every song', async (t) => {
    const fetch = stubFetch(() => {
        throw new Error('getaddrinfo ENOTFOUND')
    })
    t.after(fetch.restore)

    const seen = []
    await assert.rejects(
        () => lookupSongs(['One', 'Two', 'Three'], { onProgress: (row) => seen.push(row) }),
        { kind: 'network' }
    )

    assert.equal(seen.length, 0)
})

//! Audio Features
test('merges AcousticBrainz mood into the row', async (t) => {
    const fetch = stubEverything({ tracks: { Bohemian: deezerTrack() }, audio: { danceable: 0.82 } })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['Bohemian'])

    assert.equal(row.danceability, 0.82)
    assert.ok(
        fetch.calls.some((call) => call.url.includes('acousticbrainz.org/api/v1/rec-1/high-level'))
    )
})

test('a song the archive has never seen keeps every other field', async (t) => {
    // Coverage is partial by design, so a miss has to look like Deezer's
    // missing BPM: blank, with the rest of the row intact.
    const fetch = stubEverything({ tracks: { Bohemian: deezerTrack() } })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['Bohemian'])

    assert.equal(row.danceability, null)
    assert.equal(row.moodHappy, null)
    assert.equal(row.found, true)
    assert.equal(row.title, 'Bohemian Rhapsody')
    assert.equal(row.originalReleaseDate, '1975-11-21')
})

test('does not call the archive when MusicBrainz found no recording', async (t) => {
    const fetch = stubEverything({ tracks: { Bohemian: deezerTrack() }, mbDown: true })
    t.after(fetch.restore)

    const [row] = await lookupSongs(['Bohemian'])

    assert.equal(row.found, true)
    assert.equal(row.danceability, null)
    assert.equal(
        fetch.calls.some((call) => call.url.includes('acousticbrainz.org')),
        false
    )
})

test('a blank row carries the audio fields too, so every row is the same shape', () => {
    const row = blankRow('Missing')

    assert.equal('danceability' in row, true)
    assert.equal('moodHappy' in row, true)
    assert.equal('instrumental' in row, true)
    assert.equal(row.danceability, null)
})

//! Stopping
// The signal is checked between songs and passed down into the requests, so a
// stop lands without waiting out whatever was in flight.
test('stops between songs and keeps what it already had', async (t) => {
    const fetch = stubEverything({
        tracks: { One: { id: 1 }, Two: { id: 2 }, Three: { id: 3 } }
    })
    t.after(fetch.restore)

    const controller = new AbortController()
    const rows = await lookupSongs(['One', 'Two', 'Three'], {
        signal: controller.signal,
        onProgress: () => controller.abort()
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0].found, true)
})

test('emits nothing at all for a run stopped before it started', async (t) => {
    const fetch = stubEverything({ tracks: { One: { id: 1 } } })
    t.after(fetch.restore)

    const controller = new AbortController()
    controller.abort()

    const seen = []
    const rows = await lookupSongs(['One'], {
        signal: controller.signal,
        onProgress: (row) => seen.push(row)
    })

    assert.deepEqual(rows, [])
    assert.deepEqual(seen, [])
    assert.equal(fetch.calls.length, 0)
})

test('a stopped request does not leave a row blaming the song', async (t) => {
    const controller = new AbortController()

    // Deezer rejects the way an aborted fetch does, once the run is stopped.
    const fetch = stubFetch(() => {
        controller.abort()
        throw new DOMException('This operation was aborted', 'AbortError')
    })
    t.after(fetch.restore)

    const rows = await lookupSongs(['One'], { signal: controller.signal })

    assert.deepEqual(rows, [])
})

test('runs to the end when no signal is given at all', async (t) => {
    const fetch = stubEverything({ tracks: { One: { id: 1 }, Two: { id: 2 } } })
    t.after(fetch.restore)

    const rows = await lookupSongs(['One', 'Two'])

    assert.equal(rows.length, 2)
})
