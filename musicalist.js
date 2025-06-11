//

//! Import

import puppeteer from 'puppeteer'
import path from 'path'


//! Input Data

const songArray = [
     "Never gonna give you up",
     "Clever girl",
     "Pretty fly (for a white guy)",
]


//! Puppeteering Genres

async function genres(array) {
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
     await new Promise(resolve => setTimeout(resolve, 4000)) //todo/ replace with waitForSelector

     //* Loop through the array of songs
     let object = {}
     for(let i = 0; i < length; i++) {
          let song = array[i]

          // search for your song
          await page.waitForSelector("#search-word")
          await page.type("#search-word", song, { delay: (Math.random() + 1) * 30 })
          await page.waitForSelector(".span-class")
          await page.click(".span-class")

          // scrape genres
          await page.waitForSelector(".spotify-result")
          const genres = await page.evaluate(() => {
               const genreElements = document.querySelectorAll(".spotify-result .pl-tags a")
               return Array.from(genreElements).map(el => el.textContent.trim())
          })
          object[song] = genres
          await page.goto("https://www.chosic.com/music-genre-finder/")
     }
     console.log(object)

     //* Close down
     await browser.close()
}
genres(songArray)