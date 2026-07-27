// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { features, extractFeatures, emptyFeatures } = require('../src/api/acousticbrainz.js')
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

    const result = await features('rec-1')

    assert.match(fetch.calls[0].url, /\/rec-1\/high-level$/)
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

    assert.deepEqual(await features('rec-1'), emptyFeatures())
})

test('skips the request entirely when there is no recording id', async (t) => {
    const fetch = stubFetch(() => response(highlevel()))
    t.after(fetch.restore)

    assert.deepEqual(await features(null), emptyFeatures())
    assert.equal(fetch.calls.length, 0)
})
