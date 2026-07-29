// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Scope
// The pure half of the renderer: given a row or a summary, hand back HTML. It
// lives here rather than in renderer.js because renderer.js reaches for the
// document and the preload bridge the moment it loads, which makes everything
// in it unreachable from a test. These two functions hold the escaping
// guarantees the whole output rests on, so they are the part most worth
// covering.
;(function () {
    //! Constants
    // The classifiers worth naming on screen, in the order they read best. A
    // trait is listed only once it wins its own two-class model, so 0.5 is the
    // threshold rather than an arbitrary cut.
    const MOOD_LABELS = {
        moodAggressive: 'aggressive',
        moodParty: 'party',
        moodHappy: 'happy',
        moodSad: 'sad',
        moodRelaxed: 'relaxed',
        moodAcoustic: 'acoustic',
        moodElectronic: 'electronic',
        instrumental: 'instrumental'
    }

    const MOOD_THRESHOLD = 0.5

    //! Dependencies
    // Resolved both ways for the same reason analysis.js and text.js export
    // both ways: the tests load this with require, the renderer loads it as a
    // plain script and has none.
    const loadedAsModule = typeof module !== 'undefined' && module.exports
    const { escapeHtml } = loadedAsModule ? require('./text.js') : window.MusicalistText
    const { formatDuration } = loadedAsModule ? require('./analysis.js') : window.MusicalistAnalysis

    //! Helpers
    const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

    //! Summary Cells
    // Returns the cells as HTML. The caller owns the container and decides when
    // to show it.
    function summaryCells(summary) {
        const cells = []

        const cell = (label, value, detail) =>
            cells.push(`<div class="stat">
                   <span class="stat__label">${escapeHtml(label)}</span>
                   <span class="stat__value">${escapeHtml(value)}</span>
                   ${detail ? `<span class="stat__detail">${escapeHtml(detail)}</span>` : ''}
              </div>`)

        cell(
            'Songs',
            String(summary.found),
            summary.missed ? `${summary.missed} not found` : 'all found'
        )

        if (summary.decades.length) {
            const busiest = summary.decades.reduce((a, b) => (b.count > a.count ? b : a))
            const span = `${summary.decades[0].decade}s to ${summary.decades[summary.decades.length - 1].decade}s`
            cell('Peak decade', `${busiest.decade}s`, `${plural(busiest.count, 'song')}, ${span}`)
        }

        if (summary.meanDurationMs) {
            cell(
                'Average length',
                formatDuration(summary.meanDurationMs),
                `median ${formatDuration(summary.medianDurationMs)}`
            )
        }

        if (summary.meanBpm) {
            cell(
                'Average BPM',
                String(summary.meanBpm),
                summary.bpmMissing
                    ? `median ${summary.medianBpm}, ${summary.bpmMissing} unknown`
                    : `median ${summary.medianBpm}`
            )
        }

        if (summary.topGenres.length) {
            const top = summary.topGenres[0]
            const runnersUp = summary.topGenres
                .slice(1, 4)
                .map((genre) => genre.name)
                .join(', ')
            cell('Top genre', top.name, runnersUp ? `then ${runnersUp}` : plural(top.count, 'song'))
        }

        if (summary.releaseTypes.length) {
            const mix = summary.releaseTypes.map((type) => `${type.name} ${type.count}`).join(', ')
            cell('Release types', summary.releaseTypes[0].name, mix)
        }

        // Guarded like every other cell: a list where nothing was found has no
        // artists to count, and "Artists 0" is noise rather than a finding.
        if (summary.artists.distinct) {
            cell(
                'Artists',
                String(summary.artists.distinct),
                summary.artists.top.length ? `most: ${summary.artists.top[0].name}` : ''
            )
        }

        if (summary.keys.top.length) {
            const top = summary.keys.top[0]
            cell(
                'Common key',
                top.name,
                `${plural(top.count, 'song')} of ${summary.keys.analysed} analysed`
            )
        }

        if (summary.loudness.measured) {
            // Larger negatives mean a louder master, so this reads as how hard the
            // list was mastered rather than as an abstract number.
            cell(
                'Master loudness',
                `${summary.loudness.meanGainDb} dB`,
                `${summary.loudness.measured} measured`
            )
        }

        if (summary.popularity.measured) {
            cell(
                'Median listens',
                summary.popularity.medianListens.toLocaleString(),
                `on ListenBrainz, ${summary.popularity.measured} known`
            )
        }

        if (summary.labels.top.length) {
            cell(
                'Top label',
                summary.labels.top[0].name,
                `${plural(summary.labels.distinct, 'label')} across the list`
            )
        }

        if (summary.versions.count) {
            cell(
                'Not the original',
                plural(summary.versions.count, 'song'),
                summary.versions.top.map((version) => version.name).join(', ')
            )
        }

        if (summary.artists.featured) {
            cell('Collaborations', plural(summary.artists.featured, 'song'), 'with a featured artist')
        }

        if (summary.mismatched) {
            cell(
                'Worth checking',
                plural(summary.mismatched, 'song'),
                'Deezer and MusicBrainz disagree on the length'
            )
        }

        if (summary.explicit.count) {
            cell(
                'Explicit',
                `${Math.round(summary.explicit.ratio * 100)}%`,
                plural(summary.explicit.count, 'song')
            )
        }

        if (summary.reissueDrift.count) {
            cell(
                'Reissue drift',
                plural(summary.reissueDrift.count, 'song'),
                `Deezer dates them ${summary.reissueDrift.averageYears} years late on average`
            )
        }

        // Both cells carry the analysed count, because the archive covers well under
        // half a typical list and an average over a third of it should say so.
        if (summary.moods.danceability !== null) {
            const coverage = summary.audioMissing
                ? `${summary.audioAnalysed} of ${summary.audioAnalysed + summary.audioMissing} analysed`
                : `all ${summary.audioAnalysed} analysed`

            cell('Danceability', `${Math.round(summary.moods.danceability * 100)}%`, coverage)

            const strongest = Object.keys(MOOD_LABELS)
                .filter((field) => summary.moods[field] !== null)
                .sort((a, b) => summary.moods[b] - summary.moods[a])[0]

            if (strongest && summary.moods[strongest] >= MOOD_THRESHOLD) {
                cell(
                    'Mood',
                    MOOD_LABELS[strongest],
                    `${Math.round(summary.moods[strongest] * 100)}% average`
                )
            }
        }
        return cells
    }

    //! A Single Song
    function songCard(song) {
        const list = (values) => (values && values.length ? escapeHtml(values.join(', ')) : '—')
        const text = (value) =>
            value === null || value === undefined || value === '' ? '—' : escapeHtml(value)

        if (!song.found) {
            return `<article class="song song--missed">
                   <h2 class="song__title">${text(song.query)}</h2>
                   <p class="song__note">${song.error ? `Failed: ${escapeHtml(song.error)}` : 'Not found on Deezer.'}</p>
              </article>`
        }

        // Deezer's date is the release it happens to serve, so show the original
        // alongside it whenever MusicBrainz disagrees.
        const deezerDate = (song.releaseDate || [])[0]
        const released =
            song.originalReleaseDate && song.originalReleaseDate !== deezerDate
                ? `${text(song.originalReleaseDate)} <span class="song__aside">(Deezer: ${text(deezerDate)})</span>`
                : text(deezerDate || song.originalReleaseDate)

        // Every trait that won its own model, strongest first, with danceability as
        // a number since it is the one people compare between songs. A song the
        // archive never analysed falls through to the em dash like any other gap.
        const traits = Object.entries(MOOD_LABELS)
            .filter(([field]) => typeof song[field] === 'number' && song[field] >= MOOD_THRESHOLD)
            .sort((a, b) => song[b[0]] - song[a[0]])
            .map(([, label]) => label)

        const moodLine =
            typeof song.danceability === 'number'
                ? [...traits, `${Math.round(song.danceability * 100)}% danceable`].join(', ')
                : null

        const albumLine = [
            song.album,
            song.releaseType || song.albumType,
            ...(song.releaseSecondaryTypes || []),
            song.label
        ]
            .filter(Boolean)
            .join(' · ')

        // Tempo, key and how the master was cut, which is the musical line as
        // opposed to the catalogue one. The source is named where the archive
        // filled a tempo Deezer never had.
        const tempo =
            song.bpm === null || song.bpm === undefined
                ? null
                : `${Math.round(song.bpm)}${song.bpmSource === 'acousticbrainz' ? ' (archive)' : ''}`

        const soundLine = [
            tempo ? `${tempo} BPM` : null,
            song.musicalKey,
            typeof song.gainDb === 'number' ? `${song.gainDb} dB` : null
        ]
            .filter(Boolean)
            .join(' · ')

        // How widely known it is, from two sources that do not measure the same
        // thing, so neither is presented as the popularity.
        const reachLine = [
            typeof song.listenCount === 'number'
                ? `${song.listenCount.toLocaleString()} listens on ListenBrainz`
                : null,
            typeof song.popularity === 'number'
                ? `Deezer rank ${song.popularity.toLocaleString()}`
                : null
        ]
            .filter(Boolean)
            .join(' · ')

        const creditLine = (song.credits || [])
            .map((credit) => `${credit.name} (${credit.role})`)
            .join(', ')

        // MusicBrainz saying outright that this is a live take, a remix or an edit,
        // next to the two catalogues disagreeing about the length, which points at
        // the same problem from the other side.
        const versionLine = [
            song.disambiguation,
            song.durationDisagrees ? `MusicBrainz has it ${formatDuration(song.mbDurationMs)}` : null
        ]
            .filter(Boolean)
            .join(' · ')

        // Deezer answers every query with its closest guess. A low score means this
        // row is worth a second look, and saying so is the whole point of scoring.
        // A middling one still shows in the export for anyone auditing a whole list.
        const shaky =
            song.matchConfidence === 'low'
                ? `<p class="song__note">Loose match for “${text(song.query)}”. Worth checking.</p>`
                : ''

        return `<article class="song">
              <h2 class="song__title">${text(song.title)}</h2>
              ${shaky}
              <dl class="song__meta">
                   <dt>Author</dt><dd>${text(song.author)}</dd>
                   <dt>Album</dt><dd>${text(albumLine)}</dd>
                   <dt>Released</dt><dd>${released}</dd>
                   <dt>Length</dt><dd>${text(formatDuration(song.durationMs))}</dd>
                   <dt>Sound</dt><dd>${text(soundLine)}</dd>
                   <dt>Mood</dt><dd>${text(moodLine)}</dd>
                   <dt>Version</dt><dd>${text(versionLine)}</dd>
                   <dt>Reach</dt><dd>${text(reachLine)}</dd>
                   <dt>Genres</dt><dd>${list(song.wikiGenres)}</dd>
                   <dt>Deezer genres</dt><dd>${list(song.deezerGenres)}</dd>
                   <dt>Tags</dt><dd>${list(song.tags)}</dd>
                   <dt>Credits</dt><dd>${text(creditLine)}</dd>
                   <dt>ISRC</dt><dd>${text(song.isrc)}</dd>
              </dl>
         </article>`
    }

    //! Export
    const api = { songCard, summaryCells, MOOD_LABELS, MOOD_THRESHOLD }

    if (loadedAsModule) {
        module.exports = api
    } else {
        window.MusicalistCard = api
    }
})()
