// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { createClient } = require('./deezer.js')
const musicbrainz = require('./musicbrainz.js')
const acousticbrainz = require('./acousticbrainz.js')

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
        mbRecordingId: null,
        // How well Deezer's answer matched the query, so a shaky match is
        // visible as one rather than presented like any other row.
        matchScore: null,
        matchConfidence: null,
        // Present on every row so the shape is uniform whether the song failed
        // or not, rather than appearing only on the rows that went wrong.
        error: null,
        ...acousticbrainz.emptyFeatures()
    }
}

//! Single Song
// Deezer identifies the track and carries the catalogue facts; MusicBrainz
// supplies the genres and the original release date; AcousticBrainz adds mood
// and danceability for the recordings it happens to hold.
async function lookupSong(deezer, query, signal) {
    const track = await deezer.searchTrack(query, { signal })
    if (!track) return blankRow(query)

    const primaryArtist = track.artists.length ? track.artists[0] : null

    const enrichment = await musicbrainz.enrich({
        isrc: track.isrc,
        title: track.title,
        artist: primaryArtist?.name,
        signal
    })

    // Has to follow the enrichment rather than run alongside it, because the
    // recording id is the key. The extra round trip is close to free in wall
    // clock terms: MusicBrainz spaces its own calls a second apart from the
    // last one it made, so this lands inside a gap the run was already waiting
    // out. It returns nulls rather than throwing, so it cannot fail a row.
    const audio = await acousticbrainz.features(enrichment.mbRecordingId, signal)

    return {
        ...blankRow(query),
        ...track,
        found: true,
        ...enrichment,
        ...audio
    }
}

//! Run
// Mirrors the streaming contract the old scraper had: each row is handed to
// onProgress the moment it is ready, and one bad song never aborts the run.
//
// `signal` stops the run. It is checked between songs and passed down into the
// requests themselves, so pressing Stop drops whatever is in flight rather than
// waiting out the song it landed in the middle of. Rows already collected are
// returned as they stand: they are on screen and worth exporting.
async function lookupSongs(songs, { onProgress, signal } = {}) {
    const deezer = createClient()
    const rows = []

    for (const query of songs) {
        if (signal && signal.aborted) break

        let row
        try {
            row = await lookupSong(deezer, query, signal)
        } catch (err) {
            // An abort killed the request, so this is not a song that failed on
            // its own account and does not deserve a row saying so.
            if (signal && signal.aborted) break

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
