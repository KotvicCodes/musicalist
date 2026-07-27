// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { toCsv, toJson, escapeCell, COLUMNS } = require('../src/export.js')
const { summarise } = require('../src/analysis.js')
const { songRow } = require('./helpers.js')

//! Helpers
// Strips the BOM and splits into records, so the assertions read cleanly.
const lines = (csv) => csv.replace(/^﻿/, '').trimEnd().split('\r\n')

//! Cells
test('leaves plain values alone', () => {
    assert.equal(escapeCell('Queen'), 'Queen')
    assert.equal(escapeCell(42), '42')
    assert.equal(escapeCell(null), '')
    assert.equal(escapeCell(undefined), '')
})

test('renders booleans and arrays predictably', () => {
    assert.equal(escapeCell(true), 'true')
    assert.equal(escapeCell(false), 'false')
    assert.equal(escapeCell(['rock', 'pop']), 'rock; pop')
    assert.equal(escapeCell([]), '')
})

test('quotes cells containing a comma, a quote or a newline', () => {
    assert.equal(escapeCell('Hello, Goodbye'), '"Hello, Goodbye"')
    assert.equal(escapeCell('Say "Hello"'), '"Say ""Hello"""')
    assert.equal(escapeCell('Line\nBreak'), '"Line\nBreak"')
})

//! CSV
test('writes a header row matching the column list', () => {
    const [header] = lines(toCsv([]))
    assert.equal(header, COLUMNS.map(([name]) => name).join(','))
})

test('starts with a BOM so Excel reads it as UTF-8', () => {
    assert.ok(toCsv([songRow({ author: 'Antonín Dvořák' })].slice()).startsWith('﻿'))
})

test('writes one record per song', () => {
    const rows = lines(toCsv([songRow(), songRow({ query: 'Billie Jean' })]))
    assert.equal(rows.length, 3)
})

test('a title with a comma and a quote survives the round trip', () => {
    const csv = toCsv([songRow({ title: 'Hello, "World"' })])
    const record = lines(csv)[1]

    assert.ok(record.includes('"Hello, ""World"""'))

    // and reading it back gives the original string
    const match = record.match(/"((?:[^"]|"")*)"/)
    assert.equal(match[1].replace(/""/g, '"'), 'Hello, "World"')
})

test('flattens genres and artists into single cells', () => {
    const record = lines(toCsv([songRow()]))[1]

    assert.ok(record.includes('rock; hard rock'))
    assert.ok(record.includes('Queen'))
})

test('carries the BPM column, blank where Deezer has none', () => {
    const header = lines(toCsv([]))[0].split(',')
    const index = header.indexOf('bpm')
    assert.ok(index >= 0)

    assert.equal(lines(toCsv([songRow({ bpm: 143.9 })]))[1].split(',')[index], '143.9')
    assert.equal(lines(toCsv([songRow({ bpm: null })]))[1].split(',')[index], '')
})

test('exports a missed song as an empty-but-present row', () => {
    const record = lines(toCsv([{ query: 'Nonsense', found: false }]))[1]

    assert.ok(record.startsWith('Nonsense,false,'))
})

test('handles non-array input', () => {
    assert.equal(lines(toCsv(undefined)).length, 1)
})

//! JSON
test('bundles songs and the summary together', () => {
    const rows = [songRow(), songRow({ found: false })]
    const parsed = JSON.parse(toJson(rows, summarise(rows)))

    assert.equal(parsed.songs.length, 2)
    assert.equal(parsed.summary.found, 1)
    assert.match(parsed.source, /Deezer/)
    assert.ok(!Number.isNaN(Date.parse(parsed.exportedAt)))
})

test('keeps every field of the song record', () => {
    const parsed = JSON.parse(toJson([songRow()], null))

    assert.equal(parsed.songs[0].isrc, 'GBUM71029604')
    assert.equal(parsed.songs[0].originalReleaseDate, '1975-11-21')
    assert.deepEqual(parsed.songs[0].genreWeights[0], { name: 'rock', count: 13 })
    assert.equal(parsed.summary, null)
})

//! Audio Features
test('exports each mood as its own column', () => {
    const csv = toCsv([songRow({ danceability: 0.82, moodAggressive: 0.95, moodHappy: 0.12 })])
    const [header, row] = csv.replace(/^﻿/, '').trim().split('\r\n')

    const columns = header.split(',')
    const values = row.split(',')
    const read = (name) => values[columns.indexOf(name)]

    assert.equal(read('danceability'), '0.82')
    assert.equal(read('moodAggressive'), '0.95')
    assert.equal(read('moodHappy'), '0.12')
})

test('leaves an unanalysed song blank rather than zero', () => {
    // 0 is a real danceability score, so writing it for missing data would be
    // indistinguishable from a song the archive scored at the floor.
    const csv = toCsv([songRow({ danceability: null, moodHappy: null })])
    const [header, row] = csv.replace(/^﻿/, '').trim().split('\r\n')

    const columns = header.split(',')
    const values = row.split(',')

    assert.equal(values[columns.indexOf('danceability')], '')
    assert.equal(values[columns.indexOf('moodHappy')], '')
})

test('names AcousticBrainz as a source in the JSON export', () => {
    const parsed = JSON.parse(toJson([songRow()], null))

    assert.match(parsed.source, /AcousticBrainz/)
})
