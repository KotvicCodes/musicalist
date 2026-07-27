// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const API_BASE = 'https://api.deezer.com'

// Deezer's public API needs no key and allows 50 requests per 5 seconds per IP.
// A 110 ms gap works out to about 45 in any 5 second window, which keeps a long
// list comfortably under the ceiling instead of riding it.
const MIN_GAP_MS = 110

// Quota rejections are transient, so back off and try again before giving up.
const MAX_ATTEMPTS = 3
const QUOTA_WAIT_MS = 5000

// Deezer answers every request with HTTP 200 and reports failures in the body.
// 4 is the quota rejection; 800 means the id simply does not exist.
const QUOTA_CODE = 4
const NO_DATA_CODE = 800

// Deezer uses this for "release date unknown" rather than omitting the field.
const NULL_DATE = '0000-00-00'

// Node's fetch has no timeout of its own, so a socket that opens and then goes
// quiet never settles. That would wedge the queue below forever and leave the
// run with no exit but quitting the app. A timeout fails only its own song
// rather than the run, because one slow answer is not a dead connection; a
// genuinely dead one is what the Stop button is for.
const REQUEST_TIMEOUT_MS = 15000

//! Errors
// `kind` lets callers tell a dead connection apart from one bad song without
// ever echoing a response body to the screen.
class DeezerError extends Error {
    constructor(message, { kind = 'http', status = null } = {}) {
        super(message)
        this.name = 'DeezerError'
        this.kind = kind
        this.status = status
    }
}

//! Helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// An aborted fetch and an aborted body read both surface as the signal's own
// reason, so the two call sites ask the same question.
function isTimeout(err) {
    return err && (err.name === 'TimeoutError' || err.name === 'AbortError')
}

//! Throttle
// A private queue, deliberately not shared with MusicBrainz: the two services
// have very different budgets and pacing one to the other would waste both.
let queue = Promise.resolve()
let lastRequestAt = 0

function throttled(task) {
    const run = queue.then(async () => {
        const wait = lastRequestAt + MIN_GAP_MS - Date.now()
        if (wait > 0) await sleep(wait)
        lastRequestAt = Date.now()
        return task()
    })

    // Keep the chain alive even when one call rejects, otherwise a single
    // failure would poison every later lookup.
    queue = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

//! Request
// Returns the parsed body, or null when Deezer knows nothing about the id.
// Anything else throws, so the caller can decide whether to fail the song or
// the whole run.
// `quotaWaitMs` and `timeoutMs` are overridable only so the retry and timeout
// paths can be tested without sleeping through a real quota window or a real
// deadline; nothing in the app passes either.
async function request(
    path,
    { attempt = 1, quotaWaitMs = QUOTA_WAIT_MS, timeoutMs = REQUEST_TIMEOUT_MS, signal } = {}
) {
    const body = await throttled(async () => {
        // Two things may end this call: the run being stopped, and the deadline
        // running out. Combining them means a request already in flight when
        // Stop is pressed drops immediately, rather than the run waiting out
        // whatever it was in the middle of.
        const deadline = AbortSignal.timeout(timeoutMs)
        const combined = signal ? AbortSignal.any([signal, deadline]) : deadline

        let response
        try {
            response = await fetch(`${API_BASE}${path}`, { signal: combined })
        } catch (err) {
            if (isTimeout(err)) {
                throw new DeezerError('Deezer did not answer in time.', { kind: 'timeout' })
            }
            throw new DeezerError('Could not reach Deezer. Check your internet connection.', {
                kind: 'network'
            })
        }

        if (!response.ok) {
            throw new DeezerError(`Deezer returned ${response.status}.`, {
                status: response.status
            })
        }

        // The signal covers the body stream too, so a response that starts and
        // then stalls mid-download lands here rather than hanging.
        try {
            return await response.json()
        } catch (err) {
            if (isTimeout(err)) {
                throw new DeezerError('Deezer did not answer in time.', { kind: 'timeout' })
            }
            throw new DeezerError('Deezer sent a response this app could not read.')
        }
    })

    // Errors arrive as a normal 200 with an `error` object in the body, so the
    // status code alone would happily let a failure through as a match.
    const error = body && body.error
    if (!error) return body

    if (error.code === NO_DATA_CODE) return null

    if (error.code === QUOTA_CODE) {
        if (attempt >= MAX_ATTEMPTS) {
            throw new DeezerError('Deezer is rate limiting this app. Try again in a minute.', {
                kind: 'rate-limit'
            })
        }
        // No point sitting out a five second quota window for a run that has
        // already been stopped.
        if (signal && signal.aborted) {
            throw new DeezerError('The run was stopped.', { kind: 'cancelled' })
        }

        await sleep(quotaWaitMs)
        return request(path, { attempt: attempt + 1, quotaWaitMs, timeoutMs, signal })
    }

    throw new DeezerError(`Deezer rejected the request (${error.type || 'error'}).`)
}

//! Field Helpers
function cleanDate(value) {
    return value && value !== NULL_DATE ? value : null
}

// The track detail carries a `contributors` list covering features and
// collaborations; the leaner search result only has a single `artist`. One
// artist can appear twice under two roles, so dedupe on the way through.
function creditedArtists(track) {
    const source =
        Array.isArray(track.contributors) && track.contributors.length
            ? track.contributors
            : track.artist
              ? [track.artist]
              : []

    const seen = new Set()
    const artists = []
    for (const artist of source) {
        if (!artist || !artist.name) continue
        const key = artist.id ?? artist.name
        if (seen.has(key)) continue
        seen.add(key)
        artists.push({ name: artist.name, id: artist.id ?? null, url: artist.link || null })
    }
    return artists
}

//! Mapping
// Folds a track (search hit or full detail) and its album into a row. Both
// halves are optional: the album call is a bonus and the search hit alone is
// still a usable result, so every field degrades to null rather than throwing.
function mapTrack(track, album) {
    if (!track) return null

    const stub = track.album || {}
    const detail = album || {}
    const artists = creditedArtists(track)
    const released = cleanDate(track.release_date || detail.release_date)

    return {
        title: track.title || null,
        author: artists.length ? artists.map((artist) => artist.name).join(', ') : null,
        artists,
        album: stub.title || detail.title || null,
        albumType: detail.record_type || null,
        albumTotalTracks: typeof detail.nb_tracks === 'number' ? detail.nb_tracks : null,
        releaseDate: released ? [released] : [],
        // Deezer only ever publishes whole dates, so precision is fixed
        releaseDatePrecision: released ? 'day' : null,
        durationMs: typeof track.duration === 'number' ? track.duration * 1000 : null,
        explicit: typeof track.explicit_lyrics === 'boolean' ? track.explicit_lyrics : null,
        trackNumber: typeof track.track_position === 'number' ? track.track_position : null,
        discNumber: typeof track.disk_number === 'number' ? track.disk_number : null,
        isrc: track.isrc || null,
        deezerUrl: track.link || null,
        // 0 is Deezer's "not analysed", not a track that stands still
        bpm: typeof track.bpm === 'number' && track.bpm > 0 ? track.bpm : null,
        deezerGenres: Array.isArray(detail.genres && detail.genres.data)
            ? detail.genres.data.map((genre) => genre && genre.name).filter(Boolean)
            : [],
        coverArt: stub.cover_big || stub.cover_medium || detail.cover_big || detail.cover || null
    }
}

//! Client
// One client per run. Albums are cached on the instance because a list often
// draws several songs from the same record, and that is a call each time.
function createClient() {
    const albumCache = new Map()

    async function getAlbum(id, signal) {
        if (!id) return null
        if (albumCache.has(id)) return albumCache.get(id)

        // Genres and the album type are enrichment, not the point of the row,
        // so a failure here must not cost the song.
        const album = await request(`/album/${encodeURIComponent(id)}`, { signal }).catch(() => null)
        albumCache.set(id, album)
        return album
    }

    return {
        // Returns the mapped track, or null when Deezer knows nothing about it.
        async searchTrack(query, { signal } = {}) {
            const params = new URLSearchParams({ q: query, limit: '1' })
            const found = await request(`/search?${params}`, { signal })

            const items = found && Array.isArray(found.data) ? found.data : []
            if (items.length === 0) return null
            const hit = items[0]

            // The search payload omits bpm, the release date and the full
            // credits, so the detail call is what makes the row worth having.
            // If it comes back empty the search hit still stands on its own.
            const track = (await request(`/track/${encodeURIComponent(hit.id)}`, { signal })) || hit
            const album = await getAlbum((track.album && track.album.id) || null, signal)

            return mapTrack(track, album)
        }
    }
}

//! Export
module.exports = { createClient, mapTrack, request, DeezerError }
