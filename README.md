# Musicalist
Beware Musicalist app is still in active development, and there's no official `1.0.0` package released yet; however, if you'd like to use it, feel free. It mostly works.

This app aims to help you get metadata (including artists, album name, release date, genres from Spotify and Wikipedia alike) about songs you provide. It might provide you with more data in the future.
  
It parses data from Spotify using website [Chosic](https://www.chosic.com), and gets through the cookie policies with [I still don't care about Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies?tab=GPL-3.0-1-ov-file#readme) browser extension. The UI of the app is made with [Electron](https://www.electronjs.org).
  
This project's packages honor the [Semantic Versioning protocol](https://semver.org) or will do so when they are released.

## User Manual
### For most users:
The most important part for most users is the text area. Write all songs you want the metadata of and separate them with commas. I recommend also separating them with line breaks for readability. Once you're set, click the "Proceed" button to start the script and wait for the results.

### Advanced:
You may have also noticed that there are two more inputs down below, named **Initial delay** and **Key delay**.

#### Initial delay
It is for setting up the delay before searching for the first song. You might ask, why is there a delay in the first place. It is there in order to give the extension enough time to close cookies. It was tested to work with the preset values, but you can test different values, for example if the app crashes a lot on your computer increase the value, or try decreasing it to as low a number as possible before the app stops working if you give it a lot of queries (You aren't likely to save more than a couple hundred milliseconds as I set the number pretty low already).

#### Key delay
This is a value representing the delay between key strokes when searching for the songs on the page. The value represents the average cooldown between two key strokes, not the exact value as the delay is randomized for lowering suspicion. Lower only at your own risk, as some websites ban IP addresses with a lot of suspicious traffic (anti-bots). Lowering the value may notify their radars, but it hasn't been proven there's something on the website. If you are concerned about this, try increasing this value. Although there wasn't much testing done, I believe you should get away with this one, however.
