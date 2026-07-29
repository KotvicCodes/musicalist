// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Scope
// Wrapped so nothing leaks into the renderer's shared global scope, where it
// would collide with the names the renderer imports from this namespace.
;(function () {
    //! Constants
    const TOP_GENRES = 10
    const TOP_ARTISTS = 5
    const TOP_KEYS = 5
    const TOP_LABELS = 5
    const TOP_VERSIONS = 5

    // Repeated rather than imported from the AcousticBrainz client, because the
    // renderer loads this file as a plain script and has no require(). A test
    // asserts the two lists stay identical.
    const MOOD_FIELDS = [
        'danceability',
        'moodHappy',
        'moodSad',
        'moodAggressive',
        'moodRelaxed',
        'moodParty',
        'moodAcoustic',
        'moodElectronic',
        'instrumental',
        'timbreBright',
        'tonal'
    ]

    //! Helpers

    // Deezer serves whichever reissue it happens to carry, so its release date is
    // often decades late. MusicBrainz's original date wins when we have it.
    function effectiveYear(row) {
        const source = row.originalReleaseDate || (row.releaseDate && row.releaseDate[0])
        if (!source) return null
        const year = parseInt(String(source).slice(0, 4), 10)
        return Number.isFinite(year) ? year : null
    }

    function yearOf(value) {
        if (!value) return null
        const year = parseInt(String(value).slice(0, 4), 10)
        return Number.isFinite(year) ? year : null
    }

    // Count occurrences into a Map, then hand back the busiest entries.
    function tally(rows, pick) {
        const counts = new Map()
        for (const row of rows) {
            for (const name of pick(row) || []) {
                if (!name) continue
                counts.set(name, (counts.get(name) || 0) + 1)
            }
        }
        return counts
    }

    function topOf(counts, limit) {
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, limit)
            .map(([name, count]) => ({ name, count }))
    }

    // The true median, left unrounded. Rounding only the even-length branch made
    // the return type depend on how many songs were in the list, which is fine
    // until a caller forgets to round and gets a fraction from one list and a
    // whole number from the next. Each caller rounds to its own unit instead.
    function median(values) {
        if (values.length === 0) return null
        const sorted = values.slice().sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
    }

    //! Summary
    // Every aggregate is derived from the rows already on screen, so this can be
    // recomputed cheaply each time a new song streams in.
    function summarise(rows) {
        const all = Array.isArray(rows) ? rows : []
        const found = all.filter((row) => row.found)

        //* Decades
        const decades = new Map()
        for (const row of found) {
            const year = effectiveYear(row)
            if (year === null) continue
            const decade = Math.floor(year / 10) * 10
            decades.set(decade, (decades.get(decade) || 0) + 1)
        }

        //* Reissue drift
        // How often, and by how much, Deezer's date is later than the original.
        let driftCount = 0
        let driftTotal = 0
        for (const row of found) {
            const original = yearOf(row.originalReleaseDate)
            const served = yearOf(row.releaseDate && row.releaseDate[0])
            if (original === null || served === null || original >= served) continue
            driftCount += 1
            driftTotal += served - original
        }

        //* Genres
        // Frequency across the list, with MusicBrainz vote weight as the tiebreak
        // so two genres appearing on the same number of songs rank sensibly.
        const genreCounts = tally(found, (row) => row.wikiGenres)
        const genreWeight = new Map()
        for (const row of found) {
            for (const genre of row.genreWeights || []) {
                genreWeight.set(genre.name, (genreWeight.get(genre.name) || 0) + (genre.count || 0))
            }
        }
        const topGenres = [...genreCounts.entries()]
            .sort(
                (a, b) =>
                    b[1] - a[1] ||
                    (genreWeight.get(b[0]) || 0) - (genreWeight.get(a[0]) || 0) ||
                    a[0].localeCompare(b[0])
            )
            .slice(0, TOP_GENRES)
            .map(([name, count]) => ({ name, count }))

        //* Duration
        const durations = found
            .map((row) => row.durationMs)
            .filter((value) => typeof value === 'number' && value > 0)
        const meanDurationMs = durations.length
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : null

        //* BPM
        // Deezer has not analysed every track, so the aggregate covers only the
        // ones it has. bpmMissing is reported alongside so an average drawn from
        // three of twenty songs is never mistaken for the whole list.
        const tempos = found
            .map((row) => row.bpm)
            .filter((value) => typeof value === 'number' && value > 0)
        const meanBpm = tempos.length
            ? Math.round(tempos.reduce((sum, value) => sum + value, 0) / tempos.length)
            : null

        //* Mood
        // AcousticBrainz stopped taking submissions in 2022, so it holds well
        // under half of a typical list. Each mean covers only the songs it
        // actually has, and audioMissing is reported for the same reason
        // bpmMissing is: an average drawn from a third of the list must never
        // read as a verdict on all of it.
        const moods = {}
        for (const field of MOOD_FIELDS) {
            const values = found.map((row) => row[field]).filter((value) => typeof value === 'number')
            moods[field] = values.length
                ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) /
                  1000
                : null
        }

        // One field standing in for the row as a whole: the archive returns
        // every classifier together or none at all.
        const analysed = found.filter((row) => typeof row.danceability === 'number')

        //* Explicit
        const rated = found.filter((row) => typeof row.explicit === 'boolean')
        const explicitCount = rated.filter((row) => row.explicit).length

        //* Release types
        const releaseTypes = new Map()
        for (const row of found) {
            const type = row.releaseType || row.albumType
            if (!type) continue
            const label = type.charAt(0).toUpperCase() + type.slice(1)
            releaseTypes.set(label, (releaseTypes.get(label) || 0) + 1)
        }

        //* Artists
        const artistCounts = tally(found, (row) => (row.artists || []).map((artist) => artist.name))

        // Deezer marks a guest credit Featured, which the app used to discard,
        // so a list of collaborations read exactly like a list of solo tracks.
        const featured = found.filter((row) =>
            (row.artists || []).some((artist) => artist.role && artist.role !== 'Main')
        ).length

        //* Keys
        // The archive's measured key. Same partial coverage as the moods, so the
        // count of songs it could answer for travels with it.
        const keyCounts = tally(found, (row) => (row.musicalKey ? [row.musicalKey] : []))

        //* Labels
        const labelCounts = tally(found, (row) => (row.label ? [row.label] : []))

        //* Loudness
        // ReplayGain is negative and a larger negative means a louder master, so
        // the mean reads directly as how hard this list was mastered.
        const gains = found.map((row) => row.gainDb).filter((value) => typeof value === 'number')

        //* Popularity
        const listens = found.map((row) => row.listenCount).filter((value) => typeof value === 'number')

        //* Versions
        // How much of the list is the actual studio recording, as opposed to a
        // live take, a remix or an edit standing in for one.
        const versioned = found.filter((row) => row.disambiguation)

        //* Suspected mismatches
        // Deezer and MusicBrainz disagreeing about the length of what should be
        // the same recording. Costs nothing to compute and points at the rows
        // worth checking by hand.
        const mismatched = found.filter((row) => row.durationDisagrees === true).length

        return {
            total: all.length,
            found: found.length,
            missed: all.length - found.length,
            decades: [...decades.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([decade, count]) => ({ decade, count })),
            reissueDrift: {
                count: driftCount,
                averageYears: driftCount ? Math.round((driftTotal / driftCount) * 10) / 10 : 0
            },
            topGenres,
            meanDurationMs,
            medianDurationMs: durations.length ? Math.round(median(durations)) : null,
            meanBpm,
            // Deezer reports a fractional tempo; whole numbers read better and
            // the tenths carry no meaning to someone scanning a summary.
            medianBpm: tempos.length ? Math.round(median(tempos)) : null,
            bpmMissing: found.length - tempos.length,
            moods,
            audioAnalysed: analysed.length,
            audioMissing: found.length - analysed.length,
            explicit: {
                count: explicitCount,
                ratio: rated.length ? explicitCount / rated.length : 0
            },
            releaseTypes: topOf(releaseTypes, releaseTypes.size),
            artists: {
                distinct: artistCounts.size,
                top: topOf(artistCounts, TOP_ARTISTS),
                featured
            },
            keys: {
                top: topOf(keyCounts, TOP_KEYS),
                analysed: keyCounts.size ? [...keyCounts.values()].reduce((a, b) => a + b, 0) : 0
            },
            labels: {
                distinct: labelCounts.size,
                top: topOf(labelCounts, TOP_LABELS)
            },
            loudness: {
                meanGainDb: gains.length
                    ? Math.round((gains.reduce((sum, value) => sum + value, 0) / gains.length) * 10) / 10
                    : null,
                measured: gains.length
            },
            popularity: {
                medianListens: listens.length ? Math.round(median(listens)) : null,
                measured: listens.length
            },
            versions: {
                count: versioned.length,
                top: topOf(
                    tally(versioned, (row) => [row.disambiguation]),
                    TOP_VERSIONS
                )
            },
            mismatched
        }
    }

    //! Formatting
    function formatDuration(ms) {
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
        const totalSeconds = Math.round(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${String(seconds).padStart(2, '0')}`
    }

    //! Export
    // Loaded two ways: as a CommonJS module by the tests and the main
    // process, and as a plain script by the renderer, which has no require().
    const api = { summarise, formatDuration, effectiveYear, MOOD_FIELDS }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api
    } else {
        window.MusicalistAnalysis = api
    }
})()
