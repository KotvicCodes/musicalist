# Musicalist

Musicalist takes a list of songs and gives you back structured metadata for every one of them: artists, album, release date, genres, length, and more. It then summarises the whole list, so you can see what a collection actually looks like rather than reading it song by song.

Data comes from two places. [Deezer's public API](https://developers.deezer.com/api) identifies each track and supplies the catalogue facts, including tempo. [MusicBrainz](https://musicbrainz.org) supplies genres, the original release date, and the release typing. Both are open, so there is nothing to sign up for and nothing to configure: install Musicalist, paste your songs, and go. The app is built with [Electron](https://www.electronjs.org).

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

Type or paste your songs into the text area, separated by commas. Line breaks are ignored, so putting one song per line is fine and easier to read. Click **Proceed**.

Results stream in one at a time as they are found. A song Deezer cannot find still gets a row, so the output always lines up with what you asked for.

### Summary

Once results start arriving, a summary strip appears above them covering the whole list: how many songs were found, the decade spread and the busiest one, average and median length, average and median BPM, the most common genres, the release type mix, distinct artist count, the explicit ratio, and reissue drift.

Reissue drift is worth explaining. Deezer serves whichever release of a song it happens to carry, which for older music is often a remaster. A 1991 track can report a 2011 release date. MusicBrainz knows the original date, so Musicalist shows both and tells you how far off Deezer is across the list.

### Export

**Export JSON** writes every field of every song plus the summary, in one self-contained file. **Export CSV** writes one row per song with lists flattened into single cells, ready for a spreadsheet. The CSV carries a UTF-8 byte order mark so Excel reads accented names correctly.

## What you get per song

| Field                                                                   | Source               |
| ----------------------------------------------------------------------- | -------------------- |
| Title, artists, album, album type, total tracks                         | Deezer               |
| Release date                                                            | Deezer               |
| Duration, explicit flag, track and disc number                          | Deezer               |
| BPM                                                                     | Deezer (where known) |
| ISRC, Deezer URL, cover art                                             | Deezer               |
| Album genres                                                            | Deezer               |
| Genres, with community vote weights                                     | MusicBrainz          |
| Tags                                                                    | MusicBrainz          |
| Original release date                                                   | MusicBrainz          |
| Release type and secondary types (Live, Compilation, Soundtrack, Remix) | MusicBrainz          |
| Recording ID                                                            | MusicBrainz          |

## Limitations

**BPM is not universal.** Deezer publishes a tempo for most tracks but not all. Where it has none, the field is left blank rather than filled with a zero, and the summary says how many songs it had to skip so an average is never mistaken for the whole list.

**No energy, danceability or mood yet.** Spotify [deprecated](https://developer.spotify.com/documentation/web-api/reference/get-audio-features) its audio-features endpoints in November 2024 and restricted them to apps registered before then, and the commercial services charge for access. AcousticBrainz stopped accepting new submissions in 2022, but that only ended collection: the archive it gathered is still served, it is free, and it is keyed by the same recording ID Musicalist already looks up. Danceability and mood are therefore reachable for the songs it happens to hold, and support is being built. Energy is not: nothing free publishes it, so Musicalist would have to invent the number.

**Deezer genres are coarse.** They are attached to the album rather than the track, and tend toward broad buckets like Rock or Pop. That is why MusicBrainz carries the genre load here; the Deezer genres are shown as a bonus.

**Speed is set by MusicBrainz.** MusicBrainz allows one request per second per application and blocks addresses that exceed it, so Musicalist spaces its calls deliberately. Deezer is far more generous, at 50 requests every 5 seconds, so it is never the bottleneck. Expect roughly two to three seconds per song, meaning a hundred-song list takes a few minutes.

**Matching is best-effort.** Songs are matched to MusicBrainz by ISRC where Deezer provides one, which is exact. Where it does not, Musicalist falls back to a text search and picks the most original-looking recording, which is usually right but not guaranteed. Deezer's own search takes the top hit for your query, so an ambiguous query can land on a live version or a remaster; adding the artist name makes it far more reliable.

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

Metadata comes from the [Deezer API](https://developers.deezer.com/api) and [MusicBrainz](https://musicbrainz.org), the latter licensed under [CC0 and CC BY-NC-SA](https://musicbrainz.org/doc/About/Data_License). Deezer data is used under the [Deezer API terms of use](https://developers.deezer.com/termsofuse). Musicalist is not affiliated with or endorsed by either.
