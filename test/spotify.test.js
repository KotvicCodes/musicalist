// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const {
     createClient,
     getToken,
     mapTrack,
     clearTokenCache,
     SpotifyError
} = require('../src/api/spotify.js')
const { response, stubFetch, TOKEN_BODY, spotifyTrack } = require('./helpers.js')

//! Helpers
const isToken = (url) => url.includes('accounts.spotify.com')
const client = () => createClient({ clientId: 'id', clientSecret: 'secret', market: 'US' })

test.beforeEach(() => clearTokenCache())

//! Token
test('reuses a cached token instead of asking twice', async (t) => {
     const fetch = stubFetch(() => response(TOKEN_BODY))
     t.after(fetch.restore)

     await getToken('id', 'secret')
     await getToken('id', 'secret')

     assert.equal(fetch.calls.length, 1)
})

test('asks for a new token once the cached one has expired', async (t) => {
     const fetch = stubFetch(() => response({ ...TOKEN_BODY, expires_in: 1 }))
     t.after(fetch.restore)

     // expires_in of 1 s is already inside the 60 s refresh skew, so the cached
     // entry is born stale and the second call must go out again
     await getToken('id', 'secret')
     await getToken('id', 'secret')

     assert.equal(fetch.calls.length, 2)
})

test('keeps separate tokens per client id', async (t) => {
     const fetch = stubFetch(() => response(TOKEN_BODY))
     t.after(fetch.restore)

     await getToken('id-one', 'secret')
     await getToken('id-two', 'secret')

     assert.equal(fetch.calls.length, 2)
})

test('reports bad credentials without leaking the response body', async (t) => {
     const fetch = stubFetch(() =>
          response(
               { error: 'invalid_client', error_description: 'secret was sk_live_hunter2' },
               { status: 400 }
          )
     )
     t.after(fetch.restore)

     await assert.rejects(
          () => getToken('id', 'wrong'),
          (err) => {
               assert.ok(err instanceof SpotifyError)
               assert.equal(err.kind, 'credentials')
               assert.doesNotMatch(err.message, /hunter2/)
               return true
          }
     )
})

test('flags an unreachable network separately from a rejection', async (t) => {
     const fetch = stubFetch(() => {
          throw new Error('getaddrinfo ENOTFOUND')
     })
     t.after(fetch.restore)

     await assert.rejects(() => getToken('id', 'secret'), { kind: 'network' })
})

//! Search
test('maps a full track', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url) ? response(TOKEN_BODY) : response({ tracks: { items: [spotifyTrack()] } })
     )
     t.after(fetch.restore)

     const track = await client().searchTrack('Bohemian Rhapsody')

     assert.equal(track.title, 'Bohemian Rhapsody')
     assert.equal(track.author, 'Queen')
     assert.equal(track.album, 'A Night at the Opera')
     assert.deepEqual(track.releaseDate, ['2011-01-01'])
     assert.equal(track.isrc, 'GBUM71029604')
     assert.equal(track.durationMs, 354320)
     assert.equal(track.albumTotalTracks, 12)
     assert.equal(track.coverArt, 'https://img/medium.jpg')
})

test('joins every credited artist, not just the first', async (t) => {
     const track = mapTrack(
          spotifyTrack({
               artists: [
                    { name: 'Queen', id: 'a1' },
                    { name: 'David Bowie', id: 'a2' }
               ]
          })
     )

     assert.equal(track.author, 'Queen, David Bowie')
     assert.equal(track.artists.length, 2)
     assert.equal(track.artists[1].name, 'David Bowie')
})

test('survives a track with no album, artists or ids', async () => {
     const track = mapTrack({ name: 'Untitled' })

     assert.equal(track.title, 'Untitled')
     assert.equal(track.author, null)
     assert.equal(track.album, null)
     assert.deepEqual(track.releaseDate, [])
     assert.equal(track.isrc, null)
     assert.equal(track.coverArt, null)
})

test('returns null when the search finds nothing', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url) ? response(TOKEN_BODY) : response({ tracks: { items: [] } })
     )
     t.after(fetch.restore)

     assert.equal(await client().searchTrack('asdkjhaskdjh'), null)
})

test('sends the market and a limit of one', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url) ? response(TOKEN_BODY) : response({ tracks: { items: [spotifyTrack()] } })
     )
     t.after(fetch.restore)

     await client().searchTrack('Billie Jean')
     const searchUrl = fetch.calls.find((call) => !isToken(call.url)).url

     assert.match(searchUrl, /market=US/)
     assert.match(searchUrl, /limit=1/)
     assert.match(searchUrl, /type=track/)
})

//! Rate Limiting
test('honours Retry-After on a 429 and then succeeds', async (t) => {
     let attempts = 0
     const fetch = stubFetch((url) => {
          if (isToken(url)) return response(TOKEN_BODY)
          attempts += 1
          if (attempts === 1) return response({}, { status: 429, headers: { 'Retry-After': '0' } })
          return response({ tracks: { items: [spotifyTrack()] } })
     })
     t.after(fetch.restore)

     const track = await client().searchTrack('Bohemian Rhapsody')

     assert.equal(attempts, 2)
     assert.equal(track.title, 'Bohemian Rhapsody')
})

test('gives up after repeated rate limiting', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url)
               ? response(TOKEN_BODY)
               : response({}, { status: 429, headers: { 'Retry-After': '0' } })
     )
     t.after(fetch.restore)

     await assert.rejects(() => client().searchTrack('Anything'), { kind: 'rate-limit' })
})

//! Expiry Mid-Run
test('refetches the token when a call comes back 401', async (t) => {
     let tokenCalls = 0
     let apiCalls = 0
     const fetch = stubFetch((url) => {
          if (isToken(url)) {
               tokenCalls += 1
               return response(TOKEN_BODY)
          }
          apiCalls += 1
          if (apiCalls === 1) return response({}, { status: 401 })
          return response({ tracks: { items: [spotifyTrack()] } })
     })
     t.after(fetch.restore)

     const track = await client().searchTrack('Bohemian Rhapsody')

     assert.equal(tokenCalls, 2)
     assert.equal(track.title, 'Bohemian Rhapsody')
})

//! Artists
test('caches artist lookups within a run', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url) ? response(TOKEN_BODY) : response({ name: 'Queen', genres: ['classic rock'] })
     )
     t.after(fetch.restore)

     const spotify = client()
     await spotify.getArtist('artist-1')
     const again = await spotify.getArtist('artist-1')

     assert.equal(fetch.calls.filter((call) => call.url.includes('/artists/')).length, 1)
     assert.deepEqual(again.genres, ['classic rock'])
})

test('treats a missing genres array as empty', async (t) => {
     const fetch = stubFetch((url) =>
          isToken(url) ? response(TOKEN_BODY) : response({ name: 'Obscure Act' })
     )
     t.after(fetch.restore)

     const artist = await client().getArtist('artist-9')
     assert.deepEqual(artist.genres, [])
})
