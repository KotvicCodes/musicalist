//

//! Import

import puppeteer from 'puppeteer'
import path from 'path'


//! Input Data

const song = "Shape of You"


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
     await page.goto(`https://www.chosic.com/music-genre-finder/`)
     await new Promise(resolve => setTimeout(resolve, 10000))
     await page.screenshot({ path: 'musicalist.png', fullPage: true })

     //* Search for your song
/*   await page.waitForSelector("#search-word")
     await page.type("#search-word", song, { delay: (Math.random() + 1) * 50 })
     await page.waitForSelector(".span-class")
     await page.click(".span-class")

     //* Scrape genres
     await page.waitForNavigation()
     await page.screenshot({ path: 'musicalist.png', fullPage: true }) */
     
     //* Close down
     await browser.close()
}
genres(song)