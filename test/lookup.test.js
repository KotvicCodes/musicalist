// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { lookupSongs, blankRow } = require('../src/api/lookup.js')
const { response, stubFetch, deezerHit, deezerTrack, deezerAlbum } = require('./helpers.js')

//! Helpers
// One stub covering both services, so a run can be driven end to end. Songs are
// keyed by the query they are found under.
function stubEverything({ tracks = {}, mbDown = false } = {}) {
    return stubFetch((url) => {
        if (url.includes('api.deezer.com')) {
            if (url.includes('/search')) {
                const query = new URL(url).searchParams.get('q')
                const track = tracks[query]
                return response({ data: track ? [deezerHit({ id: track.id })] : [] })
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
