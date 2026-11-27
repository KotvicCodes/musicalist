// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ExportFormat, SongRow } from './types.js'

//! Constants
const REPO_URL = 'https://github.com/KotvicCodes/musicalist#readme'

import { summarise } from './analysis.js'
import { filterRows } from './filter.js'
import { textToArray } from './text.js'
import { songCard, summaryCells } from './song-card.js'

//! Helpers
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

//! State
// Every row received this run, kept so the summary and the exporters have
// something to work from without asking the main process again.
let rows: SongRow[] = []

//! Elements
// These elements are fixed by index.html; fail at the missing control rather
// than leaving an unchecked null in every event callback.
function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id)
    if (!found) throw new Error('A required application control is missing.')
    return found as T
}

const inputTextareaQ = element<HTMLTextAreaElement>('inputTextareaQ')
const separatorQ = element<HTMLSelectElement>('separatorQ')
const scrapeButtonQ = element<HTMLButtonElement>('scrapeButtonQ')
const stopButtonQ = element<HTMLButtonElement>('stopButtonQ')
const outputQ = element('outputQ')
const statusQ = element('statusQ')

const summaryQ = element('summaryQ')
const summaryStatsQ = element('summaryStatsQ')
const exportJsonQ = element<HTMLButtonElement>('exportJsonQ')
const exportCsvQ = element<HTMLButtonElement>('exportCsvQ')
const exportStatusQ = element('exportStatusQ')
const filterInputQ = element<HTMLInputElement>('filterInputQ')
const filterStatusQ = element<HTMLSelectElement>('filterStatusQ')
const filterCountQ = element('filterCountQ')

const helpButtonQ = element<HTMLButtonElement>('helpButtonQ')

//! Links
helpButtonQ.addEventListener('click', () => {
    window.electronAPI.openExternal(REPO_URL)
})

//! Keyboard Shortcuts
inputTextareaQ.addEventListener('keydown', (event) => {
    // An Enter that confirms an IME composition belongs to the input method,
    // not to the app; acting on it would look up a half-typed title.
    if (event.isComposing) return
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !scrapeButtonQ.disabled) {
        event.preventDefault()
        scrapeButtonQ.click()
    }
})

document.addEventListener('keydown', (event) => {
    if (event.target === filterInputQ && filterInputQ.value) return
    if (event.key === 'Escape' && !stopButtonQ.classList.contains('hidden') && !stopButtonQ.disabled) {
        event.preventDefault()
        stopButtonQ.click()
    }
})

//! Filtering
filterInputQ.addEventListener('input', renderOutput)
filterStatusQ.addEventListener('change', renderOutput)

//! Lookup

//* Stream each finished song into the output as it arrives
// Appends in place rather than rewriting innerHTML on every tick, so a user
// selecting text on an earlier card does not lose their selection when the
// next song lands.
window.electronAPI.onProgress((song) => {
    rows.push(song)
    const status = filterStatusQ.value
    const query = filterInputQ.value
    const isFiltered = status !== 'all' || query.trim().length > 0
    const visible = filterRows(rows, { status, query })

    if (filterRows([song], { status, query }).length > 0) {
        const empty = outputQ.querySelector('.output__empty')
        if (empty) empty.remove()
        outputQ.insertAdjacentHTML('beforeend', songCard(song))
    } else if (visible.length === 0 && !outputQ.querySelector('.output__empty')) {
        outputQ.innerHTML = '<p class="output__empty">No songs match the current filter.</p>'
    }

    filterCountQ.textContent = isFiltered
        ? `Showing ${visible.length} of ${plural(rows.length, 'song')}`
        : ''
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
    filterInputQ.value = ''
    filterStatusQ.value = 'all'
    filterCountQ.textContent = ''
    scrapeButtonQ.disabled = true
    stopButtonQ.disabled = false
    stopButtonQ.classList.remove('hidden')
    statusQ.textContent = `Looking up ${songArray.length} song${songArray.length === 1 ? '' : 's'}…`

    try {
        const result = await window.electronAPI.runLookup(songArray)

        // Popularity is fetched for the whole list in one request once the loop
        // is done, so the rows that streamed in are a preview and these are the
        // finished ones. Re-rendering from them is a single write.
        if (result.ok && Array.isArray(result.rows)) {
            rows = result.rows
            renderOutput()
            renderSummary()
        }

        if (result.ok && result.stopped) {
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
        statusQ.textContent = 'Something went wrong during the lookup.'
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
async function exportAs(format: ExportFormat): Promise<void> {
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
        exportStatusQ.textContent = 'Could not save the results.'
    }
}

exportJsonQ.addEventListener('click', () => exportAs('json'))
exportCsvQ.addEventListener('click', () => exportAs('csv'))

//! Render The Output And Summary
function renderOutput() {
    const status = filterStatusQ.value
    const query = filterInputQ.value
    const isFiltered = status !== 'all' || query.trim().length > 0
    const visible = filterRows(rows, { status, query })

    if (rows.length > 0 && visible.length === 0) {
        outputQ.innerHTML = '<p class="output__empty">No songs match the current filter.</p>'
    } else {
        outputQ.innerHTML = visible.map(songCard).join('')
    }

    filterCountQ.textContent = isFiltered
        ? `Showing ${visible.length} of ${plural(rows.length, 'song')}`
        : ''
}

function renderSummary() {
    if (rows.length === 0) {
        summaryQ.classList.add('hidden')
        return
    }

    summaryQ.classList.remove('hidden')
    summaryStatsQ.innerHTML = summaryCells(summarise(rows)).join('')
}
