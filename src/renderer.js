// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const REPO_URL = 'https://github.com/KotvicCodes/musicalist#readme'

const { summarise } = window.MusicalistAnalysis
const { textToArray } = window.MusicalistText
const { songCard, summaryCells } = window.MusicalistCard

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
    outputQ.insertAdjacentHTML('beforeend', songCard(song))
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

        // Popularity is fetched for the whole list in one request once the loop
        // is done, so the rows that streamed in are a preview and these are the
        // finished ones. Re-rendering from them is a single write.
        if (Array.isArray(result.rows)) {
            rows = result.rows
            outputQ.innerHTML = rows.map(songCard).join('')
            renderSummary()
        }

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
    summaryStatsQ.innerHTML = summaryCells(summarise(rows)).join('')
}
