//

//! Link HTML

const inputTextareaQ = document.getElementById("inputTextareaQ")
const scrapeButtonQ = document.getElementById("scrapeButtonQ")


//! Puppeteer Click

scrapeButtonQ.addEventListener('click', async () => {

     //* Get the input value
     const songArray = textToArray(inputTextareaQ.value)

     const response = await window.electronAPI.runPuppeteer(songArray)

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