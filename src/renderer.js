// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Constants
const REPO_URL = 'https://github.com/KotvicCodes/musicalist#readme'
const DASHBOARD_URL = 'https://developer.spotify.com/dashboard'
const MARKET_KEY = 'musicalist.market'

const { summarise, formatDuration } = window.MusicalistAnalysis
const { escapeHtml, textToArray } = window.MusicalistText

//! State
// Every row received this run, kept so the summary and the exporters have
// something to work from without asking the main process again.
let rows = []

//! Elements
const inputTextareaQ = document.getElementById('inputTextareaQ')
const scrapeButtonQ = document.getElementById('scrapeButtonQ')
const outputQ = document.getElementById('outputQ')
const statusQ = document.getElementById('statusQ')

const advancedQ = document.getElementById('advancedQ')
const advancedButtonQ = document.getElementById('advancedButtonQ')
const clientIdQ = document.getElementById('clientIdQ')
const clientSecretQ = document.getElementById('clientSecretQ')
const marketQ = document.getElementById('marketQ')
const saveCredentialsQ = document.getElementById('saveCredentialsQ')
const clearCredentialsQ = document.getElementById('clearCredentialsQ')
const credentialsStatusQ = document.getElementById('credentialsStatusQ')

const summaryQ = document.getElementById('summaryQ')
const summaryStatsQ = document.getElementById('summaryStatsQ')
const exportJsonQ = document.getElementById('exportJsonQ')
const exportCsvQ = document.getElementById('exportCsvQ')
const exportStatusQ = document.getElementById('exportStatusQ')

const helpButtonQ = document.getElementById('helpButtonQ')
const dashboardLinkQ = document.getElementById('dashboardLinkQ')

//! Advanced Settings

//* Open settings
advancedButtonQ.addEventListener('click', () => {
     const open = advancedQ.classList.toggle('hidden') === false
     advancedButtonQ.setAttribute('aria-expanded', String(open))
})

//* Market, remembered between sessions
marketQ.value = localStorage.getItem(MARKET_KEY) ?? 'US'
marketQ.addEventListener('change', () => {
     localStorage.setItem(MARKET_KEY, marketQ.value)
})

//* Credentials
// The secret is write-only from here: the main process reports that one exists
// but never hands it back, so the field shows a placeholder instead.
async function refreshCredentials() {
     const stored = await window.electronAPI.getCredentials()
     clientIdQ.value = stored.clientId || ''
     clientSecretQ.value = ''
     clientSecretQ.placeholder = stored.hasSecret ? '•••••••• saved' : ''

     if (!stored.hasSecret) {
          credentialsStatusQ.textContent = 'No credentials saved yet.'
     } else if (stored.source === 'environment') {
          credentialsStatusQ.textContent = 'Using credentials from your environment.'
     } else if (stored.source === 'session') {
          credentialsStatusQ.textContent = 'Saved for this session only.'
     } else {
          credentialsStatusQ.textContent = 'Credentials saved.'
     }

     return stored
}

saveCredentialsQ.addEventListener('click', async () => {
     const clientId = clientIdQ.value.trim()
     const clientSecret = clientSecretQ.value.trim()

     if (!clientId || !clientSecret) {
          credentialsStatusQ.textContent = 'Enter both a Client ID and a Client Secret.'
          return
     }

     try {
          const result = await window.electronAPI.setCredentials(clientId, clientSecret)
          clientSecretQ.value = ''
          clientSecretQ.placeholder = '•••••••• saved'
          credentialsStatusQ.textContent = result.persisted
               ? 'Credentials saved.'
               : 'Saved for this session only: your system keychain is unavailable.'
     } catch (err) {
          credentialsStatusQ.textContent = err.message
     }
})

clearCredentialsQ.addEventListener('click', async () => {
     await window.electronAPI.clearCredentials()
     await refreshCredentials()
     credentialsStatusQ.textContent = 'Credentials forgotten.'
})

refreshCredentials()

//! Links
helpButtonQ.addEventListener('click', () => {
     window.electronAPI.openExternal(REPO_URL)
})

dashboardLinkQ.addEventListener('click', (event) => {
     event.preventDefault()
     window.electronAPI.openExternal(DASHBOARD_URL)
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
     const songArray = textToArray(inputTextareaQ.value)
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
     statusQ.textContent = `Looking up ${songArray.length} song${songArray.length === 1 ? '' : 's'}…`

     try {
          await window.electronAPI.runLookup(songArray, marketQ.value)
          const missed = rows.filter((row) => !row.found).length
          statusQ.textContent = missed ? `Done. ${missed} not found.` : 'Done.'
     } catch (err) {
          statusQ.textContent = `Something went wrong: ${err.message}`
     } finally {
          scrapeButtonQ.disabled = false
     }
})

//! Export
async function exportAs(format) {
     if (rows.length === 0) return
     exportStatusQ.textContent = 'Saving…'
     try {
          const result = await window.electronAPI.exportResults(rows, summarise(rows), format)
          exportStatusQ.textContent = result.saved ? `Saved ${result.fileName}.` : ''
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

     const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

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
               `Spotify dates them ${summary.reissueDrift.averageYears} years late on average`
          )
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
               <p class="song__note">${song.error ? `Failed: ${escapeHtml(song.error)}` : 'Not found on Spotify.'}</p>
          </article>`
     }

     // Spotify's date is the release it happens to serve, so show the original
     // alongside it whenever MusicBrainz disagrees.
     const spotifyDate = (song.releaseDate || [])[0]
     const released =
          song.originalReleaseDate && song.originalReleaseDate !== spotifyDate
               ? `${text(song.originalReleaseDate)} <span class="song__aside">(Spotify: ${text(spotifyDate)})</span>`
               : text(spotifyDate || song.originalReleaseDate)

     const albumLine = [
          song.album,
          song.releaseType || song.albumType,
          ...(song.releaseSecondaryTypes || [])
     ]
          .filter(Boolean)
          .join(' · ')

     return `<article class="song">
          <h2 class="song__title">${text(song.title)}</h2>
          <dl class="song__meta">
               <dt>Author</dt><dd>${text(song.author)}</dd>
               <dt>Album</dt><dd>${text(albumLine)}</dd>
               <dt>Released</dt><dd>${released}</dd>
               <dt>Length</dt><dd>${text(formatDuration(song.durationMs))}</dd>
               <dt>Genres</dt><dd>${list(song.wikiGenres)}</dd>
               <dt>Spotify genres</dt><dd>${list(song.spotifyGenres)}</dd>
               <dt>Tags</dt><dd>${list(song.tags)}</dd>
               <dt>ISRC</dt><dd>${text(song.isrc)}</dd>
          </dl>
     </article>`
}
