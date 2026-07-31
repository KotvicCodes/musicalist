// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    features,
    extractFeatures,
    emptyFeatures,
    analysis,
    extractAnalysis,
    emptyAnalysis
} = require('../src/api/acousticbrainz.js')
const { response, stubFetch } = require('./helpers.js')

//! Fixtures
// A two-class classifier as the archive actually returns it: `all` holds both
// classes by name, `probability` repeats whichever one won.
const classifier = (positive, negative, positiveP) => ({
    all: { [positive]: positiveP, [negative]: 1 - positiveP },
    probability: positiveP >= 0.5 ? positiveP : 1 - positiveP,
    value: positiveP >= 0.5 ? positive : negative
})

const highlevel = (overrides = {}) => ({
    highlevel: {
        danceability: classifier('danceable', 'not_danceable', 0.47),
        mood_happy: classifier('happy', 'not_happy', 0.121),
        mood_sad: classifier('sad', 'not_sad', 0.057),
        mood_aggressive: classifier('aggressive', 'not_aggressive', 0.949),
        mood_relaxed: classifier('relaxed', 'not_relaxed', 0.018),
        mood_party: classifier('party', 'not_party', 0.737),
        mood_acoustic: classifier('acoustic', 'not_acoustic', 0.008),
        mood_electronic: classifier('electronic', 'not_electronic', 0.51),
        voice_instrumental: classifier('instrumental', 'voice', 0.019),
        ...overrides
    }
})

//! Extraction
test('reads the positive class rather than the winning label', () => {
    // The regression this guards: mood_happy below is 87.9% confident the song
    // is NOT happy. Taking `probability` at face value would report it as one
    // of the happiest tracks in the list.
    const result = extractFeatures(highlevel())

    assert.equal(result.moodHappy, 0.121)
    assert.equal(result.moodAggressive, 0.949)
    assert.equal(result.danceability, 0.47)
    assert.equal(result.instrumental, 0.019)
})

test('recovers the positive class when a submission omits all', () => {
    const result = extractFeatures({
        highlevel: {
            mood_happy: { probability: 0.879, value: 'not_happy' },
            mood_party: { probability: 0.737, value: 'party' }
        }
    })

    assert.equal(result.moodHappy, 0.121)
    assert.equal(result.moodParty, 0.737)
})

test('leaves unknown features null rather than zero', () => {
    // Zero is a real value for every one of these, so a gap filled with it
    // would drag an average down instead of being skipped.
    const result = extractFeatures({ highlevel: { danceability: classifier('danceable', 'x', 0.9) } })

    assert.equal(result.danceability, 0.9)
    assert.equal(result.moodHappy, null)
    assert.equal(result.moodSad, null)
})

test('returns an all-null shape for missing or malformed bodies', () => {
    assert.deepEqual(extractFeatures(null), emptyFeatures())
    assert.deepEqual(extractFeatures({}), emptyFeatures())
    assert.deepEqual(extractFeatures({ highlevel: {} }), emptyFeatures())
    assert.equal(
        Object.values(emptyFeatures()).every((value) => value === null),
        true
    )
})

test('ignores the unreliable genre and gender classifiers', () => {
    const result = extractFeatures(
        highlevel({
            genre_dortmund: classifier('electronic', 'rock', 0.97),
            gender: classifier('male', 'female', 0.94)
        })
    )

    assert.equal('genre_dortmund' in result, false)
    assert.equal('gender' in result, false)
    assert.deepEqual(Object.keys(result).sort(), Object.keys(emptyFeatures()).sort())
})

//! Lookup
test('looks the recording up by its MusicBrainz id', async (t) => {
    const fetch = stubFetch(() => response(highlevel()))
    t.after(fetch.restore)

    const result = await features('f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19')

    assert.match(fetch.calls[0].url, /\/f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19\/high-level$/)
    assert.equal(result.moodHappy, 0.121)
})

test('treats a missing recording as no data, not an error', async (t) => {
    // The archive closed to new submissions in 2022, so a 404 is the ordinary
    // case for anything it never gathered.
    const fetch = stubFetch(() => response({ message: 'Not found' }, { status: 404 }))
    t.after(fetch.restore)

    assert.deepEqual(await features('rec-missing'), emptyFeatures())
})

test('survives a dead connection without throwing', async (t) => {
    const fetch = stubFetch(() => {
        throw new Error('socket hang up')
    })
    t.after(fetch.restore)

    assert.deepEqual(await features('f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19'), emptyFeatures())
})

test('skips the request entirely when there is no recording id', async (t) => {
    const fetch = stubFetch(() => response(highlevel()))
    t.after(fetch.restore)

    assert.deepEqual(await features(null), emptyFeatures())
    assert.equal(fetch.calls.length, 0)
})

//! Deadlines
test('sends a deadline with the request', async (t) => {
    const fetch = stubFetch(() => response(highlevel()))
    t.after(fetch.restore)

    await features('f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19')

    assert.equal(fetch.calls.length, 1)
    assert.ok(fetch.calls[0].options.signal instanceof AbortSignal)
})

//! Classifiers Already In The Payload
test('reads timbre and tonality, which arrive with the moods', () => {
    const extracted = extractFeatures({
        highlevel: {
            timbre: { all: { bright: 0.78, dark: 0.22 }, probability: 0.78, value: 'bright' },
            tonal_atonal: { all: { tonal: 0.94, atonal: 0.06 }, probability: 0.94, value: 'tonal' }
        }
    })

    assert.equal(extracted.timbreBright, 0.78)
    assert.equal(extracted.tonal, 0.94)
})

test('keeps the sign honest on timbre the same way it does on mood', () => {
    // `probability` is confidence in whichever class won, so a dark track would
    // read as overwhelmingly bright if that field were taken at face value.
    const dark = extractFeatures({
        highlevel: { timbre: { all: { bright: 0.12, dark: 0.88 }, probability: 0.88, value: 'dark' } }
    })

    assert.equal(dark.timbreBright, 0.12)
})

test('names the MIREX mood cluster rather than repeating its number', () => {
    const extracted = extractFeatures({
        highlevel: { moods_mirex: { value: 'Cluster5', probability: 0.4 } }
    })

    assert.equal(extracted.moodCluster, 'intense')
})

test('leaves an unrecognised cluster null rather than guessing', () => {
    const extracted = extractFeatures({
        highlevel: { moods_mirex: { value: 'Cluster9', probability: 0.4 } }
    })

    assert.equal(extracted.moodCluster, null)
})

test('ignores the ballroom rhythm classifier', () => {
    // Trained on ballroom styles alone, so it has no way to answer "none of
    // these" and files every rock song as a Quickstep. Same failure as genre.
    const extracted = extractFeatures({
        highlevel: { ismir04_rhythm: { value: 'VienneseWaltz', probability: 0.3 } }
    })

    assert.ok(!('rhythmStyle' in extracted))
    assert.ok(!Object.values(extracted).includes('VienneseWaltz'))
})

test('carries the label fields in the empty shape too', () => {
    assert.equal(emptyFeatures().moodCluster, null)
    assert.ok('moodCluster' in emptyFeatures())
})

//! Low Level Analysis
// The measured half of the archive, as opposed to the classified half.
test('reads the musical key as a key and a scale together', () => {
    const extracted = extractAnalysis({
        tonal: { key_key: 'A', key_scale: 'minor', key_strength: 0.7412 }
    })

    assert.equal(extracted.musicalKey, 'A minor')
    assert.equal(extracted.keyStrength, 0.741)
})

test('leaves the key null when either half is missing', () => {
    assert.equal(extractAnalysis({ tonal: { key_key: 'A' } }).musicalKey, null)
    assert.equal(extractAnalysis({ tonal: { key_scale: 'minor' } }).musicalKey, null)
})

test('reads the tempo, loudness and rhythm measurements', () => {
    const extracted = extractAnalysis({
        rhythm: { bpm: 143.2, beats_count: 812 },
        lowlevel: { average_loudness: 0.91, dynamic_complexity: 3.2 }
    })

    assert.equal(extracted.archiveBpm, 143.2)
    assert.equal(extracted.beatsCount, 812)
    assert.equal(extracted.loudness, 0.91)
    assert.equal(extracted.dynamicComplexity, 3.2)
})

test('returns the empty shape for a missing or bare body', () => {
    assert.deepEqual(extractAnalysis(null), emptyAnalysis())
    assert.deepEqual(extractAnalysis({}), emptyAnalysis())
})

test('asks the low-level endpoint for the recording it was given', async (t) => {
    const fetch = stubFetch(() => response({ tonal: { key_key: 'C', key_scale: 'major' } }))
    t.after(fetch.restore)

    const extracted = await analysis('f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19')

    assert.equal(extracted.musicalKey, 'C major')
    assert.match(fetch.calls[0].url, /f6d2c1a4-7b3e-4c58-9a01-2d5e8b7c4a19\/low-level/)
})

test('skips the low-level request entirely without a recording id', async (t) => {
    const fetch = stubFetch(() => response({}))
    t.after(fetch.restore)

    assert.deepEqual(await analysis(null), emptyAnalysis())
    assert.equal(fetch.calls.length, 0)
})

test('rounds the archive tempo, which arrives to nine decimal places', () => {
    assert.equal(extractAnalysis({ rhythm: { bpm: 140.279327393 } }).archiveBpm, 140.3)
})
