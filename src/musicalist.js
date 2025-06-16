//

//! Import

const puppeteer = require('puppeteer')
const path = require('path')


//! Puppeteering Metadata

async function puppeteering(array, initialTimeout, keyDelay) {
     //* Acess array length
     const length = array.length

     //* Start the browser with extension
     const extensionPath = path.resolve("no-cookies")
     const browser = await puppeteer.launch({ 
          headless: false,
          args: [`--load-extension=${extensionPath}`],
          ignoreDefaultArgs: ["--disable-extensions"]
     })
     const page = await browser.newPage()

     //* Open the website
     await page.goto("https://www.chosic.com/music-genre-finder/")
     await new Promise(resolve => setTimeout(resolve, initialTimeout)) //todo/ replace with waitForSelector

     //* Loop through the array of songs
     let ultraArray = []
     for(let i = 0; i < length; i++) {
          let song = array[i]
          let object = {}

          // search for your song
          await page.waitForSelector("#search-word")
          await page.type("#search-word", song, {delay: (Math.random() + 1) * keyDelay})
          await page.waitForSelector(".span-class")
          await page.click(".span-class")

          // scrape title
          await page.waitForSelector(".spotify-result")
          let title = await page.evaluate(() => {
               const titleEl = document.querySelector("div.ng-binding a")
               return titleEl ? titleEl.textContent.trim() : null
          })

          // scrape author
          let author = await page.evaluate(() => {
               const authorEl = document.querySelector(".track-list-item-info-genres .ng-binding")
               return authorEl ? authorEl.textContent.trim() : null
          })
          author = author.replace(/^\s*by:\s+/i, "")

          // scrape album
          const album = await page.evaluate(() => {
               const albumEl = document.querySelector(".album-data b")
               return albumEl ? albumEl.textContent.trim() : null
          })

          // scrape release date
          let date = await page.evaluate(() => {
               const dateEl = document.querySelector(".album-data")
               return dateEl ? dateEl.textContent.trim() : null
          })
          date = date.match(/\(.*?\)/g).map(str => str.replace(/[()]/g, ""))

          // scrape Spotify genres
          const genresS = await page.evaluate(() => {
               const genreEls = document.querySelectorAll(".spotify-result .pl-tags a")
               return Array.from(genreEls).map(el => el.textContent.trim())
          })

          // scrape Wikipedia genres
          await page.waitForSelector(".lastfm-taga")
          const genresW = await page.evaluate(() => {
               const genreEls = document.querySelectorAll(".lastfm-taga")
               return Array.from(genreEls).map(el => el.textContent.trim())
          })

          // save and restart
          object.title = title
          object.author = author
          object.album = album
          object.releaseDate = date
          object.spotifyGenres = genresS
          object.wikiGenres = genresW
          ultraArray.push(object)
          await page.goto("https://www.chosic.com/music-genre-finder/")
     }

     //* Close down
     await browser.close()
     return ultraArray
}


//! Export

module.exports = puppeteering