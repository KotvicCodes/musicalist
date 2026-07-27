// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const API_BASE = 'https://musicbrainz.org/ws/2'

// MusicBrainz asks for a descriptive User-Agent and blocks IPs that exceed one
// request per second. The extra 100 ms is deliberate headroom, not a guess.
// The version is read rather than written out so it cannot drift out of date
// and start misreporting which build is calling.
const { version } = require('../../package.json')
const USER_AGENT = `Musicalist/${version} ( https://github.com/KotvicCodes/Musicalist )`
const MIN_GAP_MS = 1100

// Node's fetch never times out on its own, and a stalled request here would hold
// the queue below shut for every remaining song. A song without genres is still
// a useful row, so the deadline degrades to null like any other failure.
const REQUEST_TIMEOUT_MS = 15000

// A recording lookup with these includes returns genres, tags and the parent
// release groups in a single response, so no follow-up call is needed.
const RECORDING_INC = 'genres+tags+releases+release-groups'

// How many genres and tags to keep once sorted by community vote count.
const MAX_GENRES = 8
const MAX_TAGS = 8

//! Helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//! Throttle
// Every request funnels through one promise chain, so calls are serialised and
// spaced regardless of how many songs are in flight.
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
// MusicBrainz failures are never fatal here: a song without genres is still a
// useful row, so callers get null instead of an exception.
async function request(url, signal) {
    return throttled(async () => {
        try {
            // The run's own signal and this request's deadline both have to be
            // able to end the call, so they are combined into one.
            const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: signal ? AbortSignal.any([signal, deadline]) : deadline
            })
            if (!response.ok) return null
            return await response.json()
        } catch {
            return null
        }
    })
}

//! Sorting
// Genres and tags both carry a community vote `count`; the most agreed-upon
// ones first, alphabetical as a tiebreak so output is stable.
function byCountThenName(a, b) {
    const diff = (b.count || 0) - (a.count || 0)
    return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name))
}

function rankNamed(list, limit) {
    if (!Array.isArray(list)) return []
    return list
        .filter((entry) => entry && entry.name)
        .slice()
        .sort(byCountThenName)
        .slice(0, limit)
        .map((entry) => ({ name: entry.name, count: entry.count || 0 }))
}

//! Release Groups
// A popular song can hang off two dozen releases: reissues, compilations,
// live albums, soundtracks. Secondary types mark all of those as repackagings,
// so an original release always beats one even if it is dated later, and among
// equals the earliest wins. Album breaks a date tie against the single, since
// it is the more informative answer for a song that came out as both.
function isRepackaging(group) {
    return Array.isArray(group['secondary-types']) && group['secondary-types'].length > 0
}

function rankGroup(group) {
    return [
        isRepackaging(group) ? 1 : 0,
        group['first-release-date'] || '9999',
        group['primary-type'] === 'Album' ? 0 : 1
    ]
}

function canonicalReleaseGroup(releases) {
    if (!Array.isArray(releases)) return null

    const groups = releases.map((release) => release && release['release-group']).filter(Boolean)
    if (groups.length === 0) return null

    return groups.reduce((best, group) => {
        const [aRepack, aDate, aType] = rankGroup(group)
        const [bRepack, bDate, bType] = rankGroup(best)
        if (aRepack !== bRepack) return aRepack < bRepack ? group : best
        if (aDate !== bDate) return aDate < bDate ? group : best
        return aType < bType ? group : best
    })
}

//! Extraction
// Turn a recording lookup into the MusicBrainz half of a song row.
function extractRecording(recording) {
    const empty = {
        mbRecordingId: null,
        originalReleaseDate: null,
        releaseType: null,
        releaseSecondaryTypes: [],
        genreWeights: [],
        wikiGenres: [],
        tags: []
    }
    if (!recording || !recording.id) return empty

    const group = canonicalReleaseGroup(recording.releases)

    // Recording level genres are the most specific, but they are often empty
    // while the release group carries good data, so fall back to it.
    let genres = rankNamed(recording.genres, MAX_GENRES)
    if (genres.length === 0 && group) {
        genres = rankNamed(group.genres, MAX_GENRES)
    }

    let tags = rankNamed(recording.tags, MAX_TAGS)
    if (tags.length === 0 && group) {
        tags = rankNamed(group.tags, MAX_TAGS)
    }

    return {
        mbRecordingId: recording.id,
        originalReleaseDate:
            recording['first-release-date'] || (group ? group['first-release-date'] : null) || null,
        releaseType: group ? group['primary-type'] || null : null,
        releaseSecondaryTypes:
            group && Array.isArray(group['secondary-types']) ? group['secondary-types'] : [],
        genreWeights: genres,
        wikiGenres: genres.map((genre) => genre.name),
        tags: tags.map((tag) => tag.name)
    }
}

//! Lucene Escaping
// Titles routinely contain quotes, colons and brackets, all of which are Lucene
// syntax in a MusicBrainz search query.
function escapeQuery(value) {
    return String(value).replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1')
}

//! Resolution
// A well known song matches hundreds of recordings that all score 100, because
// every compilation and live album counts as its own recording. Taking the first
// hit lands on an arbitrary repackaging with no genres attached, so rank the top
// scorers and keep the one that looks like the original studio release.
//
// The ISRC endpoint returns neither scores nor releases, which this degrades to
// cleanly: every entry ties at score 0 with no release group to inspect, so the
// release date alone decides.
function pickRecording(recordings) {
    if (!Array.isArray(recordings) || recordings.length === 0) return null

    const best = Math.max(...recordings.map((entry) => entry.score || 0))
    const tied = recordings.filter((entry) => (entry.score || 0) === best)

    const scored = tied.map((entry) => {
        const groups = (entry.releases || []).map((release) => release['release-group']).filter(Boolean)
        return {
            entry,
            // an original pressing exists among this recording's releases
            repackaged: groups.length && groups.every(isRepackaging) ? 1 : 0,
            date: entry['first-release-date'] || '9999'
        }
    })

    scored.sort((a, b) => a.repackaged - b.repackaged || a.date.localeCompare(b.date))
    return scored[0].entry.id
}

// Preferred route: the ISRC from Deezer is an exact identifier, so it needs no
// fuzzy matching to find the song. It does not identify one recording though.
// Labels reissue a track under its original ISRC, so a remaster and the pressing
// it was cut from share one code, and MusicBrainz returns them in no particular
// order. Taking the first entry therefore dated "Smells Like Teen Spirit" to the
// 2021 remaster, which also carries none of the genres the 1991 recording has,
// so the same ranking the search path uses picks between them.
async function recordingIdFromIsrc(isrc, signal) {
    const body = await request(`${API_BASE}/isrc/${encodeURIComponent(isrc)}?fmt=json`, signal)
    return pickRecording(body && body.recordings)
}

// Fallback for tracks with no ISRC, or an ISRC MusicBrainz has never seen.
async function recordingIdFromSearch(title, artist, signal) {
    if (!title) return null

    const parts = [`recording:"${escapeQuery(title)}"`]
    if (artist) parts.push(`artist:"${escapeQuery(artist)}"`)

    const params = new URLSearchParams({ fmt: 'json', limit: '25', query: parts.join(' AND ') })
    const body = await request(`${API_BASE}/recording?${params}`, signal)
    return pickRecording(body && body.recordings)
}

//! Public Lookup
// Two throttled requests per song: resolve the recording, then fetch it with
// everything included.
async function enrich({ isrc, title, artist, signal }) {
    let id = null
    if (isrc) id = await recordingIdFromIsrc(isrc, signal)
    if (!id) id = await recordingIdFromSearch(title, artist, signal)
    if (!id) return extractRecording(null)

    const recording = await request(`${API_BASE}/recording/${id}?fmt=json&inc=${RECORDING_INC}`, signal)
    return extractRecording(recording)
}

//! Export
module.exports = {
    enrich,
    extractRecording,
    canonicalReleaseGroup,
    pickRecording,
    escapeQuery,
    rankNamed
}
