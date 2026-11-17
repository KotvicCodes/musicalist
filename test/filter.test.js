// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { filterRows } = require('../src/filter.js')
const { songRow } = require('./helpers.js')

//! Fixtures
const foundClean = songRow({
    query: 'Bohemian Rhapsody',
    title: 'Bohemian Rhapsody',
    author: 'Queen',
    album: 'A Night at the Opera',
    label: 'EMI',
    musicalKey: 'Bb major',
    disambiguation: null,
    matchConfidence: 'high',
    durationDisagrees: false,
    wikiGenres: ['progressive rock', 'opera rock'],
    deezerGenres: ['Rock'],
    tags: ['70s', 'classic']
})

const foundLowConfidence = songRow({
    query: 'Wonderwall Live',
    title: 'Wonderwall',
    author: 'Oasis',
    album: '(What’s the Story) Morning Glory?',
    label: 'Creation',
    musicalKey: 'F# minor',
    disambiguation: null,
    matchConfidence: 'low',
    durationDisagrees: false,
    wikiGenres: ['britpop'],
    deezerGenres: ['Alternative'],
    tags: ['90s']
})

const foundDurationMismatch = songRow({
    query: 'Heroes',
    title: 'Heroes',
    author: 'David Bowie',
    album: '“Heroes”',
    label: 'RCA',
    musicalKey: 'D major',
    disambiguation: null,
    matchConfidence: 'high',
    durationDisagrees: true,
    wikiGenres: ['art rock'],
    deezerGenres: ['Rock'],
    tags: ['berlin']
})

const foundDisambiguated = songRow({
    query: 'Smells Like Teen Spirit',
    title: 'Smells Like Teen Spirit',
    author: 'Nirvana',
    album: 'Nevermind',
    label: 'DGC',
    musicalKey: 'F minor',
    disambiguation: '2021 remaster',
    matchConfidence: 'high',
    durationDisagrees: false,
    wikiGenres: ['grunge'],
    deezerGenres: ['Rock'],
    tags: ['seattle']
})

const missedRow = {
    query: 'Nonexistent Garage Demo 1994',
    found: false
}

const sampleRows = [foundClean, foundLowConfidence, foundDurationMismatch, foundDisambiguated, missedRow]

//! Status Filtering
test('returns all rows by default', () => {
    assert.deepEqual(filterRows(sampleRows), sampleRows)
    assert.deepEqual(filterRows(sampleRows, { status: 'all' }), sampleRows)
})

test('filters to found rows only', () => {
    assert.deepEqual(filterRows(sampleRows, { status: 'found' }), [
        foundClean,
        foundLowConfidence,
        foundDurationMismatch,
        foundDisambiguated
    ])
})

test('filters to missed rows only', () => {
    assert.deepEqual(filterRows(sampleRows, { status: 'missed' }), [missedRow])
})

test('filters to rows worth checking across confidence, duration and disambiguation', () => {
    assert.deepEqual(filterRows(sampleRows, { status: 'check' }), [
        foundLowConfidence,
        foundDurationMismatch,
        foundDisambiguated
    ])
})

//! Text Search Across Fields
test('matches query, title, author, album, label, key and disambiguation case-insensitively', () => {
    assert.deepEqual(filterRows(sampleRows, { query: 'garage demo' }), [missedRow])
    assert.deepEqual(filterRows(sampleRows, { query: 'RHAPSODY' }), [foundClean])
    assert.deepEqual(filterRows(sampleRows, { query: 'bowie' }), [foundDurationMismatch])
    assert.deepEqual(filterRows(sampleRows, { query: 'morning glory' }), [foundLowConfidence])
    assert.deepEqual(filterRows(sampleRows, { query: 'creation' }), [foundLowConfidence])
    assert.deepEqual(filterRows(sampleRows, { query: 'f# minor' }), [foundLowConfidence])
    assert.deepEqual(filterRows(sampleRows, { query: 'remaster' }), [foundDisambiguated])
})

test('matches across wikiGenres, deezerGenres and tags', () => {
    assert.deepEqual(filterRows(sampleRows, { query: 'britpop' }), [foundLowConfidence])
    assert.deepEqual(filterRows(sampleRows, { query: 'alternative' }), [foundLowConfidence])
    assert.deepEqual(filterRows(sampleRows, { query: 'seattle' }), [foundDisambiguated])
})

test('combines status and text query together', () => {
    assert.deepEqual(filterRows(sampleRows, { status: 'check', query: 'rock' }), [
        foundDurationMismatch,
        foundDisambiguated
    ])
    assert.deepEqual(filterRows(sampleRows, { status: 'missed', query: 'queen' }), [])
})

//! Edge Cases
test('handles empty, nullish or malformed inputs gracefully', () => {
    assert.deepEqual(filterRows(null), [])
    assert.deepEqual(filterRows(undefined, null), [])
    assert.deepEqual(filterRows([], { status: 'found', query: 'rock' }), [])
    assert.deepEqual(filterRows([null, foundClean], { status: 'all' }), [foundClean])
})

test('does not match literal "null" or "undefined" against missing fields', () => {
    assert.deepEqual(filterRows([foundClean, missedRow], { query: 'null' }), [])
    assert.deepEqual(filterRows([foundClean, missedRow], { query: 'undefined' }), [])
})
