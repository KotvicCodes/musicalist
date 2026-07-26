// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Fake Responses
// Minimal stand-in for the parts of the fetch Response the code touches.
function response(body, { status = 200, headers = {} } = {}) {
     const lower = {}
     for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value

     return {
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
          json: async () => body
     }
}

//! Fetch Stub
// Installs a queue of handlers over globalThis.fetch and records every call.
// Returns the recorder plus a restore function for test teardown.
function stubFetch(handler) {
     const original = globalThis.fetch
     const calls = []

     globalThis.fetch = async (url, options) => {
          calls.push({ url: String(url), options, at: Date.now() })
          return handler(String(url), options, calls.length - 1)
     }

     return {
          calls,
          restore: () => {
               globalThis.fetch = original
          }
     }
}

//! Fixtures
const TOKEN_BODY = { access_token: 'token-abc', token_type: 'Bearer', expires_in: 3600 }

function spotifyTrack(overrides = {}) {
     return {
          name: 'Bohemian Rhapsody',
          duration_ms: 354320,
          explicit: false,
          track_number: 11,
          disc_number: 1,
          external_ids: { isrc: 'GBUM71029604' },
          external_urls: { spotify: 'https://open.spotify.com/track/abc' },
          artists: [
               { name: 'Queen', id: 'artist-1', external_urls: { spotify: 'https://spotify/queen' } }
          ],
          album: {
               name: 'A Night at the Opera',
               album_type: 'album',
               total_tracks: 12,
               release_date: '2011-01-01',
               release_date_precision: 'day',
               images: [
                    { url: 'https://img/large.jpg', height: 640 },
                    { url: 'https://img/medium.jpg', height: 300 }
               ]
          },
          ...overrides
     }
}

function songRow(overrides = {}) {
     return {
          query: 'Bohemian Rhapsody',
          found: true,
          title: 'Bohemian Rhapsody',
          author: 'Queen',
          artists: [{ name: 'Queen', id: 'artist-1', url: null }],
          album: 'A Night at the Opera',
          albumType: 'album',
          albumTotalTracks: 12,
          releaseDate: ['2011-01-01'],
          releaseDatePrecision: 'day',
          originalReleaseDate: '1975-11-21',
          releaseType: 'Album',
          releaseSecondaryTypes: [],
          durationMs: 354320,
          explicit: false,
          trackNumber: 11,
          discNumber: 1,
          isrc: 'GBUM71029604',
          spotifyUrl: 'https://open.spotify.com/track/abc',
          coverArt: 'https://img/medium.jpg',
          spotifyGenres: ['classic rock'],
          wikiGenres: ['rock', 'hard rock'],
          genreWeights: [
               { name: 'rock', count: 13 },
               { name: 'hard rock', count: 9 }
          ],
          tags: ['album rock'],
          mbRecordingId: 'rec-1',
          ...overrides
     }
}

module.exports = { response, stubFetch, TOKEN_BODY, spotifyTrack, songRow }
