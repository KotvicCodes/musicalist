// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    enrich,
    extractRecording,
    canonicalReleaseGroup,
    pickRecording,
    escapeQuery,
    rankNamed
} = require('../src/api/musicbrainz.js')
const { response, stubFetch } = require('./helpers.js')

//! Fixtures
const releaseGroup = (overrides = {}) => ({
    title: 'A Night at the Opera',
    'primary-type': 'Album',
    'secondary-types': [],
    'first-release-date': '1975-11-21',
    genres: [],
    tags: [],
    ...overrides
})

const recording = (overrides = {}) => ({
    id: 'rec-1',
    title: 'Bohemian Rhapsody',
    'first-release-date': '1975-11-21',
    genres: [
        { name: 'rock', count: 13 },
        { name: 'hard rock', count: 9 },
        { name: 'pop', count: 1 }
    ],
    tags: [{ name: 'album rock', count: 5 }],
    releases: [{ 'release-group': releaseGroup() }],
    ...overrides
})

//! Ranking
test('ranks genres by vote count, alphabetically on ties', () => {
    const ranked = rankNamed(
        [
            { name: 'pop', count: 2 },
            { name: 'rock', count: 9 },
            { name: 'blues', count: 2 }
        ],
        10
    )

    assert.deepEqual(
        ranked.map((genre) => genre.name),
        ['rock', 'blues', 'pop']
    )
})

test('ignores nameless entries and non-arrays', () => {
    assert.deepEqual(rankNamed([{ count: 3 }, null], 5), [])
    assert.deepEqual(rankNamed(undefined, 5), [])
})

//! Release Groups
test('picks the earliest release group out of many', () => {
    const group = canonicalReleaseGroup([
        {
            'release-group': releaseGroup({
                title: 'Later Album',
                'first-release-date': '1981-10-26'
            })
        },
        { 'release-group': releaseGroup({ title: 'A Night at the Opera' }) },
        {
            'release-group': releaseGroup({
                title: 'Middle Album',
                'first-release-date': '1979-06-22'
            })
        }
    ])

    assert.equal(group.title, 'A Night at the Opera')
})

test('prefers an original release over an earlier repackaging', () => {
    // A live album or compilation predating the studio album must not be the
    // one that describes the song.
    const group = canonicalReleaseGroup([
        {
            'release-group': releaseGroup({
                title: 'Live Killers',
                'first-release-date': '1970-01-01',
                'secondary-types': ['Live']
            })
        },
        { 'release-group': releaseGroup({ title: 'A Night at the Opera' }) }
    ])

    assert.equal(group.title, 'A Night at the Opera')
})

test('falls back to a repackaging when that is all there is', () => {
    const group = canonicalReleaseGroup([
        {
            'release-group': releaseGroup({
                title: 'Greatest Hits',
                'secondary-types': ['Compilation']
            })
        }
    ])

    assert.equal(group.title, 'Greatest Hits')
})

test('breaks a date tie in favour of the album over the single', () => {
    const group = canonicalReleaseGroup([
        {
            'release-group': releaseGroup({ title: 'Bohemian Rhapsody', 'primary-type': 'Single' })
        },
        { 'release-group': releaseGroup({ title: 'A Night at the Opera', 'primary-type': 'Album' }) }
    ])

    assert.equal(group.title, 'A Night at the Opera')
})

test('tolerates release groups with no date at all', () => {
    const group = canonicalReleaseGroup([
        { 'release-group': releaseGroup({ title: 'Undated', 'first-release-date': undefined }) },
        { 'release-group': releaseGroup({ title: 'Dated', 'first-release-date': '1990-01-01' }) }
    ])

    assert.equal(group.title, 'Dated')
})

test('returns null when there are no releases', () => {
    assert.equal(canonicalReleaseGroup([]), null)
    assert.equal(canonicalReleaseGroup(undefined), null)
})

//! Search Candidates
test('prefers an original recording over equally scoring compilations', () => {
    // Reproduces what MusicBrainz actually returns for a famous song: hundreds
    // of recordings all scoring 100, most of them compilation appearances.
    const id = pickRecording([
        {
            id: 'comp-1',
            score: 100,
            'first-release-date': '1994',
            releases: [{ 'release-group': releaseGroup({ 'secondary-types': ['Compilation'] }) }]
        },
        {
            id: 'original',
            score: 100,
            'first-release-date': '1991-09-10',
            releases: [{ 'release-group': releaseGroup({ 'secondary-types': [] }) }]
        },
        {
            id: 'live-1',
            score: 100,
            'first-release-date': '1992',
            releases: [{ 'release-group': releaseGroup({ 'secondary-types': ['Live'] }) }]
        }
    ])

    assert.equal(id, 'original')
})

test('never drops below the top score', () => {
    const id = pickRecording([
        { id: 'best', score: 100, releases: [] },
        {
            id: 'worse-but-original',
            score: 40,
            'first-release-date': '1960',
            releases: [{ 'release-group': releaseGroup() }]
        }
    ])

    assert.equal(id, 'best')
})

test('picks the earliest among equally original candidates', () => {
    const id = pickRecording([
        {
            id: 'later',
            score: 100,
            'first-release-date': '1999',
            releases: [{ 'release-group': releaseGroup() }]
        },
        {
            id: 'earlier',
            score: 100,
            'first-release-date': '1975',
            releases: [{ 'release-group': releaseGroup() }]
        }
    ])

    assert.equal(id, 'earlier')
})

test('returns null for an empty candidate list', () => {
    assert.equal(pickRecording([]), null)
    assert.equal(pickRecording(undefined), null)
})

//! Extraction
test('extracts genres, original date and release typing', () => {
    const result = extractRecording(recording())

    assert.equal(result.mbRecordingId, 'rec-1')
    assert.equal(result.originalReleaseDate, '1975-11-21')
    assert.equal(result.releaseType, 'Album')
    assert.deepEqual(result.wikiGenres, ['rock', 'hard rock', 'pop'])
    assert.deepEqual(result.genreWeights[0], { name: 'rock', count: 13 })
    assert.deepEqual(result.tags, ['album rock'])
})

test('falls back to release group genres when the recording has none', () => {
    const result = extractRecording(
        recording({
            genres: [],
            tags: [],
            releases: [
                {
                    'release-group': releaseGroup({
                        genres: [{ name: 'progressive rock', count: 4 }],
                        tags: [{ name: 'seventies', count: 2 }]
                    })
                }
            ]
        })
    )

    assert.deepEqual(result.wikiGenres, ['progressive rock'])
    assert.deepEqual(result.tags, ['seventies'])
})

test('returns a usable empty shape when both levels are bare', () => {
    const result = extractRecording(recording({ genres: [], tags: [], releases: [] }))

    assert.deepEqual(result.wikiGenres, [])
    assert.deepEqual(result.genreWeights, [])
    assert.equal(result.releaseType, null)
    assert.deepEqual(result.releaseSecondaryTypes, [])
    // the recording still knows its own first release date
    assert.equal(result.originalReleaseDate, '1975-11-21')
})

test('carries secondary types through', () => {
    const result = extractRecording(
        recording({
            releases: [
                {
                    'release-group': releaseGroup({
                        'primary-type': 'Album',
                        'secondary-types': ['Live', 'Compilation']
                    })
                }
            ]
        })
    )

    assert.deepEqual(result.releaseSecondaryTypes, ['Live', 'Compilation'])
})

test('handles a missing recording without throwing', () => {
    const result = extractRecording(null)

    assert.equal(result.mbRecordingId, null)
    assert.deepEqual(result.wikiGenres, [])
})

//! Query Escaping
test('escapes Lucene syntax in song titles', () => {
    assert.equal(escapeQuery('Where Is My Mind?'), 'Where Is My Mind\\?')
    assert.equal(escapeQuery('D.A.N.C.E (Remix)'), 'D.A.N.C.E \\(Remix\\)')
    assert.equal(escapeQuery('Song: "Quoted"'), 'Song\\: \\"Quoted\\"')
})

//! Lookup
test('resolves through the ISRC and then loads the recording', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })
        return response(recording())
    })
    t.after(fetch.restore)

    const result = await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.equal(result.mbRecordingId, 'rec-1')
    assert.match(fetch.calls[0].url, /\/isrc\/GBUM71029604/)
    assert.match(fetch.calls[1].url, /inc=genres\+tags\+releases\+release-groups/)
})

// A reissue keeps the original ISRC, so one code can name several recordings.
// The remaster is a real hit, not a bad match, so only the date separates them.
test('prefers the original when one ISRC covers a remaster too', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/'))
            return response({
                recordings: [
                    {
                        id: 'remaster',
                        title: 'Smells Like Teen Spirit (remastered 2021)',
                        'first-release-date': '2021-11-10'
                    },
                    {
                        id: 'original',
                        title: 'Smells Like Teen Spirit',
                        'first-release-date': '1991-09-10'
                    }
                ]
            })
        return response(recording({ id: 'original', 'first-release-date': '1991-09-10' }))
    })
    t.after(fetch.restore)

    const result = await enrich({ isrc: 'USGF19942501', title: 'Smells Like Teen Spirit' })

    assert.equal(result.mbRecordingId, 'original')
    assert.equal(result.originalReleaseDate, '1991-09-10')
    assert.match(fetch.calls[1].url, /\/recording\/original\?/)
})

// The ISRC payload has no scores and no releases, so the ranking has to survive
// both being absent rather than reading them off undefined.
test('ranks ISRC hits that carry no score or releases', () => {
    assert.equal(
        pickRecording([
            { id: 'late', 'first-release-date': '2021-11-10' },
            { id: 'early', 'first-release-date': '1991-09-10' }
        ]),
        'early'
    )
})

// An undated entry must not win by default, but it is still better than nothing.
test('keeps an undated ISRC hit behind a dated one', () => {
    assert.equal(
        pickRecording([{ id: 'undated' }, { id: 'dated', 'first-release-date': '1991' }]),
        'dated'
    )
    assert.equal(pickRecording([{ id: 'only' }]), 'only')
})

test('falls back to a text search when the ISRC is unknown', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/')) return response({ recordings: [] })
        if (url.includes('query=')) return response({ recordings: [{ id: 'rec-2' }] })
        return response(recording({ id: 'rec-2' }))
    })
    t.after(fetch.restore)

    const result = await enrich({ isrc: 'NOPE', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.equal(result.mbRecordingId, 'rec-2')
    assert.match(fetch.calls[1].url, /recording%3A/)
    assert.match(fetch.calls[1].url, /artist%3A/)
})

test('identifies itself to MusicBrainz with the current version', async (t) => {
    // MusicBrainz requires a descriptive User-Agent and blocks anonymous traffic,
    // so this header is not optional and must not go stale across releases.
    const fetch = stubFetch(() => response({ recordings: [] }))
    t.after(fetch.restore)

    await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    const sent = fetch.calls[0].options.headers['User-Agent']
    assert.match(sent, /^Musicalist\/\d+\.\d+\.\d+ \( https:\/\/github\.com\//)
    assert.ok(sent.includes(require('../package.json').version))
})

test('spaces requests at least a second apart', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })
        return response(recording())
    })
    t.after(fetch.restore)

    await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.equal(fetch.calls.length, 2)
    assert.ok(
        fetch.calls[1].at - fetch.calls[0].at >= 1000,
        `expected a throttle gap, got ${fetch.calls[1].at - fetch.calls[0].at}ms`
    )
})

test('a MusicBrainz outage costs genres, not the song', async (t) => {
    const fetch = stubFetch(() => {
        throw new Error('ECONNRESET')
    })
    t.after(fetch.restore)

    const result = await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.equal(result.mbRecordingId, null)
    assert.deepEqual(result.wikiGenres, [])
})

test('a failed request does not stall later ones', async (t) => {
    let call = 0
    const fetch = stubFetch((url) => {
        call += 1
        if (call === 1) throw new Error('ECONNRESET')
        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })
        return response(recording())
    })
    t.after(fetch.restore)

    await enrich({ isrc: 'BAD', title: 'One', artist: 'A' })
    const second = await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.equal(second.mbRecordingId, 'rec-1')
})

//! Deadlines
test('sends a deadline with every request', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })
        return response(recording())
    })
    t.after(fetch.restore)

    await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })

    assert.ok(fetch.calls.length > 0)
    for (const call of fetch.calls) {
        assert.ok(call.options.signal instanceof AbortSignal)
    }
})

//! Fields Already In The Payload
// Each of these arrived in the recording lookup the app was already making.
test('asks for the credits, links and ISRCs in the same request', async (t) => {
    const fetch = stubFetch((url) => {
        if (url.includes('/isrc/')) return response({ recordings: [{ id: 'rec-1' }] })
        return response(recording())
    })
    t.after(fetch.restore)

    await enrich({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen' })
    const lookup = fetch.calls.find((call) => call.url.includes('/recording/rec-1'))

    // one request, not four: MusicBrainz charges per call, not per byte
    assert.match(lookup.url, /artist-credits/)
    assert.match(lookup.url, /artist-rels/)
    assert.match(lookup.url, /url-rels/)
    assert.match(lookup.url, /isrcs/)
})

test('reads the note saying which recording this actually is', () => {
    // the field that answers the app's own best-effort matching caveat outright
    const live = extractRecording(recording({ disambiguation: 'live, Wembley 1986' }))

    assert.equal(live.disambiguation, 'live, Wembley 1986')
    assert.equal(extractRecording(recording()).disambiguation, null)
})

test('keeps the canonical length so it can be checked against Deezer', () => {
    assert.equal(extractRecording(recording({ length: 354_000 })).mbDurationMs, 354_000)
    assert.equal(extractRecording(recording({ length: undefined })).mbDurationMs, null)
})

test('collects the production credits by role', () => {
    const extracted = extractRecording(
        recording({
            relations: [
                { 'target-type': 'artist', type: 'producer', artist: { name: 'Roy Thomas Baker' } },
                { 'target-type': 'artist', type: 'recording engineer', artist: { name: 'Mike Stone' } },
                { 'target-type': 'url', type: 'wikidata', url: { resource: 'https://wikidata/Q1' } }
            ]
        })
    )

    assert.deepEqual(extracted.credits, [
        { name: 'Roy Thomas Baker', role: 'producer' },
        { name: 'Mike Stone', role: 'recording engineer' }
    ])
})

test('keeps the links that lead somewhere, and drops the rest', () => {
    const extracted = extractRecording(
        recording({
            relations: [
                { 'target-type': 'url', type: 'wikidata', url: { resource: 'https://wikidata/Q1' } },
                { 'target-type': 'url', type: 'discogs', url: { resource: 'https://discogs/1' } },
                { 'target-type': 'url', type: 'streaming', url: { resource: 'https://somewhere/1' } }
            ]
        })
    )

    assert.equal(extracted.links.wikidata, 'https://wikidata/Q1')
    assert.equal(extracted.links.discogs, 'https://discogs/1')
    assert.equal(extracted.links.streaming, undefined)
})

test('reads artists as identities rather than a joined string', () => {
    const extracted = extractRecording(
        recording({
            'artist-credit': [{ artist: { id: 'mbid-queen', name: 'Queen' } }]
        })
    )

    assert.deepEqual(extracted.mbArtists, [{ name: 'Queen', id: 'mbid-queen' }])
})

test('keeps every ISRC, not only the one Deezer served', () => {
    // a remaster and its original share a code, so the set says more than one
    const extracted = extractRecording(recording({ isrcs: ['GBUM71029604', 'GBUM71105604'] }))

    assert.deepEqual(extracted.mbIsrcs, ['GBUM71029604', 'GBUM71105604'])
})

test('builds the cover art URL from an id it already has', () => {
    const extracted = extractRecording(
        recording({
            releases: [
                {
                    'release-group': {
                        id: 'rg-1',
                        'primary-type': 'Album',
                        'first-release-date': '1975-11-21'
                    }
                }
            ]
        })
    )

    assert.equal(extracted.coverArtUrl, 'https://coverartarchive.org/release-group/rg-1/front')
})

test('returns the new fields empty rather than absent when there is no recording', () => {
    const empty = extractRecording(null)

    assert.equal(empty.disambiguation, null)
    assert.equal(empty.mbDurationMs, null)
    assert.equal(empty.coverArtUrl, null)
    assert.deepEqual(empty.credits, [])
    assert.deepEqual(empty.links, {})
    assert.deepEqual(empty.mbIsrcs, [])
    assert.deepEqual(empty.mbArtists, [])
})
