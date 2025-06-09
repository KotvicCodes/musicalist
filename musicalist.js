//

//! Import

import puppeteer from 'puppeteer'
import path from 'path'


//! Input Data

const song = "Never gonna give you up"


//! Puppeteering Genres

async function genres(song) {
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
     await new Promise(resolve => setTimeout(resolve, 4000)) //todo/ replace with waitForSelector

     //* Search for your song
     await page.waitForSelector("#search-word")
     await page.type("#search-word", song, { delay: (Math.random() + 1) * 30 })
     await page.waitForSelector(".span-class")
     await page.click(".span-class")

     //* Scrape genres
     await page.waitForSelector(".spotify-result")
     const genres = await page.evaluate(() => {
          const genreElements = document.querySelectorAll(".spotify-result .pl-tags a")
          return Array.from(genreElements).map(el => el.textContent.trim())
     })
     console.log(`"${song}":`, genres)
     
     //* Close down
     await browser.close()
}
genres(song)