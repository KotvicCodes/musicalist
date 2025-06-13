//

//! Input
const songArray = [
     "Never gonna give you up",
     "Clever girl",
     "Pretty fly (for a white guy)",
]


//! Puppeteer Click

const scrapeQ = document.getElementById("scrapeQ")

scrapeQ.addEventListener('click', async () => {
     console.log("Scraping genres...")
     const response = await window.electronAPI.runPuppeteer(songArray)
   
     if(response) {
          console.log('Got title:', response)
     }
})