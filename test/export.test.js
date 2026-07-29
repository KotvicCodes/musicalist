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

//! Formula Injection
// MusicBrainz tags and genres are community editable and land in this file
// unaltered, so a tag is an input to whatever spreadsheet opens it.
test('defuses a cell a spreadsheet would evaluate as a formula', () => {
    // quoting still applies on top, since this one carries commas and quotes
    assert.equal(
        escapeCell('=HYPERLINK("http://evil","Play")'),
        '"\'=HYPERLINK(""http://evil"",""Play"")"'
    )
    assert.equal(escapeCell('+1+1'), "'+1+1")
    assert.equal(escapeCell('@SUM(A1:A9)'), "'@SUM(A1:A9)")
    assert.equal(escapeCell("-2+3+cmd|' /c calc'!A0"), "'-2+3+cmd|' /c calc'!A0")
})

test('defuses a formula smuggled in through a genre list', () => {
    assert.equal(escapeCell(['=1+1', 'rock']), "'=1+1; rock")
})

test('defuses leading whitespace a spreadsheet would skip past', () => {
    assert.equal(escapeCell('\t=1+1'), "'\t=1+1")
    assert.equal(escapeCell('\r=1+1'), '"\'\r=1+1"')
})

test('leaves a negative number usable as a number', () => {
    // gain is reported in negative decibels, so quoting these would turn a real
    // column into text and break any sum drawn from it.
    assert.equal(escapeCell(-8.2), '-8.2')
    assert.equal(escapeCell('-12'), '-12')
})

test('still defuses text that merely opens like a negative number', () => {
    assert.equal(escapeCell('-Ame-'), "'-Ame-")
    assert.equal(escapeCell('-1+1'), "'-1+1")
})

test('a defused cell survives the round trip through a row', () => {
    const csv = toCsv([songRow({ tags: ['=1+1'], title: '@Home' })])
    const row = lines(csv)[1]

    assert.ok(row.includes("'=1+1"))
    assert.ok(row.includes("'@Home"))
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
