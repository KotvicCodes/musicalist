// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { pickBestHit, scoreHit, confidenceOf, normalise } = require('../src/match.js')

//! Helpers
const hit = (title, artist, id = 1) => ({ id, title, artist: { name: artist } })

//! Normalisation
test('folds case, diacritics and punctuation', () => {
    assert.equal(normalise('Antonín Dvořák'), 'antonin dvorak')
    assert.equal(normalise('Hey, Soul Sister!'), 'hey soul sister')
    assert.equal(normalise("Don't Stop Me Now"), 'don t stop me now')
})

test('drops the bracketed edition markers', () => {
    // which pressing this is, not which song; MusicBrainz settles that question
    assert.equal(normalise('Bohemian Rhapsody (Remastered 2011)'), 'bohemian rhapsody')
    assert.equal(normalise('Creep [Live]'), 'creep')
})

//! Scoring
test('scores an exact title and artist at the top', () => {
    assert.equal(scoreHit('Bohemian Rhapsody Queen', hit('Bohemian Rhapsody', 'Queen')), 1)
})

test('scores a title-only query at the top too', () => {
    // asking for a song without naming the artist is the ordinary case, not a
    // weak match
    assert.equal(scoreHit('Bohemian Rhapsody', hit('Bohemian Rhapsody', 'Queen')), 1)
})

test('is unmoved by an edition marker', () => {
    assert.equal(scoreHit('Bohemian Rhapsody', hit('Bohemian Rhapsody (Remastered 2011)', 'Queen')), 1)
})

test('marks down a hit padded with words nobody asked about', () => {
    const cover = scoreHit('Creep', hit('Creep Acoustic Guitar Tribute Version', 'Studio Band'))
    const real = scoreHit('Creep', hit('Creep', 'Radiohead'))

    assert.ok(cover < real)
})

test('marks down a query the hit does not account for', () => {
    assert.ok(scoreHit('Bohemian Rhapsody', hit('Radio Ga Ga', 'Queen')) < 0.5)
})

//! Picking
test('takes the best hit rather than the first', () => {
    const best = pickBestHit('Billie Jean Michael Jackson', [
        hit('Billie Jean Karaoke Tribute', 'Party Hits', 1),
        hit('Billie Jean', 'Michael Jackson', 2)
    ])

    assert.equal(best.hit.id, 2)
    assert.equal(best.confidence, 'high')
})

test('keeps Deezer ordering when two hits score the same', () => {
    const best = pickBestHit('Creep', [hit('Creep', 'Radiohead', 1), hit('Creep', 'TLC', 2)])
    assert.equal(best.hit.id, 1)
})

test('refuses everything on offer when nothing answers the query', () => {
    // Deezer always returns its closest guess, so a nonsense query still gets a
    // confident wrong song unless something says no.
    assert.equal(pickBestHit('asdkjhaskdjh', [hit('Bohemian Rhapsody', 'Queen')]), null)
})

test('flags a near miss rather than refusing it', () => {
    const best = pickBestHit('Bohemain Rhapsody', [hit('Bohemian Rhapsody', 'Queen')])

    assert.ok(best)
    assert.equal(best.confidence, 'low')
})

test('handles an empty or malformed candidate list', () => {
    assert.equal(pickBestHit('Anything', []), null)
    assert.equal(pickBestHit('Anything', null), null)
    assert.equal(pickBestHit('Anything', [null, undefined]), null)
})

test('survives a hit with no title or artist', () => {
    assert.equal(pickBestHit('Anything', [{ id: 1 }]), null)
})

//! Confidence
test('names the three bands', () => {
    assert.equal(confidenceOf(1), 'high')
    assert.equal(confidenceOf(0.85), 'high')
    assert.equal(confidenceOf(0.7), 'medium')
    assert.equal(confidenceOf(0.5), 'low')
})
