# Musicalist

Musicalist takes a list of songs and gives you back structured metadata for every one of them: artists, album, release date, genres, length, and more. It then summarises the whole list, so you can see what a collection actually looks like rather than reading it song by song.

Data comes from four places. [Deezer's public API](https://developers.deezer.com/api) identifies each track and supplies the catalogue facts, including tempo, loudness and the record label. [MusicBrainz](https://musicbrainz.org) supplies genres, the original release date, the release typing and the production credits. [AcousticBrainz](https://acousticbrainz.org) adds the musical key, danceability and mood where its archive reaches. [ListenBrainz](https://listenbrainz.org) adds how much each song has actually been listened to. All four are open, so there is nothing to sign up for and nothing to configure: install Musicalist, paste your songs, and go. The app is built with [Electron](https://www.electronjs.org).

This project follows [Semantic Versioning](https://semver.org). See the [latest release](https://github.com/KotvicCodes/musicalist/releases/latest) for the current version.

## Install

Grab the build for your system from the [releases page](https://github.com/KotvicCodes/musicalist/releases/latest).

| System               | Download                        | What to do                                                 |
| -------------------- | ------------------------------- | ---------------------------------------------------------- |
| macOS, Apple Silicon | `musicalist-darwin-arm64-*.zip` | Unzip and move Musicalist to Applications                  |
| Windows              | `*Setup.exe`                    | Run the installer, or take the zip if you want it portable |
| Linux                | `*.deb` or `*.rpm`              | Install with your package manager, or take the zip         |

Intel Macs are not built. On an Intel Mac, or any other system without a package above, build it yourself with the steps under [Development](#development).

The `.nupkg` and `RELEASES` files on the release are used by the Windows installer's own updater. You do not need to download them.

### The first launch will warn you

The builds are not code signed, because signing needs paid Apple and Windows certificates. The apps are fine, but your system has no way to confirm that, so it will object the first time:

- **macOS** refuses to open Musicalist and offers to move it to the Bin. Open **System Settings**, go to **Privacy & Security**, scroll to the bottom, and click **Open Anyway** next to the message about Musicalist. You only need to do this once. Right clicking and choosing Open no longer works on macOS 15 and later; Apple removed that shortcut.

    If the button is not there, clear the download flag from Terminal instead and then open the app normally:

    ```
    xattr -dr com.apple.quarantine /Applications/musicalist.app
    ```

- **Windows** shows a SmartScreen prompt. Choose More info, then Run anyway.

That is the only hurdle. There is no setup step after it: both APIs Musicalist uses are open, so there are no accounts to create, no keys to paste, and no keychain prompt.

## Using it

Type or paste your songs into the text area, one per line. Click **Proceed**.

**Split on** decides how the list is broken up. **Auto** uses line breaks whenever the text has any and falls back to commas for a single line, which is right almost always. Pick **Comma**, **New line** or **Semicolon** yourself when it is not: a comma-separated list that wraps across several lines needs **Comma**, and a list of titles that themselves contain commas, like _Hey, Soul Sister_, needs **New line**.

Results stream in one at a time as they are found. A song Deezer cannot find still gets a row, so the output always lines up with what you asked for. **Stop** ends a run early and keeps everything collected so far, which stays on screen and stays exportable.

### Summary

Once results start arriving, a summary strip appears above them covering the whole list: how many songs were found, the decade spread and the busiest one, average and median length, average and median BPM, the most common genres and musical key, the release type mix, distinct artist count, collaborations, the top record label, master loudness, median listens, the explicit ratio, reissue drift, how many songs are not the original recording, and how many are worth checking by hand.

Reissue drift is worth explaining. Deezer serves whichever release of a song it happens to carry, which for older music is often a remaster. A 1991 track can report a 2011 release date. MusicBrainz knows the original date, so Musicalist shows both and tells you how far off Deezer is across the list.

### Export

**Export JSON** writes every field of every song plus the summary, in one self-contained file. **Export CSV** writes one row per song with lists flattened into single cells, ready for a spreadsheet. The CSV carries a UTF-8 byte order mark so Excel reads accented names correctly.

## What you get per song

| Field                                                                   | Source                    |
| ----------------------------------------------------------------------- | ------------------------- |
| Title, artists and their roles, album, album type, total tracks         | Deezer                    |
| Release date                                                            | Deezer                    |
| Duration, explicit flag and rating, track and disc number               | Deezer                    |
| BPM                                                                     | Deezer, or AcousticBrainz |
| Loudness in decibels (ReplayGain)                                       | Deezer                    |
| Record label, barcode                                                   | Deezer                    |
| Popularity rank, preview URL                                            | Deezer                    |
| ISRC, Deezer URL, cover art                                             | Deezer                    |
| Album genres                                                            | Deezer                    |
| Genres, with community vote weights                                     | MusicBrainz               |
| Tags                                                                    | MusicBrainz               |
| Original release date                                                   | MusicBrainz               |
| Release type and secondary types (Live, Compilation, Soundtrack, Remix) | MusicBrainz               |
| Version note (live, remix, radio edit)                                  | MusicBrainz               |
| Production credits (producer, engineer, players)                        | MusicBrainz               |
| Canonical recording length, every known ISRC                            | MusicBrainz               |
| Wikidata, Discogs and Cover Art Archive links                           | MusicBrainz               |
| Recording ID                                                            | MusicBrainz               |
| Musical key and scale, key strength                                     | AcousticBrainz            |
| Average loudness, dynamic complexity, beat count                        | AcousticBrainz            |
| Danceability                                                            | AcousticBrainz            |
| Mood: happy, sad, aggressive, relaxed, party, acoustic, electronic      | AcousticBrainz            |
| Timbre (bright or dark), tonality, MIREX mood cluster                   | AcousticBrainz            |
| Instrumental                                                            | AcousticBrainz            |
| Listen count and listener count                                         | ListenBrainz              |
| Match confidence against your query                                     | Musicalist                |

## Limitations

**BPM is not universal.** Deezer publishes a tempo for most tracks but not all. Where it has none, AcousticBrainz's own estimate fills the gap if the archive holds the recording, and the export records which of the two answered. Where neither has one, the field is left blank rather than filled with a zero, and the summary says how many songs it had to skip so an average is never mistaken for the whole list.

**Mood stops at 2022.** Danceability and mood come from AcousticBrainz, which stopped accepting new submissions in 2022. The archive it gathered is still served and still free, but nothing has been added since, so a song released after the cutoff almost never has an analysis. Older catalogue is covered well. Where there is nothing, the fields are left blank rather than filled with a zero, which is a real score here, and the summary says how many songs it could analyse.

**Mood is a guess, not a measurement.** Each figure is a classifier's probability, not a fact about the song, and the models were trained on small sets. Treat them as a rough sort rather than a verdict. The musical key, loudness and beat count are different: those are measured rather than classified.

Musicalist deliberately ignores the archive's genre and gender classifiers, which are unreliable enough to file "Smells Like Teen Spirit" as trance; genres come from MusicBrainz instead. Its ballroom rhythm classifier is ignored for the same reason. It was trained on ballroom dance styles alone and has no way to answer "none of these", so it files ordinary rock songs as a Quickstep or a Viennese Waltz.

**No energy.** Spotify [deprecated](https://developer.spotify.com/documentation/web-api/reference/get-audio-features) its audio-features endpoints in November 2024 and restricted them to apps registered before then, the commercial services charge for access, and AcousticBrainz never published an energy classifier. Musicalist could only invent the number, so it does not report one. The nearest honest substitutes are in the output already: ReplayGain from Deezer and average loudness from AcousticBrainz are both measured, and danceability is at least a stated probability rather than a guess dressed as a fact.

**Deezer genres are coarse.** They are attached to the album rather than the track, and tend toward broad buckets like Rock or Pop. That is why MusicBrainz carries the genre load here; the Deezer genres are shown as a bonus.

**Speed is set by MusicBrainz.** MusicBrainz allows one request per second per application and blocks addresses that exceed it, so Musicalist spaces its calls deliberately. Deezer is far more generous, at 50 requests every 5 seconds, so it is never the bottleneck. AcousticBrainz adds a request per song, and a second one for the songs it actually holds, but both land inside a gap MusicBrainz was already making the run wait out, so they cost almost nothing. ListenBrainz takes the whole list in a single request. Expect roughly two to three seconds per song, meaning a hundred-song list takes a few minutes. **Stop** ends a run early and keeps what it has.

**Matching is best-effort.** Songs are matched to MusicBrainz by ISRC where Deezer provides one, which is exact. Where it does not, Musicalist falls back to a text search and picks the most original-looking recording, which is usually right but not guaranteed.

Deezer's own search is scored rather than taken on trust: Musicalist asks for several candidates, ranks them against your query, and refuses the lot when nothing is a credible answer, because a confident wrong song is worse than a row saying nothing was found. A match that scrapes through is marked on the card and carries a confidence in the export. Two further signals point at the same problem from other directions: MusicBrainz's version note says outright when a recording is a live take or a remix, and a wide gap between Deezer's duration and MusicBrainz's usually means the two are not describing the same recording at all. Adding the artist name to your query still makes everything more reliable.

## Development

Run it from source:

```bash
npm install
npm start
```

Run the tests:

```bash
npm test
```

Tests run on Node's built-in test runner with no extra dependencies. Network calls are stubbed, so the suite needs no connection.

Build a package for the platform you are on:

```bash
npm run make
```

The result lands in `out/make`.

## License

Musicalist is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

Musicalist is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The full licence text is in [LICENSE.txt](LICENSE.txt), or at <https://www.gnu.org/licenses/>.

## Credits

Metadata comes from the [Deezer API](https://developers.deezer.com/api) and from [MusicBrainz](https://musicbrainz.org), [AcousticBrainz](https://acousticbrainz.org) and [ListenBrainz](https://listenbrainz.org), the MetaBrainz projects, licensed under [CC0 and CC BY-NC-SA](https://musicbrainz.org/doc/About/Data_License). Cover art comes from the [Cover Art Archive](https://coverartarchive.org). Deezer data is used under the [Deezer API terms of use](https://developers.deezer.com/termsofuse). Musicalist is not affiliated with or endorsed by any of them.
