// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Import
const { createClient } = require('./spotify.js')
const musicbrainz = require('./musicbrainz.js')

//! Blank Row
// A song Spotify cannot find still gets a row, so the output lines up with the
// input list and the user can see exactly which queries missed.
function blankRow(query) {
     return {
          query,
          found: false,
          title: null,
          author: null,
          album: null,
          releaseDate: [],
          spotifyGenres: [],
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
          spotifyUrl: null,
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
// Spotify identifies the track; MusicBrainz supplies genres and the original
// release date. The two are independent, so they run together.
async function lookupSong(spotify, query) {
     const track = await spotify.searchTrack(query)
     if (!track) return blankRow(query)

     const primaryArtist = track.artists.length ? track.artists[0] : null

     const [artist, enrichment] = await Promise.all([
          // Spotify's artist genres are deprecated and often empty. Losing them
          // must not cost us the rest of the row.
          primaryArtist ? spotify.getArtist(primaryArtist.id).catch(() => null) : null,
          musicbrainz.enrich({ isrc: track.isrc, title: track.title, artist: primaryArtist?.name })
     ])

     return {
          ...blankRow(query),
          ...track,
          found: true,
          spotifyGenres: artist ? artist.genres : [],
          ...enrichment
     }
}

//! Run
// Mirrors the streaming contract the old scraper had: each row is handed to
// onProgress the moment it is ready, and one bad song never aborts the run.
async function lookupSongs(songs, { clientId, clientSecret, market, onProgress } = {}) {
     const spotify = createClient({ clientId, clientSecret, market })
     const rows = []

     for (const query of songs) {
          let row
          try {
               row = await lookupSong(spotify, query)
          } catch (err) {
               // Bad credentials or a dead connection will fail every remaining
               // song identically, so stop rather than emit a wall of errors.
               if (err.kind === 'credentials' || err.kind === 'network') throw err
               row = { ...blankRow(query), error: err.message }
          }

          rows.push(row)
          if (typeof onProgress === 'function') onProgress(row)
     }

     return rows
}

//! Export
module.exports = { lookupSongs, lookupSong, blankRow }
