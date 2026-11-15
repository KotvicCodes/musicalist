// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Scope
// Wrapped so nothing leaks into the renderer's shared global scope, where it
// would collide with the names the renderer imports from this namespace.
;(function () {
    //! Constants
    const FULL_HOUSE_MIN_SONGS = 5
    const TIME_TRAVELLER_DECADES = 4
    const CRATE_DIGGER_MAX_LISTENS = 1000
    const CHART_TOPPER_MIN_LISTENS = 100_000
    const CHART_TOPPER_MIN_POPULARITY = 800_000
    const GENRE_HOPPER_MIN_GENRES = 8
    const SPEED_DEMON_MIN_BPM = 160
    const SLOW_BURN_MAX_BPM = 75
    const MARATHON_MIN_MS = 420_000
    const SHORT_AND_SWEET_MAX_MS = 120_000
    const HARMONIC_CONVERGENCE_MIN_SONGS = 3
    const TIME_WARP_MIN_YEARS = 20

    //! Helpers
    function yearOf(value) {
        if (!value) return null
        const text = String(value)
        if (!/^\d{4}(?!\d)/.test(text)) return null
        const year = parseInt(text.slice(0, 4), 10)
        return year >= 1000 ? year : null
    }

    function effectiveYear(row) {
        if (!row) return null
        return yearOf(row.originalReleaseDate) ?? yearOf(row.releaseDate && row.releaseDate[0])
    }

    function formatDuration(ms) {
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
        const totalSeconds = Math.round(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${String(seconds).padStart(2, '0')}`
    }

    function labelOf(row) {
        return row.title || row.query || 'Untitled'
    }

    //! Catalogue
    // Each achievement inspects the full row list and the found subset,
    // returning a short contextual detail string when unlocked or null when
    // still locked.
    const ACHIEVEMENTS = [
        {
            id: 'first-spin',
            title: 'First Spin',
            description: 'Find at least 1 song on Deezer.',
            check(_all, found) {
                if (found.length === 0) return null
                return labelOf(found[0])
            }
        },
        {
            id: 'full-house',
            title: 'Full House',
            description: 'Complete a list of 5+ songs where every match is high confidence.',
            check(all, found) {
                if (all.length < FULL_HOUSE_MIN_SONGS || found.length !== all.length) return null
                if (!found.every((row) => row.matchConfidence === 'high')) return null
                return `${all.length} of ${all.length} matched with high confidence`
            }
        },
        {
            id: 'time-traveller',
            title: 'Time Traveller',
            description: 'Collect songs spanning at least 4 different decades.',
            check(_all, found, summary) {
                const decades = new Set()
                for (const row of found) {
                    const year = effectiveYear(row)
                    if (year !== null) decades.add(Math.floor(year / 10) * 10)
                }
                if (decades.size === 0 && summary && Array.isArray(summary.decades)) {
                    for (const entry of summary.decades) {
                        if (entry && typeof entry.decade === 'number') decades.add(entry.decade)
                    }
                }
                if (decades.size < TIME_TRAVELLER_DECADES) return null
                const sorted = [...decades].sort((a, b) => a - b)
                return `${sorted.length} decades (${sorted[0]}s to ${sorted[sorted.length - 1]}s)`
            }
        },
        {
            id: 'crate-digger',
            title: 'Crate Digger',
            description: 'Uncover an obscure track with fewer than 1,000 listens on ListenBrainz.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        typeof row.listenCount === 'number' &&
                        Number.isFinite(row.listenCount) &&
                        row.listenCount >= 0 &&
                        row.listenCount < CRATE_DIGGER_MAX_LISTENS
                )
                if (!hit) return null
                const unit = hit.listenCount === 1 ? 'listen' : 'listens'
                return `${labelOf(hit)} (${hit.listenCount.toLocaleString()} ${unit})`
            }
        },
        {
            id: 'chart-topper',
            title: 'Chart Topper',
            description:
                'Include a smash hit with 100,000+ ListenBrainz listens or 800,000+ Deezer rank.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        (typeof row.listenCount === 'number' &&
                            Number.isFinite(row.listenCount) &&
                            row.listenCount >= CHART_TOPPER_MIN_LISTENS) ||
                        (typeof row.popularity === 'number' &&
                            Number.isFinite(row.popularity) &&
                            row.popularity >= CHART_TOPPER_MIN_POPULARITY)
                )
                if (!hit) return null
                if (
                    typeof hit.listenCount === 'number' &&
                    Number.isFinite(hit.listenCount) &&
                    hit.listenCount >= CHART_TOPPER_MIN_LISTENS
                ) {
                    return `${labelOf(hit)} (${hit.listenCount.toLocaleString()} listens)`
                }
                return `${labelOf(hit)} (Deezer rank ${hit.popularity.toLocaleString()})`
            }
        },
        {
            id: 'genre-hopper',
            title: 'Genre Hopper',
            description: 'Span at least 8 distinct MusicBrainz genres across the list.',
            check(_all, found) {
                const genres = new Set()
                for (const row of found) {
                    for (const genre of row.wikiGenres || []) {
                        if (genre) genres.add(genre)
                    }
                }
                if (genres.size < GENRE_HOPPER_MIN_GENRES) return null
                return `${genres.size} distinct genres`
            }
        },
        {
            id: 'speed-demon',
            title: 'Speed Demon',
            description: 'Find a fast-paced track at 160 BPM or higher.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        typeof row.bpm === 'number' &&
                        Number.isFinite(row.bpm) &&
                        row.bpm >= SPEED_DEMON_MIN_BPM
                )
                if (!hit) return null
                return `${labelOf(hit)} (${Math.round(hit.bpm)} BPM)`
            }
        },
        {
            id: 'slow-burn',
            title: 'Slow Burn',
            description: 'Find a slow track at 75 BPM or lower.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        typeof row.bpm === 'number' &&
                        Number.isFinite(row.bpm) &&
                        row.bpm > 0 &&
                        row.bpm <= SLOW_BURN_MAX_BPM
                )
                if (!hit) return null
                return `${labelOf(hit)} (${Math.round(hit.bpm)} BPM)`
            }
        },
        {
            id: 'marathon',
            title: 'Marathon',
            description: 'Include an epic song lasting 7 minutes or longer.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        typeof row.durationMs === 'number' &&
                        Number.isFinite(row.durationMs) &&
                        row.durationMs >= MARATHON_MIN_MS
                )
                if (!hit) return null
                return `${labelOf(hit)} (${formatDuration(hit.durationMs)})`
            }
        },
        {
            id: 'short-and-sweet',
            title: 'Short & Sweet',
            description: 'Include a track lasting 2 minutes or under.',
            check(_all, found) {
                const hit = found.find(
                    (row) =>
                        typeof row.durationMs === 'number' &&
                        Number.isFinite(row.durationMs) &&
                        row.durationMs > 0 &&
                        row.durationMs <= SHORT_AND_SWEET_MAX_MS
                )
                if (!hit) return null
                return `${labelOf(hit)} (${formatDuration(hit.durationMs)})`
            }
        },
        {
            id: 'harmonic-convergence',
            title: 'Harmonic Convergence',
            description: 'Have at least 3 songs in the exact same musical key.',
            check(_all, found) {
                const counts = new Map()
                for (const row of found) {
                    if (!row.musicalKey) continue
                    counts.set(row.musicalKey, (counts.get(row.musicalKey) || 0) + 1)
                }
                const top = [...counts.entries()].sort(
                    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
                )[0]
                if (!top || top[1] < HARMONIC_CONVERGENCE_MIN_SONGS) return null
                return `${top[1]} songs in ${top[0]}`
            }
        },
        {
            id: 'time-warp',
            title: 'Time Warp',
            description:
                'Spot a song whose Deezer reissue is 20+ years later than its original release.',
            check(_all, found) {
                for (const row of found) {
                    const original = yearOf(row.originalReleaseDate)
                    const served = yearOf(row.releaseDate && row.releaseDate[0])
                    if (original === null || served === null) continue
                    if (served - original >= TIME_WARP_MIN_YEARS) {
                        return `${labelOf(row)} (${original} original, ${served} reissue)`
                    }
                }
                return null
            }
        }
    ]

    //! Evaluation
    function evaluateAchievements(rows, summary = null) {
        const all = Array.isArray(rows) ? rows.filter(Boolean) : []
        const found = all.filter((row) => row.found === true)

        const items = ACHIEVEMENTS.map((achievement) => {
            const detail = achievement.check(all, found, summary)
            const unlocked = detail !== null
            return {
                id: achievement.id,
                title: achievement.title,
                description: achievement.description,
                unlocked,
                detail: unlocked ? detail : null
            }
        })

        const unlockedCount = items.filter((item) => item.unlocked).length

        return {
            unlockedCount,
            totalCount: items.length,
            items
        }
    }

    //! Export
    // Loaded two ways: as a CommonJS module by the tests and the main
    // process, and as a plain script by the renderer, which has no require().
    const api = { ACHIEVEMENTS, evaluateAchievements }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api
    } else {
        window.MusicalistAchievements = api
    }
})()
