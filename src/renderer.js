// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const REPO_URL = 'https://github.com/KotvicCodes/musicalist#readme'

// The classifiers worth naming on screen, in the order they read best. A trait
// is listed only once it wins its own two-class model, so 0.5 is the threshold
// rather than an arbitrary cut.
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

const { summarise, formatDuration } = window.MusicalistAnalysis
const { escapeHtml, textToArray } = window.MusicalistText

//! Helpers
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

//! State
// Every row received this run, kept so the summary and the exporters have
// something to work from without asking the main process again.
let rows = []

//! Elements
const inputTextareaQ = document.getElementById('inputTextareaQ')
const separatorQ = document.getElementById('separatorQ')
const scrapeButtonQ = document.getElementById('scrapeButtonQ')
const stopButtonQ = document.getElementById('stopButtonQ')
const outputQ = document.getElementById('outputQ')
const statusQ = document.getElementById('statusQ')

const summaryQ = document.getElementById('summaryQ')
const summaryStatsQ = document.getElementById('summaryStatsQ')
const exportJsonQ = document.getElementById('exportJsonQ')
const exportCsvQ = document.getElementById('exportCsvQ')
const exportStatusQ = document.getElementById('exportStatusQ')

const helpButtonQ = document.getElementById('helpButtonQ')

//! Links
helpButtonQ.addEventListener('click', () => {
    window.electronAPI.openExternal(REPO_URL)
})

//! Lookup

//* Stream each finished song into the output as it arrives
window.electronAPI.onProgress((song) => {
    rows.push(song)
    outputQ.insertAdjacentHTML('beforeend', renderSong(song))
    renderSummary()
})

scrapeButtonQ.addEventListener('click', async () => {
    //* Get the input value
    const songArray = textToArray(inputTextareaQ.value, separatorQ.value)
    if (songArray.length === 0) {
        statusQ.textContent = 'Please enter at least one song.'
        return
    }

    //* Reset the UI for a fresh run
    rows = []
    outputQ.innerHTML = ''
    summaryQ.classList.add('hidden')
    exportStatusQ.textContent = ''
    scrapeButtonQ.disabled = true
    stopButtonQ.disabled = false
    stopButtonQ.classList.remove('hidden')
    statusQ.textContent = `Looking up ${songArray.length} song${songArray.length === 1 ? '' : 's'}…`

    try {
        const result = await window.electronAPI.runLookup(songArray)

        if (result.stopped) {
            // Everything collected before the stop is still on screen and still
            // exportable, so say what was kept rather than treating this as a
            // run that produced nothing.
            statusQ.textContent = `Stopped. ${plural(rows.length, 'song')} kept.`
        } else if (result.ok) {
            const missed = rows.filter((row) => !row.found).length
            statusQ.textContent = missed ? `Done. ${missed} not found.` : 'Done.'
        } else {
            // Already a finished sentence written by whichever client failed,
            // so it goes up as it is. Rows that arrived before the failure stay
            // on screen and stay exportable.
            statusQ.textContent = result.message
        }
    } catch (err) {
        // The handler returns its failures, so reaching here means the bridge
        // itself is broken rather than the lookup.
        statusQ.textContent = `Something went wrong: ${err.message}`
    } finally {
        scrapeButtonQ.disabled = false
        stopButtonQ.classList.add('hidden')
    }
})

//* Stop
// The main process owns the controller, so this only has to ask. The button
// disables itself because a second press has nothing left to do.
stopButtonQ.addEventListener('click', () => {
    stopButtonQ.disabled = true
    statusQ.textContent = 'Stopping…'
    window.electronAPI.cancelLookup()
})

//! Export
async function exportAs(format) {
    if (rows.length === 0) return
    exportStatusQ.textContent = 'Saving…'
    try {
        const result = await window.electronAPI.exportResults(rows, summarise(rows), format)

        if (result.saved) {
            exportStatusQ.textContent = `Saved ${result.fileName}.`
        } else {
            // No reason means the user simply closed the save dialog, which
            // needs no comment.
            exportStatusQ.textContent = result.reason ? `Could not save: ${result.reason}.` : ''
        }
    } catch (err) {
        exportStatusQ.textContent = `Could not save: ${err.message}`
    }
}

exportJsonQ.addEventListener('click', () => exportAs('json'))
exportCsvQ.addEventListener('click', () => exportAs('csv'))

//! Render The Summary
function renderSummary() {
    if (rows.length === 0) {
        summaryQ.classList.add('hidden')
        return
    }
    summaryQ.classList.remove('hidden')

    const summary = summarise(rows)
    const cells = []

    const cell = (label, value, detail) =>
        cells.push(`<div class="stat">
               <span class="stat__label">${escapeHtml(label)}</span>
               <span class="stat__value">${escapeHtml(value)}</span>
               ${detail ? `<span class="stat__detail">${escapeHtml(detail)}</span>` : ''}
          </div>`)

    cell('Songs', String(summary.found), summary.missed ? `${summary.missed} not found` : 'all found')

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

    cell(
        'Artists',
        String(summary.artists.distinct),
        summary.artists.top.length ? `most: ${summary.artists.top[0].name}` : ''
    )

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

    summaryStatsQ.innerHTML = cells.join('')
}

//! Render A Single Song
function renderSong(song) {
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
        ...(song.releaseSecondaryTypes || [])
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
               <dt>BPM</dt><dd>${text(song.bpm === null || song.bpm === undefined ? null : Math.round(song.bpm))}</dd>
               <dt>Mood</dt><dd>${text(moodLine)}</dd>
               <dt>Genres</dt><dd>${list(song.wikiGenres)}</dd>
               <dt>Deezer genres</dt><dd>${list(song.deezerGenres)}</dd>
               <dt>Tags</dt><dd>${list(song.tags)}</dd>
               <dt>ISRC</dt><dd>${text(song.isrc)}</dd>
          </dl>
     </article>`
}
