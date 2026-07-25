//

const test = require('node:test')
const assert = require('node:assert/strict')

const { lookupSongs, blankRow } = require('../src/api/lookup.js')
const { clearTokenCache } = require('../src/api/spotify.js')
const { response, stubFetch, TOKEN_BODY, spotifyTrack } = require('./helpers.js')

//! Helpers
const CREDENTIALS = { clientId: 'id', clientSecret: 'secret', market: 'US' }

// One stub covering both services, so a run can be driven end to end.
function stubEverything({ tracks = {}, mbDown = false } = {}) {
     return stubFetch((url) => {
          if (url.includes('accounts.spotify.com')) return response(TOKEN_BODY)

          if (url.includes('/v1/search')) {
               const query = decodeURIComponent(new URL(url).searchParams.get('q'))
               const track = tracks[query]
               return response({ tracks: { items: track ? [track] : [] } })
          }

          if (url.includes('/v1/artists/')) return response({ name: 'Queen', genres: ['classic rock'] })

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

test.beforeEach(() => clearTokenCache())

//! Blank Row
test('a blank row carries every field the renderer reads', () => {
     const row = blankRow('Nonsense')

     assert.equal(row.query, 'Nonsense')
     assert.equal(row.found, false)
     assert.deepEqual(row.releaseDate, [])
     assert.deepEqual(row.wikiGenres, [])
     assert.deepEqual(row.spotifyGenres, [])
     assert.deepEqual(row.genreWeights, [])
     assert.deepEqual(row.artists, [])
})

//! Happy Path
test('merges Spotify and MusicBrainz into one row', async (t) => {
     const fetch = stubEverything({ tracks: { 'Bohemian Rhapsody': spotifyTrack() } })
     t.after(fetch.restore)

     const [row] = await lookupSongs(['Bohemian Rhapsody'], CREDENTIALS)

     assert.equal(row.found, true)
     assert.equal(row.title, 'Bohemian Rhapsody')
     assert.equal(row.author, 'Queen')
     assert.deepEqual(row.spotifyGenres, ['classic rock'])
     assert.deepEqual(row.wikiGenres, ['rock'])
     // Spotify serves the 2011 reissue; MusicBrainz knows the original
     assert.deepEqual(row.releaseDate, ['2011-01-01'])
     assert.equal(row.originalReleaseDate, '1975-11-21')
     assert.equal(row.releaseType, 'Album')
})

test('streams each row through onProgress as it lands', async (t) => {
     const fetch = stubEverything({
          tracks: {
               'Bohemian Rhapsody': spotifyTrack(),
               'Billie Jean': spotifyTrack({ name: 'Billie Jean' })
          }
     })
     t.after(fetch.restore)

     const seen = []
     const rows = await lookupSongs(['Bohemian Rhapsody', 'Billie Jean'], {
          ...CREDENTIALS,
          onProgress: (row) => seen.push(row.query)
     })

     assert.deepEqual(seen, ['Bohemian Rhapsody', 'Billie Jean'])
     assert.equal(rows.length, 2)
})

//! Misses
test('a song Spotify does not know still gets a row', async (t) => {
     const fetch = stubEverything({ tracks: {} })
     t.after(fetch.restore)

     const [row] = await lookupSongs(['asdkjhaskdjh'], CREDENTIALS)

     assert.equal(row.found, false)
     assert.equal(row.query, 'asdkjhaskdjh')
     assert.equal(row.title, null)
})

test('a MusicBrainz outage still yields a Spotify row', async (t) => {
     const fetch = stubEverything({ tracks: { 'Bohemian Rhapsody': spotifyTrack() }, mbDown: true })
     t.after(fetch.restore)

     const [row] = await lookupSongs(['Bohemian Rhapsody'], CREDENTIALS)

     assert.equal(row.found, true)
     assert.equal(row.album, 'A Night at the Opera')
     assert.deepEqual(row.wikiGenres, [])
     assert.equal(row.originalReleaseDate, null)
})

test('one broken song does not abort the rest of the list', async (t) => {
     const fetch = stubFetch((url) => {
          if (url.includes('accounts.spotify.com')) return response(TOKEN_BODY)
          if (url.includes('/v1/search')) {
               const query = decodeURIComponent(new URL(url).searchParams.get('q'))
               if (query === 'Broken') return response({}, { status: 500 })
               return response({ tracks: { items: [spotifyTrack()] } })
          }
          if (url.includes('/v1/artists/')) return response({ name: 'Queen', genres: [] })
          if (url.includes('/isrc/')) return response({ recordings: [] })
          return response({ recordings: [] })
     })
     t.after(fetch.restore)

     const rows = await lookupSongs(['Broken', 'Bohemian Rhapsody'], CREDENTIALS)

     assert.equal(rows.length, 2)
     assert.ok(rows[0].error)
     assert.equal(rows[0].found, false)
     assert.equal(rows[1].found, true)
})

//! Fatal Errors
test('bad credentials stop the run instead of failing every song', async (t) => {
     const fetch = stubFetch(() => response({ error: 'invalid_client' }, { status: 400 }))
     t.after(fetch.restore)

     const seen = []
     await assert.rejects(
          () =>
               lookupSongs(['One', 'Two', 'Three'], {
                    ...CREDENTIALS,
                    onProgress: (row) => seen.push(row)
               }),
          { kind: 'credentials' }
     )

     assert.equal(seen.length, 0)
})
