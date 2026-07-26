// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { createClient } = require('./deezer.js')
const musicbrainz = require('./musicbrainz.js')

//! Blank Row
// A song Deezer cannot find still gets a row, so the output lines up with the
// input list and the user can see exactly which queries missed.
function blankRow(query) {
    return {
        query,
        found: false,
        title: null,
        author: null,
        album: null,
        releaseDate: [],
        deezerGenres: [],
        wikiGenres: [],
        artists: [],
        albumType: null,
        albumTotalTracks: null,
        releaseDatePrecision: null,
        durationMs: null,
        explicit: null,
        trackNumber: null,
        discNumber: null,
        isrc: null,
        bpm: null,
        deezerUrl: null,
        coverArt: null,
        originalReleaseDate: null,
        releaseType: null,
        releaseSecondaryTypes: [],
        genreWeights: [],
        tags: [],
        mbRecordingId: null
    }
}

//! Single Song
// Deezer identifies the track and carries the catalogue facts; MusicBrainz
// supplies the genres and the original release date.
async function lookupSong(deezer, query) {
    const track = await deezer.searchTrack(query)
    if (!track) return blankRow(query)

    const primaryArtist = track.artists.length ? track.artists[0] : null

    const enrichment = await musicbrainz.enrich({
        isrc: track.isrc,
        title: track.title,
        artist: primaryArtist?.name
    })

    return {
        ...blankRow(query),
        ...track,
        found: true,
        ...enrichment
    }
}

//! Run
// Mirrors the streaming contract the old scraper had: each row is handed to
// onProgress the moment it is ready, and one bad song never aborts the run.
async function lookupSongs(songs, { onProgress } = {}) {
    const deezer = createClient()
    const rows = []

    for (const query of songs) {
        let row
        try {
            row = await lookupSong(deezer, query)
        } catch (err) {
            // A dead connection will fail every remaining song identically,
            // so stop rather than emit a wall of errors.
            if (err.kind === 'network') throw err
            row = { ...blankRow(query), error: err.message }
        }

        rows.push(row)
        if (typeof onProgress === 'function') onProgress(row)
    }

    return rows
}

//! Export
module.exports = { lookupSongs, lookupSong, blankRow }
