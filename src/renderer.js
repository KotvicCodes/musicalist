//

//! Advanced Settings

//* Page render

const initialDelayQ = document.getElementById("initialDelayQ")
const keyDelayQ = document.getElementById("keyDelayQ")

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

const advancedQ = document.getElementById("advancedQ")
const advancedButtonQ = document.getElementById("advancedButtonQ")

advancedButtonQ.addEventListener('click', () => {
     advancedQ.classList.toggle("hidden")
})


//! Puppeteer Click

const inputTextareaQ = document.getElementById("inputTextareaQ")
const scrapeButtonQ = document.getElementById("scrapeButtonQ")

scrapeButtonQ.addEventListener('click', async () => {

     //* Get the input value
     const songArray = textToArray(inputTextareaQ.value)
     const response = await window.electronAPI.runPuppeteer(songArray, initialDelay, keyDelay)

     if(response) {
          console.log('Got title:', response)
     }
})


//! Collect Songs From Textarea

function textToArray(text) {
     let array = []
     text = text.trim()

     if(text.length === 0) {
         return array
     }
     const lines = text.split(',')
     array = lines.map(line => line.trim()).filter(line => line.length > 0)
     // Remove duplicates
     array = [...new Set(array)]

     return array
}