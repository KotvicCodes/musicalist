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

// MusicBrainz signals throttling with 503 and a "server is currently busy" body
// rather than the 429 you would expect, so it arrives looking like an outage.
// Treating it as one costs the row every genre, the original date and the
// recording id, and the id is the key AcousticBrainz and ListenBrainz are
// looked up by, so one throttled request quietly empties most of the row. The
// gap above is meant to stay under the limit, but a shared address or a second
// client on the same machine can still trip it, so it is worth waiting out.
const BUSY_STATUS = 503
const MAX_ATTEMPTS = 3
const BUSY_WAIT_MS = 2000

// A recording lookup with these includes returns genres, tags and the parent
// release groups in a single response, so no follow-up call is needed.
//
// MusicBrainz charges per request rather than per byte, so the four added here
// ride along on a call already being made and cost nothing in throttle time:
// artist-credits gives artists as identities rather than a joined string,
// artist-rels gives the production credits, url-rels gives the links out, and
// isrcs gives every code for the recording rather than only the one Deezer
// served, which matters because a remaster shares its original's ISRC.
const RECORDING_INC = 'genres+tags+releases+release-groups+artist-credits+artist-rels+url-rels+isrcs'

// How many genres and tags to keep once sorted by community vote count.
const MAX_GENRES = 8
const MAX_TAGS = 8

// Production credits run long on well documented recordings, and past the first
// handful they are session players rather than anything a summary would use.
const MAX_CREDITS = 10

// The links that lead somewhere a person would actually want to go. The rest
// are streaming URLs for services this app does not touch.
const LINK_TYPES = new Set(['wikidata', 'discogs', 'allmusic', 'secondhandsongs'])

// Constructible from the release group id already in hand, so the canonical
// artwork for the original release costs no request at all. Deezer's cover is
// whichever reissue it happened to serve.
const COVER_ART_BASE = 'https://coverartarchive.org/release-group'

//! Identifiers
// Every id MusicBrainz hands back is a UUID, and three of them go on to build a
// URL: the recording id picked out of a search, the same id once the lookup
// returns it, and the release group id the cover art URL is constructed from.
// Only the ISRC path encoded what it interpolated, so a response that put
// something else in one of those fields could reach a path this app never meant
// to request, or truncate the query string with a `?` and empty the row.
//
// Encoding each site would stop the traversal but still let a value that is not
// an id through. The shape is the real question, and it is asked once here
// rather than trusted at three call sites.
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asMbid(value) {
    return typeof value === 'string' && MBID.test(value) ? value : null
}

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
// `busyWaitMs` is overridable only so the retry path can be tested without
// sitting out a real back off; nothing in the app passes it.
async function request(url, signal, { attempt = 1, busyWaitMs = BUSY_WAIT_MS } = {}) {
    const result = await throttled(async () => {
        try {
            // The run's own signal and this request's deadline both have to be
            // able to end the call, so they are combined into one.
            const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: signal ? AbortSignal.any([signal, deadline]) : deadline
            })

            if (response.status === BUSY_STATUS) return { busy: true }
            if (!response.ok) return { body: null }
            return { body: await response.json() }
        } catch {
            return { body: null }
        }
    })

    if (!result.busy) return result.body
    if (attempt >= MAX_ATTEMPTS || (signal && signal.aborted)) return null

    // Widening, because a throttle that is still on after two seconds is not
    // going to clear in another two.
    await sleep(busyWaitMs * attempt)
    return request(url, signal, { attempt: attempt + 1, busyWaitMs })
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

//! Relations
// artist-rels and url-rels both land in the same `relations` array, told apart
// by target-type, so one pass over it serves both.

// The production side of a recording: producer, engineer, mixer, and the
// players credited by instrument. A dimension the app had nothing of, arriving
// in a response it was already paying for.
function productionCredits(relations) {
    if (!Array.isArray(relations)) return []

    const seen = new Set()
    const credits = []
    for (const relation of relations) {
        if (!relation || relation['target-type'] !== 'artist') continue

        const artist = relation.artist
        if (!artist || !artist.name) continue

        const role = relation.type || 'credited'
        const key = `${artist.name}|${role}`
        if (seen.has(key)) continue

        seen.add(key)
        credits.push({ name: artist.name, role })
        if (credits.length >= MAX_CREDITS) break
    }
    return credits
}

function externalLinks(relations) {
    const links = {}
    if (!Array.isArray(relations)) return links

    for (const relation of relations) {
        if (!relation || relation['target-type'] !== 'url') continue
        if (!LINK_TYPES.has(relation.type) || links[relation.type]) continue

        const resource = relation.url && relation.url.resource
        if (resource) links[relation.type] = resource
    }
    return links
}

// Artists as identities rather than a joined display string, so two spellings
// of one name stop counting as two artists.
function creditedArtists(artistCredit) {
    if (!Array.isArray(artistCredit)) return []

    return artistCredit
        .map((entry) => entry && entry.artist)
        .filter((artist) => artist && artist.name)
        .map((artist) => ({ name: artist.name, id: artist.id || null }))
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
        tags: [],
        disambiguation: null,
        mbDurationMs: null,
        isVideo: null,
        mbArtists: [],
        credits: [],
        links: {},
        mbIsrcs: [],
        coverArtUrl: null
    }
    const recordingId = asMbid(recording && recording.id)
    if (!recordingId) return empty

    const group = canonicalReleaseGroup(recording.releases)
    const groupId = group ? asMbid(group.id) : null

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
        mbRecordingId: recordingId,
        originalReleaseDate:
            recording['first-release-date'] || (group ? group['first-release-date'] : null) || null,
        releaseType: group ? group['primary-type'] || null : null,
        releaseSecondaryTypes:
            group && Array.isArray(group['secondary-types']) ? group['secondary-types'] : [],
        genreWeights: genres,
        wikiGenres: genres.map((genre) => genre.name),
        tags: tags.map((tag) => tag.name),
        // MusicBrainz's own note on which recording this is: live, remix,
        // acoustic version, radio edit. The app warns that an ambiguous query
        // can land on a live take, and this is the field that says so outright.
        disambiguation: recording.disambiguation || null,
        // The canonical length, which is worth having next to Deezer's because
        // a wide gap between the two is a wrong match showing itself.
        mbDurationMs: typeof recording.length === 'number' ? recording.length : null,
        isVideo: recording.video === true,
        mbArtists: creditedArtists(recording['artist-credit']),
        credits: productionCredits(recording.relations),
        links: externalLinks(recording.relations),
        // Every code MusicBrainz holds, not only the one Deezer served. A
        // remaster and the pressing it was cut from share an ISRC, so the set
        // is more informative than the single code.
        mbIsrcs: Array.isArray(recording.isrcs) ? recording.isrcs : [],
        coverArtUrl: groupId ? `${COVER_ART_BASE}/${groupId}/front` : null
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
    return asMbid(scored[0].entry.id)
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
    asMbid,
    escapeQuery,
    rankNamed,
    request,
    productionCredits,
    externalLinks
}
