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
    instrumental: ['voice_instrumental', 'instrumental'],
    // Bright against dark, and tonal against atonal. Both are two-class models
    // in the same response as the moods, read the same way, and neither falls
    // under the exclusion below: they describe the sound rather than trying to
    // name a category the model was never trained broadly enough to name.
    timbreBright: ['timbre', 'bright'],
    tonal: ['tonal_atonal', 'tonal']
}

// Multi-class models, where the answer is which label won rather than a
// probability, so they cannot be read out of `all` the way the two-class models
// above are.
const LABELS = {
    moodCluster: 'moods_mirex'
}

// MIREX names its classes Cluster1 to Cluster5, which says nothing on its own.
// These are the adjectives each cluster was trained on, reduced to the one that
// carries the group.
const MOOD_CLUSTERS = {
    Cluster1: 'rousing',
    Cluster2: 'cheerful',
    Cluster3: 'wistful',
    Cluster4: 'quirky',
    Cluster5: 'intense'
}

// The genre and gender classifiers are deliberately not read. They are trained
// on small sets and are visibly unreliable: the archive files "Smells Like Teen
// Spirit" as trance. MusicBrainz already supplies real genres with community
// vote weights, so a worse second opinion would only muddy them.
//
// ismir04_rhythm is excluded for the same reason, and it is worth naming because
// it looks useful at a glance. Its classes are ballroom dance styles, and it was
// trained on nothing else, so it has no way to answer "none of these": every
// rock song in a list comes back as a Quickstep or a Viennese Waltz. That is the
// trance problem again, wearing a different label.

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

//! Extraction
// Absent data has to look exactly like Deezer's missing BPM: null, never zero.
// Zero is a real value for every one of these fields, so filling a gap with it
// would quietly drag any average toward the floor.
function emptyFeatures() {
    const empty = {}
    for (const key of Object.keys(FEATURES)) empty[key] = null
    for (const key of Object.keys(LABELS)) empty[key] = null
    return empty
}

function extractFeatures(body) {
    const highlevel = body && body.highlevel
    if (!highlevel) return emptyFeatures()

    const features = emptyFeatures()

    for (const [field, classifier] of Object.entries(LABELS)) {
        const entry = highlevel[classifier]
        if (entry && typeof entry.value === 'string') {
            features[field] = MOOD_CLUSTERS[entry.value] || null
        }
    }

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
async function features(mbRecordingId, signal) {
    if (!mbRecordingId) return emptyFeatures()

    const body = await request(`${API_BASE}/${encodeURIComponent(mbRecordingId)}/high-level`, signal)
    return extractFeatures(body)
}

//! Export
module.exports = { features, extractFeatures, emptyFeatures, FEATURES, LABELS }
