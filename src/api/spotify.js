// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

// Refresh a little before the token actually lapses so a long song list never
// trips over an expiry mid-run.
const TOKEN_SKEW_MS = 60_000

// Spotify answers 429 with a Retry-After header; give up after this many tries.
const MAX_ATTEMPTS = 3

//! Errors
// `kind` lets the UI say something useful ("check your credentials") without
// ever echoing a response body, which could carry the token back to the screen.
class SpotifyError extends Error {
     constructor(message, { kind = 'http', status = null } = {}) {
          super(message)
          this.name = 'SpotifyError'
          this.kind = kind
          this.status = status
     }
}

//! Helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//! Token Cache
// Module scoped and keyed by client ID so repeated runs in one session reuse
// the same token instead of asking for a fresh one every time.
const tokenCache = new Map()

function clearTokenCache() {
     tokenCache.clear()
}

async function getToken(clientId, clientSecret, { force = false } = {}) {
     const cached = tokenCache.get(clientId)
     if (!force && cached && cached.expiresAt > Date.now()) {
          return cached.token
     }

     const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

     let response
     try {
          response = await fetch(TOKEN_URL, {
               method: 'POST',
               headers: {
                    Authorization: `Basic ${basic}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
               },
               body: 'grant_type=client_credentials'
          })
     } catch {
          throw new SpotifyError('Could not reach Spotify. Check your internet connection.', {
               kind: 'network'
          })
     }

     if (response.status === 400 || response.status === 401) {
          tokenCache.delete(clientId)
          throw new SpotifyError(
               'Spotify rejected those credentials. Check your Client ID and Secret.',
               {
                    kind: 'credentials',
                    status: response.status
               }
          )
     }

     if (!response.ok) {
          throw new SpotifyError(`Spotify returned ${response.status} while signing in.`, {
               status: response.status
          })
     }

     const body = await response.json()
     const expiresIn = Number(body.expires_in) || 3600

     tokenCache.set(clientId, {
          token: body.access_token,
          expiresAt: Date.now() + expiresIn * 1000 - TOKEN_SKEW_MS
     })

     return body.access_token
}

//! Request
// Retries on 429 by honouring Retry-After. Anything else is surfaced to the
// caller, which decides whether to fail the song or the whole run.
async function request(url, token, attempt = 1) {
     let response
     try {
          response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
     } catch {
          throw new SpotifyError('Could not reach Spotify. Check your internet connection.', {
               kind: 'network'
          })
     }

     if (response.status === 429) {
          if (attempt >= MAX_ATTEMPTS) {
               throw new SpotifyError('Spotify is rate limiting this app. Try again in a minute.', {
                    kind: 'rate-limit',
                    status: 429
               })
          }
          // A Retry-After of 0 is legitimate and means "go again now", so it must
          // not be swallowed by a falsy check.
          const header = Number(response.headers.get('retry-after'))
          const retryAfter = Number.isFinite(header) && header >= 0 ? header : 1
          await sleep(retryAfter * 1000)
          return request(url, token, attempt + 1)
     }

     if (response.status === 401) {
          throw new SpotifyError('Spotify session expired.', { kind: 'expired', status: 401 })
     }

     if (!response.ok) {
          throw new SpotifyError(`Spotify returned ${response.status}.`, { status: response.status })
     }

     return response.json()
}

//! Mapping
// Pull the fields worth keeping out of a Spotify track object. The search
// response already embeds the full album and artist credits, so there is no
// need for a follow-up GET /tracks/{id}.
function mapTrack(track) {
     const album = track.album || {}
     const artists = Array.isArray(track.artists) ? track.artists : []
     const images = Array.isArray(album.images) ? album.images : []

     return {
          title: track.name || null,
          author: artists.length ? artists.map((artist) => artist.name).join(', ') : null,
          artists: artists.map((artist) => ({
               name: artist.name,
               id: artist.id || null,
               url: artist.external_urls ? artist.external_urls.spotify || null : null
          })),
          album: album.name || null,
          albumType: album.album_type || null,
          albumTotalTracks: typeof album.total_tracks === 'number' ? album.total_tracks : null,
          releaseDate: album.release_date ? [album.release_date] : [],
          releaseDatePrecision: album.release_date_precision || null,
          durationMs: typeof track.duration_ms === 'number' ? track.duration_ms : null,
          explicit: typeof track.explicit === 'boolean' ? track.explicit : null,
          trackNumber: typeof track.track_number === 'number' ? track.track_number : null,
          discNumber: typeof track.disc_number === 'number' ? track.disc_number : null,
          isrc: track.external_ids ? track.external_ids.isrc || null : null,
          spotifyUrl: track.external_urls ? track.external_urls.spotify || null : null,
          // images come back largest first; the middle one is the usable thumbnail
          coverArt: (images[1] || images[0] || {}).url || null
     }
}

//! Client
// One client per run. The artist cache lives on the instance so a list full of
// the same artist costs a single lookup, which matters now that the batch
// GET /artists endpoint has been removed.
function createClient({ clientId, clientSecret, market = 'US' }) {
     const artistCache = new Map()

     // Runs a call, and if the cached token turned out to be dead, forces a
     // fresh one and tries exactly once more.
     async function authed(url) {
          const token = await getToken(clientId, clientSecret)
          try {
               return await request(url, token)
          } catch (err) {
               if (err.kind !== 'expired') throw err
               const fresh = await getToken(clientId, clientSecret, { force: true })
               return request(url, fresh)
          }
     }

     return {
          // Returns the mapped track, or null when Spotify knows nothing about it.
          async searchTrack(query) {
               const params = new URLSearchParams({ q: query, type: 'track', limit: '1' })
               if (market) params.set('market', market)

               const body = await authed(`${API_BASE}/search?${params}`)
               const items = body && body.tracks ? body.tracks.items : null
               if (!Array.isArray(items) || items.length === 0) return null

               return mapTrack(items[0])
          },

          // Artist genres are deprecated on Spotify's side and frequently empty,
          // which is why MusicBrainz carries the genre load. Kept because when it
          // is populated it is still worth showing.
          async getArtist(id) {
               if (!id) return null
               if (artistCache.has(id)) return artistCache.get(id)

               const artist = await authed(`${API_BASE}/artists/${encodeURIComponent(id)}`)
               const mapped = {
                    name: artist.name || null,
                    genres: Array.isArray(artist.genres) ? artist.genres : []
               }

               artistCache.set(id, mapped)
               return mapped
          }
     }
}

//! Export
module.exports = { createClient, getToken, mapTrack, clearTokenCache, SpotifyError }
