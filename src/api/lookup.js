// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { createClient } = require('./deezer.js')
const musicbrainz = require('./musicbrainz.js')
const acousticbrainz = require('./acousticbrainz.js')
const listenbrainz = require('./listenbrainz.js')
const { describeFailure } = require('../failure.js')

//! Duration Cross-check
// A studio original and a live take of the same song rarely agree within a few
// seconds. Deezer's duration and MusicBrainz's are both already in hand, so
// comparing them is the cheapest wrong-match detector there is: no request, no
// heuristic, just two independent sources disagreeing about the same recording.
const DURATION_TOLERANCE_MS = 5000

function compareDurations(deezerMs, mbMs) {
    if (typeof deezerMs !== 'number' || typeof mbMs !== 'number' || deezerMs <= 0 || mbMs <= 0) {
        return { durationGapMs: null, durationDisagrees: null }
    }

    const gap = Math.abs(deezerMs - mbMs)
    return { durationGapMs: gap, durationDisagrees: gap > DURATION_TOLERANCE_MS }
}

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
        explicitLyrics: null,
        trackNumber: null,
        discNumber: null,
        isrc: null,
        bpm: null,
        popularity: null,
        gainDb: null,
        previewUrl: null,
        label: null,
        upc: null,
        deezerUrl: null,
        coverArt: null,
        originalReleaseDate: null,
        releaseType: null,
        releaseSecondaryTypes: [],
        genreWeights: [],
        tags: [],
        disambiguation: null,
        mbDurationMs: null,
        isVideo: null,
        mbArtists: [],
        credits: [],
        links: {},
        mbIsrcs: [],
        coverArtUrl: null,
        durationGapMs: null,
        durationDisagrees: null,
        listenCount: null,
        listenerCount: null,
        bpmSource: null,
        mbRecordingId: null,
        ...acousticbrainz.emptyAnalysis(),
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

    // The measured half of the archive costs a second request, so it is only
    // worth asking once the high-level answer has confirmed there is anything
    // to ask about. The archive returns every classifier together or none at
    // all, so one field standing in for the rest is enough to tell.
    const measured =
        audio.danceability !== null
            ? await acousticbrainz.analysis(enrichment.mbRecordingId, signal)
            : acousticbrainz.emptyAnalysis()

    return {
        ...blankRow(query),
        ...track,
        found: true,
        ...enrichment,
        ...audio,
        ...measured,
        ...compareDurations(track.durationMs, enrichment.mbDurationMs),
        // Deezer has no tempo for every track and the archive analysed its own,
        // so a gap in one is often filled by the other. Deezer wins where both
        // have a number, because it covers far more of a typical list, and the
        // source is recorded rather than left to be guessed at.
        bpm: track.bpm ?? measured.archiveBpm ?? null,
        bpmSource: track.bpm ? 'deezer' : measured.archiveBpm ? 'acousticbrainz' : null
    }
}

//! Popularity
// One request for the whole run rather than one per song, which is why it lands
// after the loop rather than inside it. Rows are amended in place and returned,
// so the streamed view is finalised once at the end.
async function addPopularity(rows, signal) {
    if (signal && signal.aborted) return rows

    const ids = rows.map((row) => row.mbRecordingId).filter(Boolean)
    if (ids.length === 0) return rows

    const counts = await listenbrainz.popularity(ids, signal)
    for (const row of rows) {
        const entry = counts.get(row.mbRecordingId)
        if (!entry) continue

        row.listenCount = entry.listenCount
        row.listenerCount = entry.listenerCount
    }

    return rows
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

            // Through the same gate the run-level failure goes through. A row's
            // `error` is rendered on its card and written to the export, so an
            // unexpected throw must not put its raw message in either: that is
            // exactly what describeFailure exists to stop, and this path used to
            // go around it.
            row = { ...blankRow(query), error: describeFailure(err).message }
        }

        rows.push(row)
        if (typeof onProgress === 'function') onProgress(row)
    }

    return addPopularity(rows, signal)
}

//! Export
module.exports = { lookupSongs, lookupSong, blankRow, compareDurations, addPopularity }
