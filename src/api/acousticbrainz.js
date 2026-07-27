// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const API_BASE = 'https://acousticbrainz.org/api/v1'

const { version } = require('../../package.json')
const USER_AGENT = `Musicalist/${version} ( https://github.com/KotvicCodes/Musicalist )`

// AcousticBrainz publishes no rate limit, but it is a volunteer archive and
// this only ever runs behind the MusicBrainz lookup, which already spaces
// itself a second apart. The gap below is a floor that in practice never
// binds; it exists so a future caller cannot accidentally hammer the service.
const MIN_GAP_MS = 250

// Same reasoning as the other two clients: Node's fetch has no deadline of its
// own, and mood is the most optional data in the app, so a slow answer should
// cost the row its mood rather than cost the run its progress.
const REQUEST_TIMEOUT_MS = 10000

// Every classifier is a two-class model, and `all` carries the probability of
// each class by name. Reading the positive class straight out of `all` is what
// keeps the sign honest: the sibling `probability` field is confidence in
// whichever label won, so a track that is 88% *not* happy reports 0.879 there
// and would read as overwhelmingly happy if taken at face value.
const FEATURES = {
    danceability: ['danceability', 'danceable'],
    moodHappy: ['mood_happy', 'happy'],
    moodSad: ['mood_sad', 'sad'],
    moodAggressive: ['mood_aggressive', 'aggressive'],
    moodRelaxed: ['mood_relaxed', 'relaxed'],
    moodParty: ['mood_party', 'party'],
    moodAcoustic: ['mood_acoustic', 'acoustic'],
    moodElectronic: ['mood_electronic', 'electronic'],
    instrumental: ['voice_instrumental', 'instrumental']
}

// The genre and gender classifiers are deliberately not read. They are trained
// on small sets and are visibly unreliable: the archive files "Smells Like Teen
// Spirit" as trance. MusicBrainz already supplies real genres with community
// vote weights, so a worse second opinion would only muddy them.

//! Helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Three decimals is well past the point where these models are meaningful and
// keeps the exported spreadsheet readable.
function round(value) {
    return Math.round(value * 1000) / 1000
}

//! Throttle
let queue = Promise.resolve()
let lastRequestAt = 0

function throttled(task) {
    const run = queue.then(async () => {
        const wait = lastRequestAt + MIN_GAP_MS - Date.now()
        if (wait > 0) await sleep(wait)
        lastRequestAt = Date.now()
        return task()
    })

    queue = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

//! Request
// Same contract as the MusicBrainz client: a song without mood data is still a
// useful row, so every failure resolves to null instead of throwing. A 404 is
// the ordinary case here rather than an error, since the archive only holds
// what volunteers submitted before it closed to new data.
async function request(url) {
    return throttled(async () => {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            })
            if (!response.ok) return null
            return await response.json()
        } catch {
            return null
        }
    })
}

//! Extraction
// Absent data has to look exactly like Deezer's missing BPM: null, never zero.
// Zero is a real value for every one of these fields, so filling a gap with it
// would quietly drag any average toward the floor.
function emptyFeatures() {
    const empty = {}
    for (const key of Object.keys(FEATURES)) empty[key] = null
    return empty
}

function extractFeatures(body) {
    const highlevel = body && body.highlevel
    if (!highlevel) return emptyFeatures()

    const features = emptyFeatures()
    for (const [field, [classifier, positive]] of Object.entries(FEATURES)) {
        const entry = highlevel[classifier]
        if (!entry) continue

        const all = entry.all
        if (all && typeof all[positive] === 'number') {
            features[field] = round(all[positive])
            continue
        }

        // Older submissions occasionally omit `all`. The label still says which
        // class won, so the positive probability is recoverable from it.
        if (typeof entry.probability === 'number' && typeof entry.value === 'string') {
            features[field] = round(entry.value === positive ? entry.probability : 1 - entry.probability)
        }
    }

    return features
}

//! Public Lookup
// Keyed by the MusicBrainz recording ID, which the enrichment step has already
// resolved, so this costs one request and no extra matching. Picking the wrong
// recording upstream is not a soft failure here: a remaster and its original
// are separate IDs, and the archive almost always holds only the original.
async function features(mbRecordingId) {
    if (!mbRecordingId) return emptyFeatures()

    const body = await request(`${API_BASE}/${encodeURIComponent(mbRecordingId)}/high-level`)
    return extractFeatures(body)
}

//! Export
module.exports = { features, extractFeatures, emptyFeatures, FEATURES }
