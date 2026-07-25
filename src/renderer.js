//

//! Constants
const REPO_URL = 'https://github.com/KotvicCodes/musicalist#readme'

//! Advanced Settings

//* Page render
const initialDelayQ = document.getElementById('initialDelayQ')
const keyDelayQ = document.getElementById('keyDelayQ')
const headlessQ = document.getElementById('headlessQ')

initialDelayQ.value = 2750
keyDelayQ.value = 20

let keyDelay = parseInt(keyDelayQ.value, 10)
let initialDelay = parseInt(initialDelayQ.value, 10)

//* Updating values
initialDelayQ.addEventListener('input', () => {
     initialDelay = parseInt(initialDelayQ.value, 10)
})

keyDelayQ.addEventListener('input', () => {
     keyDelay = parseInt(keyDelayQ.value, 10)
})

//* Open settings
const advancedQ = document.getElementById('advancedQ')
const advancedButtonQ = document.getElementById('advancedButtonQ')

advancedButtonQ.addEventListener('click', () => {
     const open = advancedQ.classList.toggle('hidden') === false
     advancedButtonQ.setAttribute('aria-expanded', String(open))
})

//! Help Button
const helpButtonQ = document.getElementById('helpButtonQ')
helpButtonQ.addEventListener('click', () => {
     window.electronAPI.openExternal(REPO_URL)
})

//! Puppeteer Click
const inputTextareaQ = document.getElementById('inputTextareaQ')
const scrapeButtonQ = document.getElementById('scrapeButtonQ')
const outputQ = document.getElementById('outputQ')
const statusQ = document.getElementById('statusQ')

//* Stream each finished song into the output as it arrives
window.electronAPI.onProgress((song) => {
     outputQ.insertAdjacentHTML('beforeend', renderSong(song))
})

scrapeButtonQ.addEventListener('click', async () => {
     //* Get the input value
     const songArray = textToArray(inputTextareaQ.value)
     if (songArray.length === 0) {
          statusQ.textContent = 'Please enter at least one song.'
          return
     }

     //* Reset the UI for a fresh run
     outputQ.innerHTML = ''
     scrapeButtonQ.disabled = true
     statusQ.textContent = `Scraping ${songArray.length} song${songArray.length === 1 ? '' : 's'}…`

     try {
          await window.electronAPI.runPuppeteer(songArray, initialDelay, keyDelay, headlessQ.checked)
          statusQ.textContent = 'Done.'
     } catch (err) {
          statusQ.textContent = `Something went wrong: ${err.message}`
     } finally {
          scrapeButtonQ.disabled = false
     }
})

//! Render A Single Song
function renderSong(song) {
     const list = (values) => (values && values.length ? escapeHtml(values.join(', ')) : '—')
     const text = (value) => (value ? escapeHtml(value) : '—')

     return `<article class="song">
          <h2 class="song__title">${text(song.title)}</h2>
          <dl class="song__meta">
               <dt>Author</dt><dd>${text(song.author)}</dd>
               <dt>Album</dt><dd>${text(song.album)}</dd>
               <dt>Release date</dt><dd>${list(song.releaseDate)}</dd>
               <dt>Spotify genres</dt><dd>${list(song.spotifyGenres)}</dd>
               <dt>Wikipedia genres</dt><dd>${list(song.wikiGenres)}</dd>
          </dl>
     </article>`
}

//! Escape User/Scraped Text Before Injecting As HTML
function escapeHtml(value) {
     return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
}

//! Collect Songs From Textarea

function textToArray(text) {
     let array = []
     text = text.trim()

     if (text.length === 0) {
          return array
     }
     const lines = text.split(',')
     array = lines.map((line) => line.trim()).filter((line) => line.length > 0)
     // remove duplicates
     array = [...new Set(array)]

     return array
}
