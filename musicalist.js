//

//! Import

import puppeteer from 'puppeteer'


//! Input Data

const song = "Shape of You"


//! Puppeteering Genres

async function genres(song) {
     //* Open the website
     const browser = await puppeteer.launch({ headless: false })
     const page = await browser.newPage()
     await page.goto(`https://www.chosic.com/music-genre-finder/`)

     //* Search for your song
     await page.waitForSelector("#search-word")
     await page.type("#search-word", song, { delay: (Math.random() + 1) * 50 })
     await page.waitForSelector(".span-class")
     await page.click(".span-class")

     //* Scrape genres
     await page.waitForNavigation()
     await page.screenshot({ path: 'musicalist.png', fullPage: true })
     
     //* Close down
     await browser.close()
}
genres(song)