// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants

// Column order is deliberate: what you searched for, what came back, then the
// catalogue facts, then the analysis fields.
const COLUMNS = [
    ['query', (row) => row.query],
    ['found', (row) => row.found],
    ['title', (row) => row.title],
    ['author', (row) => row.author],
    ['artists', (row) => (row.artists || []).map((artist) => artist.name)],
    ['album', (row) => row.album],
    ['albumType', (row) => row.albumType],
    ['albumTotalTracks', (row) => row.albumTotalTracks],
    ['deezerReleaseDate', (row) => (row.releaseDate || [])[0] || null],
    ['releaseDatePrecision', (row) => row.releaseDatePrecision],
    ['originalReleaseDate', (row) => row.originalReleaseDate],
    ['releaseType', (row) => row.releaseType],
    ['releaseSecondaryTypes', (row) => row.releaseSecondaryTypes],
    ['durationMs', (row) => row.durationMs],
    ['bpm', (row) => row.bpm],
    // Probabilities from 0 to 1, blank where AcousticBrainz has no analysis for
    // the recording. Blank rather than 0, which is a real score here.
    ['danceability', (row) => row.danceability],
    ['moodHappy', (row) => row.moodHappy],
    ['moodSad', (row) => row.moodSad],
    ['moodAggressive', (row) => row.moodAggressive],
    ['moodRelaxed', (row) => row.moodRelaxed],
    ['moodParty', (row) => row.moodParty],
    ['moodAcoustic', (row) => row.moodAcoustic],
    ['moodElectronic', (row) => row.moodElectronic],
    ['instrumental', (row) => row.instrumental],
    ['explicit', (row) => row.explicit],
    ['trackNumber', (row) => row.trackNumber],
    ['discNumber', (row) => row.discNumber],
    ['isrc', (row) => row.isrc],
    ['deezerGenres', (row) => row.deezerGenres],
    ['musicbrainzGenres', (row) => row.wikiGenres],
    ['tags', (row) => row.tags],
    ['deezerUrl', (row) => row.deezerUrl],
    ['coverArt', (row) => row.coverArt],
    ['mbRecordingId', (row) => row.mbRecordingId],
    ['error', (row) => row.error || null]
]

// Arrays collapse into one cell; semicolons keep them readable next to the
// comma the format itself uses.
const LIST_SEPARATOR = '; '

// Excel assumes the system codepage unless a UTF-8 BOM says otherwise, which
// mangles accented artist names.
const BOM = '﻿'

//! Cell Serialisation
function toCell(value) {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) return value.join(LIST_SEPARATOR)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
}

// RFC 4180: quote anything containing a delimiter, a quote or a line break, and
// double up any embedded quotes.
function escapeCell(value) {
    const cell = toCell(value)
    if (!/[",\r\n]/.test(cell)) return cell
    return `"${cell.replace(/"/g, '""')}"`
}

//! CSV
function toCsv(rows) {
    const all = Array.isArray(rows) ? rows : []
    const header = COLUMNS.map(([name]) => name).join(',')
    const body = all.map((row) => COLUMNS.map(([, read]) => escapeCell(read(row))).join(','))
    return BOM + [header, ...body].join('\r\n') + '\r\n'
}

//! JSON
// Includes the summary so an exported file is self-contained for analysis.
function toJson(rows, summary) {
    return JSON.stringify(
        {
            exportedAt: new Date().toISOString(),
            source: 'Musicalist (Deezer API + MusicBrainz + AcousticBrainz)',
            summary: summary || null,
            songs: Array.isArray(rows) ? rows : []
        },
        null,
        2
    )
}

//! Export
module.exports = { toCsv, toJson, escapeCell, COLUMNS }
