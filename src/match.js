// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Why
// Deezer answers every search with its closest guess and never says how close
// that was. Taking the top hit unread meant a misspelled query, or a song Deezer
// does not carry, came back as a different song marked found, presented exactly
// like a right one. Scoring the top few hits against what was actually asked for
// picks better, and says how sure it is so the row can admit when it is not.

//! Normalisation
const DIACRITICS = /[̀-ͯ]/g

// Edition markers live in brackets: (Remastered 2011), [Live], (feat. X). They
// say which pressing this is, not which song, and MusicBrainz is what settles
// the pressing question. Dropping them makes the comparison about identity.
const BRACKETED = /[([{][^)\]}]*[)\]}]/g

const NON_WORD = /[^\p{L}\p{N}]+/gu

function normalise(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(DIACRITICS, '')
        .toLowerCase()
        .replace(BRACKETED, ' ')
        .replace(NON_WORD, ' ')
        .trim()
}

function tokenise(value) {
    const text = normalise(value)
    return new Set(text ? text.split(' ') : [])
}

// What fraction of `needles` appears in `haystack`.
function overlap(needles, haystack) {
    if (needles.size === 0) return 0

    let found = 0
    for (const token of needles) {
        if (haystack.has(token)) found += 1
    }
    return found / needles.size
}

//! Scoring
// Two questions, weighted. Does the hit account for what was asked for, which
// is what catches a different song entirely; and is the hit's own title
// accounted for by the query, which catches a hit padded with words nobody
// asked about, the shape a cover or a medley takes.
const COVERAGE_WEIGHT = 0.75
const TIGHTNESS_WEIGHT = 0.25

function scoreHit(query, hit) {
    const asked = tokenise(query)
    const title = tokenise(hit && hit.title)
    const artist = tokenise(hit && hit.artist && hit.artist.name)
    const offered = new Set([...title, ...artist])

    const coverage = overlap(asked, offered)
    const tightness = overlap(title, asked)

    return Math.round((coverage * COVERAGE_WEIGHT + tightness * TIGHTNESS_WEIGHT) * 100) / 100
}

//! Confidence
// Below the floor, no answer is the honest one: a confident wrong song is worse
// than a row saying nothing was found, because only one of the two is visible
// as a problem.
const MATCH_FLOOR = 0.34

const HIGH = 0.85
const MEDIUM = 0.6

function confidenceOf(score) {
    if (score >= HIGH) return 'high'
    if (score >= MEDIUM) return 'medium'
    return 'low'
}

//! Picking
// Ties keep Deezer's own ordering, which is a better tiebreak than anything
// derivable from the title alone.
function pickBestHit(query, hits) {
    if (!Array.isArray(hits) || hits.length === 0) return null

    let best = null
    for (const hit of hits) {
        if (!hit) continue
        const score = scoreHit(query, hit)
        if (!best || score > best.score) best = { hit, score }
    }

    if (!best || best.score < MATCH_FLOOR) return null
    return { ...best, confidence: confidenceOf(best.score) }
}

//! Export
module.exports = { pickBestHit, scoreHit, confidenceOf, normalise, MATCH_FLOOR }
