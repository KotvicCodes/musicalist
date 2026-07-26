# Musicalist

Musicalist takes a list of songs and gives you back structured metadata for every one of them: artists, album, release date, genres, length, and more. It then summarises the whole list, so you can see what a collection actually looks like rather than reading it song by song.

Data comes from two places. [Spotify's Web API](https://developer.spotify.com/documentation/web-api) identifies each track and supplies the catalogue facts. [MusicBrainz](https://musicbrainz.org) supplies genres, the original release date, and the release typing. The app is built with [Electron](https://www.electronjs.org).

This project follows [Semantic Versioning](https://semver.org). The current release is [1.0.0](https://github.com/KotvicCodes/musicalist/releases/latest).

## Install

Download the latest build from the [releases page](https://github.com/KotvicCodes/musicalist/releases/latest), unzip it, and move Musicalist to your Applications folder.

Only a macOS build is published at the moment. On Windows or Linux, build it yourself with the steps under [Development](#development) and run `npm run make`; the Squirrel, deb and rpm packagers are already configured and will produce a package for whichever platform you build on.

Then follow the setup below, which every platform needs.

## Setup

Musicalist talks to Spotify with your own API credentials, so nothing is shared between users and your lookups count against your own quota. Getting them takes about two minutes:

1. Sign in at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app. Any name and description will do. When it asks for a redirect URI, enter anything valid, for example `http://localhost:3000`; Musicalist never uses it.
3. Open the app's settings and copy the **Client ID** and **Client Secret**.
4. In Musicalist, open **Advanced settings**, paste both in, and click **Save**.

The credentials are encrypted with your operating system's keychain and stored on your machine only. They are never sent anywhere except to Spotify's own token endpoint. If your keychain is unavailable, Musicalist says so and keeps them in memory for that session instead of writing them out in the clear.

Developers can set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in the environment instead; those take precedence over anything saved in the app.

## Using it

Type or paste your songs into the text area, separated by commas. Line breaks are ignored, so putting one song per line is fine and easier to read. Click **Proceed**.

Results stream in one at a time as they are found. A song Spotify cannot find still gets a row, so the output always lines up with what you asked for.

### Market

Under Advanced settings, **Market** picks which country's catalogue to search. It changes which release of a song you get back, which in turn affects the album and the Spotify release date. Leave it on Any if you do not care.

### Summary

Once results start arriving, a summary strip appears above them covering the whole list: how many songs were found, the decade spread and the busiest one, average and median length, the most common genres, the release type mix, distinct artist count, the explicit ratio, and reissue drift.

Reissue drift is worth explaining. Spotify serves whichever release of a song it happens to carry, which for older music is usually a remaster. A 1975 track routinely reports a 2011 release date. MusicBrainz knows the original date, so Musicalist shows both and tells you how far off Spotify is across the list.

### Export

**Export JSON** writes every field of every song plus the summary, in one self-contained file. **Export CSV** writes one row per song with lists flattened into single cells, ready for a spreadsheet. The CSV carries a UTF-8 byte order mark so Excel reads accented names correctly.

## What you get per song

| Field                                                                   | Source                    |
| ----------------------------------------------------------------------- | ------------------------- |
| Title, artists, album, album type, total tracks                         | Spotify                   |
| Release date and its precision                                          | Spotify                   |
| Duration, explicit flag, track and disc number                          | Spotify                   |
| ISRC, Spotify URL, cover art                                            | Spotify                   |
| Artist genres                                                           | Spotify (see limitations) |
| Genres, with community vote weights                                     | MusicBrainz               |
| Tags                                                                    | MusicBrainz               |
| Original release date                                                   | MusicBrainz               |
| Release type and secondary types (Live, Compilation, Soundtrack, Remix) | MusicBrainz               |
| Recording ID                                                            | MusicBrainz               |

## Limitations

**No audio features.** Tempo, energy, danceability, valence, and key are not available. Spotify [deprecated](https://developer.spotify.com/documentation/web-api/reference/get-audio-features) those endpoints and restricted them to apps registered before November 2024, so a newly created app cannot reach them at all. There is no BPM or mood analysis in Musicalist and there cannot be one.

**Spotify genres are fading.** The artist `genres` field is marked deprecated in Spotify's own reference and increasingly comes back empty. That is exactly why MusicBrainz carries the genre load here. Spotify genres are still shown when present, but treat them as a bonus.

**Speed is set by MusicBrainz.** MusicBrainz allows one request per second per application and blocks addresses that exceed it, so Musicalist spaces its calls deliberately. Expect roughly two to three seconds per song, meaning a hundred-song list takes a few minutes. This is still far faster than the browser scraping Musicalist used before 1.0.0, and it needs no visible window.

**Matching is best-effort.** Songs are matched to MusicBrainz by ISRC where Spotify provides one, which is exact. Where it does not, Musicalist falls back to a text search and picks the most original-looking recording, which is usually right but not guaranteed.

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

Tests run on Node's built-in test runner with no extra dependencies. Network calls are stubbed, so the suite needs no credentials and no connection.

Build a package for the platform you are on:

```bash
npm run make
```

The result lands in `out/make`.

## Credits

Metadata comes from [Spotify](https://developer.spotify.com/documentation/web-api) and [MusicBrainz](https://musicbrainz.org), the latter licensed under [CC0 and CC BY-NC-SA](https://musicbrainz.org/doc/About/Data_License). Musicalist is not affiliated with or endorsed by either.
