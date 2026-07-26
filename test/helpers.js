// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Fake Responses
// Minimal stand-in for the parts of the fetch Response the code touches.
function response(body, { status = 200, headers = {} } = {}) {
    const lower = {}
    for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
        json: async () => body
    }
}

//! Fetch Stub
// Installs a queue of handlers over globalThis.fetch and records every call.
// Returns the recorder plus a restore function for test teardown.
function stubFetch(handler) {
    const original = globalThis.fetch
    const calls = []

    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), options, at: Date.now() })
        return handler(String(url), options, calls.length - 1)
    }

    return {
        calls,
        restore: () => {
            globalThis.fetch = original
        }
    }
}

//! Fixtures

// What GET /search returns per hit: no bpm, no release date, one artist only.
function deezerHit(overrides = {}) {
    return {
        id: 42,
        title: 'Bohemian Rhapsody',
        isrc: 'GBUM71029604',
        link: 'https://www.deezer.com/track/42',
        duration: 354,
        explicit_lyrics: false,
        artist: { id: 1, name: 'Queen', link: 'https://www.deezer.com/artist/1' },
        album: {
            id: 7,
            title: 'A Night at the Opera',
            cover_medium: 'https://img/medium.jpg',
            cover_big: 'https://img/big.jpg'
        },
        ...overrides
    }
}

// What GET /track/{id} adds on top: tempo, the served release date, positions
// and the full credit list.
function deezerTrack(overrides = {}) {
    return {
        ...deezerHit(),
        release_date: '2011-01-01',
        track_position: 11,
        disk_number: 1,
        bpm: 143.9,
        contributors: [{ id: 1, name: 'Queen', link: 'https://www.deezer.com/artist/1' }],
        ...overrides
    }
}

function deezerAlbum(overrides = {}) {
    return {
        id: 7,
        title: 'A Night at the Opera',
        record_type: 'album',
        nb_tracks: 12,
        release_date: '2011-01-01',
        genres: { data: [{ id: 152, name: 'Rock' }] },
        cover_big: 'https://img/big.jpg',
        ...overrides
    }
}

function songRow(overrides = {}) {
    return {
        query: 'Bohemian Rhapsody',
        found: true,
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        artists: [{ name: 'Queen', id: 1, url: 'https://www.deezer.com/artist/1' }],
        album: 'A Night at the Opera',
        albumType: 'album',
        albumTotalTracks: 12,
        releaseDate: ['2011-01-01'],
        releaseDatePrecision: 'day',
        originalReleaseDate: '1975-11-21',
        releaseType: 'Album',
        releaseSecondaryTypes: [],
        durationMs: 354000,
        bpm: 143.9,
        explicit: false,
        trackNumber: 11,
        discNumber: 1,
        isrc: 'GBUM71029604',
        deezerUrl: 'https://www.deezer.com/track/42',
        coverArt: 'https://img/big.jpg',
        deezerGenres: ['Rock'],
        wikiGenres: ['rock', 'hard rock'],
        genreWeights: [
            { name: 'rock', count: 13 },
            { name: 'hard rock', count: 9 }
        ],
        tags: ['album rock'],
        mbRecordingId: 'rec-1',
        ...overrides
    }
}

module.exports = { response, stubFetch, deezerHit, deezerTrack, deezerAlbum, songRow }
