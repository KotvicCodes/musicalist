//

const test = require('node:test')
const assert = require('node:assert/strict')

const { summarise, formatDuration, effectiveYear } = require('../src/analysis.js')
const { songRow } = require('./helpers.js')

//! Counts
test('counts found and missed songs', () => {
     const summary = summarise([songRow(), songRow({ found: false, query: 'Nope' }), songRow()])

     assert.equal(summary.total, 3)
     assert.equal(summary.found, 2)
     assert.equal(summary.missed, 1)
})

test('handles an empty list without dividing by zero', () => {
     const summary = summarise([])

     assert.equal(summary.total, 0)
     assert.equal(summary.found, 0)
     assert.deepEqual(summary.decades, [])
     assert.deepEqual(summary.topGenres, [])
     assert.equal(summary.meanDurationMs, null)
     assert.equal(summary.medianDurationMs, null)
     assert.equal(summary.explicit.ratio, 0)
     assert.equal(summary.reissueDrift.averageYears, 0)
     assert.equal(summary.artists.distinct, 0)
})

test('handles a list where nothing was found', () => {
     const summary = summarise([songRow({ found: false }), songRow({ found: false })])

     assert.equal(summary.missed, 2)
     assert.deepEqual(summary.topGenres, [])
     assert.equal(summary.meanDurationMs, null)
})

test('ignores non-array input', () => {
     assert.equal(summarise(undefined).total, 0)
     assert.equal(summarise(null).total, 0)
})

//! Dates
test('buckets by decade using the original release date', () => {
     const summary = summarise([
          songRow({ originalReleaseDate: '1975-11-21' }),
          songRow({ originalReleaseDate: '1979-01-01' }),
          songRow({ originalReleaseDate: '1991-09-24' })
     ])

     assert.deepEqual(summary.decades, [
          { decade: 1970, count: 2 },
          { decade: 1990, count: 1 }
     ])
})

test('falls back to the Spotify date when MusicBrainz has none', () => {
     assert.equal(
          effectiveYear(songRow({ originalReleaseDate: null, releaseDate: ['1984-01-01'] })),
          1984
     )
     assert.equal(effectiveYear(songRow({ originalReleaseDate: null, releaseDate: [] })), null)
})

test('measures how far Spotify dates drift from the original', () => {
     const summary = summarise([
          // 2011 reissue of a 1975 song: 36 years late
          songRow({ originalReleaseDate: '1975-11-21', releaseDate: ['2011-01-01'] }),
          // 1994 reissue of a 1990 song: 4 years late
          songRow({ originalReleaseDate: '1990-01-01', releaseDate: ['1994-01-01'] }),
          // agrees, so it does not count as drift
          songRow({ originalReleaseDate: '2020-01-01', releaseDate: ['2020-01-01'] })
     ])

     assert.equal(summary.reissueDrift.count, 2)
     assert.equal(summary.reissueDrift.averageYears, 20)
})

test('does not count a Spotify date that predates the original', () => {
     const summary = summarise([
          songRow({ originalReleaseDate: '2011-01-01', releaseDate: ['1975-01-01'] })
     ])
     assert.equal(summary.reissueDrift.count, 0)
})

//! Genres
test('ranks genres by how many songs carry them', () => {
     const summary = summarise([
          songRow({ wikiGenres: ['rock', 'hard rock'] }),
          songRow({ wikiGenres: ['rock', 'pop'] }),
          songRow({ wikiGenres: ['rock'] })
     ])

     assert.deepEqual(summary.topGenres[0], { name: 'rock', count: 3 })
     assert.equal(summary.topGenres.length, 3)
})

test('breaks a genre tie on MusicBrainz vote weight', () => {
     const summary = summarise([
          songRow({
               wikiGenres: ['hard rock', 'pop'],
               genreWeights: [
                    { name: 'hard rock', count: 40 },
                    { name: 'pop', count: 1 }
               ]
          })
     ])

     assert.equal(summary.topGenres[0].name, 'hard rock')
})

//! Duration
test('reports mean and median duration', () => {
     const summary = summarise([
          songRow({ durationMs: 100_000 }),
          songRow({ durationMs: 200_000 }),
          songRow({ durationMs: 900_000 })
     ])

     assert.equal(summary.meanDurationMs, 400_000)
     assert.equal(summary.medianDurationMs, 200_000)
})

test('averages the middle pair for an even count', () => {
     const summary = summarise([songRow({ durationMs: 100_000 }), songRow({ durationMs: 200_000 })])
     assert.equal(summary.medianDurationMs, 150_000)
})

test('formats durations as minutes and seconds', () => {
     assert.equal(formatDuration(354_320), '5:54')
     assert.equal(formatDuration(61_000), '1:01')
     assert.equal(formatDuration(0), '—')
     assert.equal(formatDuration(null), '—')
     assert.equal(formatDuration('oops'), '—')
})

//! Explicit
test('reports the explicit ratio over rated songs only', () => {
     const summary = summarise([
          songRow({ explicit: true }),
          songRow({ explicit: false }),
          songRow({ explicit: null })
     ])

     assert.equal(summary.explicit.count, 1)
     assert.equal(summary.explicit.ratio, 0.5)
})

//! Release Types
test('mixes release types, preferring MusicBrainz typing', () => {
     const summary = summarise([
          songRow({ releaseType: 'Album' }),
          songRow({ releaseType: 'Single' }),
          songRow({ releaseType: 'Album' }),
          // no MusicBrainz type, so the Spotify album type stands in
          songRow({ releaseType: null, albumType: 'compilation' })
     ])

     assert.deepEqual(summary.releaseTypes[0], { name: 'Album', count: 2 })
     assert.ok(summary.releaseTypes.some((type) => type.name === 'Compilation'))
})

//! Artists
test('counts distinct artists and the most frequent one', () => {
     const summary = summarise([
          songRow({ artists: [{ name: 'Queen' }] }),
          songRow({ artists: [{ name: 'Queen' }, { name: 'David Bowie' }] }),
          songRow({ artists: [{ name: 'Nirvana' }] })
     ])

     assert.equal(summary.artists.distinct, 3)
     assert.deepEqual(summary.artists.top[0], { name: 'Queen', count: 2 })
})
