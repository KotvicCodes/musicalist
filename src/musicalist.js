//

//! Import
const puppeteer = require('puppeteer')
const path = require('path')

//! Constants
const SITE_URL = 'https://www.chosic.com/music-genre-finder/'
const FIELD_TIMEOUT = 5000 // how long to wait for a single piece of metadata before giving up on it

//! Helpers

// Pull trimmed text for a selector, returning null when the element is absent.
async function readText(page, selector) {
     try {
          return await page.evaluate((sel) => {
               const el = document.querySelector(sel)
               return el ? el.textContent.trim() : null
          }, selector)
     } catch {
          return null
     }
}

// Collect trimmed text from every element matching a selector.
async function readAll(page, selector) {
     try {
          return await page.evaluate((sel) => {
               const els = document.querySelectorAll(sel)
               return Array.from(els).map((el) => el.textContent.trim())
          }, selector)
     } catch {
          return []
     }
}

// Wait for a selector but never throw: resolves true if it showed up, false on timeout.
async function appeared(page, selector, timeout = FIELD_TIMEOUT) {
     try {
          await page.waitForSelector(selector, { timeout })
          return true
     } catch {
          return false
     }
}

//! Scrape A Single Song
// Any missing metadata is left blank instead of crashing the whole session (issue #10).
async function scrapeSong(page, song, keyDelay) {
     const object = {
          title: null,
          author: null,
          album: null,
          releaseDate: [],
          spotifyGenres: [],
          wikiGenres: []
     }

     // search for the song
     await page.waitForSelector('#search-word')
     await page.type('#search-word', song, { delay: (Math.random() + 1) * keyDelay })

     // if no suggestion shows up the song simply cannot be found: return a blank row
     if (!(await appeared(page, '.span-class'))) return object
     await page.click('.span-class')

     // wait for the result card; bail early (blank row) if it never loads
     if (!(await appeared(page, '.spotify-result'))) return object

     // scrape title
     object.title = await readText(page, 'div.ng-binding a')

     // scrape author
     const author = await readText(page, '.track-list-item-info-genres .ng-binding')
     object.author = author ? author.replace(/^\s*by:\s+/i, '') : null

     // scrape album
     object.album = await readText(page, '.album-data b')

     // scrape release date
     const date = await readText(page, '.album-data')
     const dateMatch = date ? date.match(/\(.*?\)/g) : null
     object.releaseDate = dateMatch ? dateMatch.map((str) => str.replace(/[()]/g, '')) : []

     // scrape Spotify genres
     object.spotifyGenres = await readAll(page, '.spotify-result .pl-tags a')

     // scrape Wikipedia/Last.fm genres: these are frequently missing (the site renders
     // "---" in their place), so wait with a bounded timeout instead of hanging forever
     if (await appeared(page, '.lastfm-taga', FIELD_TIMEOUT)) {
          object.wikiGenres = await readAll(page, '.lastfm-taga')
     }

     return object
}

//! Puppeteering Metadata
async function puppeteering(array, initialTimeout, keyDelay, options = {}) {
     const { headless = false, onProgress } = options

     //* Start the browser with extension
     const extensionPath = path.resolve('no-cookies')
     const browser = await puppeteer.launch({
          headless,
          args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
          ignoreDefaultArgs: ['--disable-extensions']
     })

     try {
          const page = await browser.newPage()

          //* Open the website
          await page.goto(SITE_URL)

          // The cookie extension dismisses the consent banner on its own, but Puppeteer
          // can't observe that popup (issue #6), so we can't waitForSelector on it. Instead
          // we wait for the search field to be interactable and then give the extension a
          // short, configurable settle window rather than a blind fixed delay up front.
          await page.waitForSelector('#search-word', { visible: true })
          await new Promise((resolve) => setTimeout(resolve, initialTimeout))

          //* Loop through the array of songs
          const ultraArray = []
          for (const song of array) {
               let object
               try {
                    object = await scrapeSong(page, song, keyDelay)
               } catch (err) {
                    // a single failing song must never abort the whole run
                    object = {
                         title: song,
                         author: null,
                         album: null,
                         releaseDate: [],
                         spotifyGenres: [],
                         wikiGenres: [],
                         error: err.message
                    }
               }

               ultraArray.push(object)

               // stream the row to the UI as soon as it is ready (issue #10)
               if (typeof onProgress === 'function') onProgress(object)

               // reset for the next search
               await page.goto(SITE_URL)
          }

          return ultraArray
     } finally {
          //* Close down (even if something throws mid-run)
          await browser.close()
     }
}

//! Export
module.exports = puppeteering
