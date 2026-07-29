// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { songCard, summaryCells } = require('../src/song-card.js')
const { summarise } = require('../src/analysis.js')
const { songRow } = require('./helpers.js')

//! Helpers
const cells = (rows) => summaryCells(summarise(rows)).join('')

//! Escaping
// This is the whole reason these functions are worth testing. MusicBrainz
// genres and tags are community editable and land here as HTML, and index.html
// describes its CSP as the backstop for the day one of them is not escaped.
test('escapes a title that carries markup', () => {
    const html = songCard(songRow({ title: '<img src=x onerror=alert(1)>' }))

    assert.ok(!html.includes('<img'))
    assert.ok(html.includes('&lt;img'))
})

test('escapes a community-editable tag and genre', () => {
    const html = songCard(
        songRow({ tags: ['<script>alert(1)</script>'], wikiGenres: ['"><script>x</script>'] })
    )

    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
})

test('escapes a production credit and a label', () => {
    const html = songCard(
        songRow({
            credits: [{ name: '<b>Roy</b>', role: 'producer' }],
            label: '<i>EMI</i>'
        })
    )

    assert.ok(!html.includes('<b>'))
    assert.ok(!html.includes('<i>'))
})

test('escapes the query echoed back on a missed song', () => {
    const html = songCard({ query: '<script>alert(1)</script>', found: false })

    assert.ok(!html.includes('<script>'))
})

test('escapes a MusicBrainz disambiguation note', () => {
    const html = songCard(songRow({ disambiguation: '<svg onload=alert(1)>' }))

    assert.ok(!html.includes('<svg'))
})

test('escapes labels and values in the summary', () => {
    const html = cells([songRow({ label: '<script>alert(1)</script>', wikiGenres: ['<b>rock</b>'] })])

    assert.ok(!html.includes('<script>'))
    assert.ok(!html.includes('<b>rock'))
})

//! Missed Songs
test('a missed song says so instead of showing empty fields', () => {
    const html = songCard({ query: 'asdkjhaskdjh', found: false })

    assert.ok(html.includes('song--missed'))
    assert.ok(html.includes('Not found on Deezer'))
})

test('a failed song shows why it failed', () => {
    const html = songCard({ query: 'One', found: false, error: 'Deezer did not answer in time.' })

    assert.ok(html.includes('Deezer did not answer in time.'))
})

//! Gaps
test('shows an em dash for every field the sources had nothing for', () => {
    const html = songCard(
        songRow({
            bpm: null,
            musicalKey: null,
            gainDb: null,
            listenCount: null,
            popularity: null,
            credits: [],
            disambiguation: null,
            durationDisagrees: null
        })
    )

    // one per empty row, rather than a blank cell that reads as a real value
    assert.ok(html.includes('—'))
    assert.ok(!html.includes('null'))
    assert.ok(!html.includes('undefined'))
})

test('never prints a zero as if it were missing data', () => {
    // 0 is a real gain, a real danceability and a real listen count
    const html = songCard(songRow({ gainDb: 0, danceability: 0, listenCount: 0 }))

    assert.ok(html.includes('0 dB'))
    assert.ok(html.includes('0% danceable'))
})

//! New Fields
test('shows tempo, key and gain on one line', () => {
    const html = songCard(songRow({ bpm: 143.9, musicalKey: 'B flat major', gainDb: -8.2 }))

    assert.ok(html.includes('144 BPM'))
    assert.ok(html.includes('B flat major'))
    assert.ok(html.includes('-8.2 dB'))
})

test('says when the tempo came from the archive rather than Deezer', () => {
    const fromArchive = songCard(songRow({ bpm: 143.2, bpmSource: 'acousticbrainz' }))
    const fromDeezer = songCard(songRow({ bpm: 143.9, bpmSource: 'deezer' }))

    assert.ok(fromArchive.includes('(archive)'))
    assert.ok(!fromDeezer.includes('(archive)'))
})

test('shows both popularity signals without conflating them', () => {
    const html = songCard(songRow({ listenCount: 91_204, popularity: 892_145 }))

    assert.ok(html.includes('ListenBrainz'))
    assert.ok(html.includes('Deezer rank'))
})

test('shows the version note and the length MusicBrainz disagrees with', () => {
    const html = songCard(
        songRow({ disambiguation: 'live', durationDisagrees: true, mbDurationMs: 412_000 })
    )

    assert.ok(html.includes('live'))
    assert.ok(html.includes('6:52'))
})

test('flags a loose match and leaves a confident one alone', () => {
    const loose = songCard(songRow({ matchConfidence: 'low', query: 'Bohemain Rhapsody' }))
    const confident = songCard(songRow({ matchConfidence: 'high' }))

    assert.ok(loose.includes('Worth checking'))
    assert.ok(!confident.includes('Worth checking'))
})

test('puts the label on the album line', () => {
    assert.ok(songCard(songRow({ label: 'EMI' })).includes('EMI'))
})

//! Summary
test('reports the new dimensions once there is data for them', () => {
    const html = cells([
        songRow({ musicalKey: 'A minor', gainDb: -8.2, listenCount: 91_204, label: 'EMI' }),
        songRow({ query: 'Two', musicalKey: 'A minor', gainDb: -7.4, listenCount: 400, label: 'EMI' })
    ])

    assert.ok(html.includes('Common key'))
    assert.ok(html.includes('A minor'))
    assert.ok(html.includes('Master loudness'))
    assert.ok(html.includes('Median listens'))
    assert.ok(html.includes('Top label'))
})

test('leaves out a cell the list has no data for', () => {
    const html = cells([songRow({ musicalKey: null, gainDb: null, listenCount: null, label: null })])

    assert.ok(!html.includes('Common key'))
    assert.ok(!html.includes('Master loudness'))
    assert.ok(!html.includes('Median listens'))
    assert.ok(!html.includes('Top label'))
})

test('counts the songs that are not the original recording', () => {
    const html = cells([songRow({ disambiguation: 'live' }), songRow({ query: 'Two' })])

    assert.ok(html.includes('Not the original'))
    assert.ok(html.includes('1 song'))
})

test('counts the rows the two catalogues disagree about', () => {
    const html = cells([songRow({ durationDisagrees: true }), songRow({ query: 'Two' })])

    assert.ok(html.includes('Worth checking'))
})

test('counts collaborations from the credited role', () => {
    const html = cells([
        songRow({
            artists: [
                { name: 'Queen', role: 'Main' },
                { name: 'David Bowie', role: 'Featured' }
            ]
        })
    ])

    assert.ok(html.includes('Collaborations'))
})

test('an empty list yields the song count and nothing else', () => {
    const empty = summaryCells(summarise([]))

    assert.equal(empty.length, 1)
    assert.ok(empty[0].includes('Songs'))
})
