// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants

// Column order is deliberate: what you searched for, what came back, then the
// catalogue facts, then the analysis fields.
const COLUMNS = [
    ['query', (row) => row.query],
    ['found', (row) => row.found],
    // How well Deezer's answer matched the query, so a shaky row can be spotted
    // and checked rather than trusted like any other.
    ['matchConfidence', (row) => row.matchConfidence],
    ['matchScore', (row) => row.matchScore],
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
    // MusicBrainz's own note on which recording this is: live, remix, radio
    // edit. The most useful single field for spotting a row that is the right
    // song in the wrong version.
    ['disambiguation', (row) => row.disambiguation],
    ['durationMs', (row) => row.durationMs],
    ['mbDurationMs', (row) => row.mbDurationMs],
    // Two catalogues disagreeing about the same recording, which is the
    // cheapest wrong-match signal there is.
    ['durationGapMs', (row) => row.durationGapMs],
    ['durationDisagrees', (row) => row.durationDisagrees],
    ['bpm', (row) => row.bpm],
    ['bpmSource', (row) => row.bpmSource],
    ['archiveBpm', (row) => row.archiveBpm],
    // The measured half of AcousticBrainz, as opposed to the classified half.
    ['musicalKey', (row) => row.musicalKey],
    ['keyStrength', (row) => row.keyStrength],
    ['loudness', (row) => row.loudness],
    ['dynamicComplexity', (row) => row.dynamicComplexity],
    ['beatsCount', (row) => row.beatsCount],
    // ReplayGain in decibels: measured loudness rather than a classifier guess.
    ['gainDb', (row) => row.gainDb],
    // Two popularity axes that do not measure the same thing: one is Deezer's
    // own ranking, the other is listens submitted across everyone using
    // ListenBrainz.
    ['popularity', (row) => row.popularity],
    ['listenCount', (row) => row.listenCount],
    ['listenerCount', (row) => row.listenerCount],
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
    ['timbreBright', (row) => row.timbreBright],
    ['tonal', (row) => row.tonal],
    ['moodCluster', (row) => row.moodCluster],
    ['explicit', (row) => row.explicit],
    // Deezer's four-value rating, where the boolean above cannot tell an
    // unrated track apart from a clean one.
    ['explicitLyrics', (row) => row.explicitLyrics],
    ['isVideo', (row) => row.isVideo],
    ['trackNumber', (row) => row.trackNumber],
    ['discNumber', (row) => row.discNumber],
    ['label', (row) => row.label],
    ['upc', (row) => row.upc],
    ['isrc', (row) => row.isrc],
    ['musicbrainzIsrcs', (row) => row.mbIsrcs],
    ['deezerGenres', (row) => row.deezerGenres],
    ['musicbrainzGenres', (row) => row.wikiGenres],
    ['tags', (row) => row.tags],
    ['credits', (row) => creditCell(row.credits)],
    ['musicbrainzArtists', (row) => (row.mbArtists || []).map((artist) => artist.name)],
    ['deezerUrl', (row) => row.deezerUrl],
    ['previewUrl', (row) => row.previewUrl],
    ['coverArt', (row) => row.coverArt],
    ['coverArtArchive', (row) => row.coverArtUrl],
    ['wikidataUrl', (row) => (row.links || {}).wikidata || null],
    ['discogsUrl', (row) => (row.links || {}).discogs || null],
    ['mbRecordingId', (row) => row.mbRecordingId],
    ['error', (row) => row.error || null]
]

// Arrays collapse into one cell; semicolons keep them readable next to the
// comma the format itself uses.
const LIST_SEPARATOR = '; '

// A production credit only means something with its role attached, so the two
// travel together rather than as two parallel columns that have to be lined up
// by eye.
function creditCell(credits) {
    return (credits || []).map((credit) => `${credit.name} (${credit.role})`)
}

// Excel assumes the system codepage unless a UTF-8 BOM says otherwise, which
// mangles accented artist names.
const BOM = '﻿'

// Every spreadsheet evaluates a cell that opens with one of these, so a value
// reading `=HYPERLINK("http://…","Play")` becomes a live formula the moment the
// file is opened. None of these values are the user's own: MusicBrainz genres
// and tags are community editable, which index.html already treats as an attack
// surface for the HTML path, and this is the same data reaching a different
// renderer. A leading apostrophe is the conventional defusal; spreadsheets read
// the rest of the cell as literal text.
const FORMULA_LEAD = /^[=+\-@\t\r]/

// A leading minus is far more often a negative number than an attack, and
// `gain` is reported in negative decibels, so quoting those would turn a real
// column into text and break every sum drawn from it. Anything that parses as a
// plain number is left to stand.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

//! Cell Serialisation
function toCell(value) {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) return value.join(LIST_SEPARATOR)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
}

// RFC 4180: quote anything containing a delimiter, a quote or a line break, and
// double up any embedded quotes. Formula defusal runs first, so the apostrophe
// it adds is inside the quoting rather than outside it.
function escapeCell(value) {
    const raw = toCell(value)
    const cell = FORMULA_LEAD.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw

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
