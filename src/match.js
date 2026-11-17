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
//
// Plenty of real titles open with or consist of brackets though: "(Don't Fear)
// The Reaper", "(Sittin' On) The Dock of the Bay", "(Intro)". So position
// decides, not vocabulary: brackets before the first title word are part of
// the title and stay, every bracket after it is a suffix and goes, whatever it
// says (MTV Unplugged, Sped Up, Extended). A title that is nothing but brackets
// is its first bracket, unwrapped and read the same way, so "(Live [Remastered
// 2011])" is "live".
const OPENERS = '([{'
const CLOSERS = ')]}'
const WORD = /[\p{L}\p{N}]/u

const NON_WORD = /[^\p{L}\p{N}]+/gu

// Where the bracket opened at `start` closes, counting nesting; -1 if never.
// Only the matching kind closes a bracket, so "(Part 1]" is left open; a stray
// closer of the wrong kind is just a character.
function closingIndex(text, start) {
    const expected = []
    for (let index = start; index < text.length; index += 1) {
        const opener = OPENERS.indexOf(text[index])
        if (opener !== -1) expected.push(CLOSERS[opener])
        else if (text[index] === expected[expected.length - 1]) {
            expected.pop()
            if (expected.length === 0) return index
        }
    }
    return -1
}

// Top-level runs of plain text and bracketed groups; an opener that never
// closes is just a character.
function segments(text) {
    const parts = []
    let plain = ''
    let index = 0

    while (index < text.length) {
        const end = OPENERS.includes(text[index]) ? closingIndex(text, index) : -1
        if (end === -1) {
            plain += text[index]
            index += 1
            continue
        }
        if (plain) parts.push({ bracketed: false, text: plain })
        plain = ''
        parts.push({ bracketed: true, text: text.slice(index + 1, end) })
        index = end + 1
    }
    if (plain) parts.push({ bracketed: false, text: plain })

    return parts
}

function titleOf(text) {
    const parts = segments(text)
    const titleStart = parts.findIndex((part) => !part.bracketed && WORD.test(part.text))

    if (titleStart === -1) {
        const first = parts.find((part) => part.bracketed)
        return first ? titleOf(first.text) : text
    }

    return parts
        .filter((part, index) => !part.bracketed || index < titleStart)
        .map((part) => part.text)
        .join(' ')
}

function normalise(value) {
    const folded = String(value ?? '')
        .normalize('NFD')
        .replace(DIACRITICS, '')
        .toLowerCase()

    return titleOf(folded).replace(NON_WORD, ' ').trim()
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
