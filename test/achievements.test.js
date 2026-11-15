// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { ACHIEVEMENTS, evaluateAchievements } = require('../src/achievements.js')
const { summarise } = require('../src/analysis.js')
const { achievementList } = require('../src/song-card.js')
const { toJson } = require('../src/export.js')
const { songRow } = require('./helpers.js')

//! Helpers
function findAchievement(report, id) {
    return report.items.find((item) => item.id === id)
}

function neutralRow(overrides = {}) {
    return songRow({
        originalReleaseDate: '2020-01-01',
        releaseDate: ['2020-01-01'],
        durationMs: 210_000,
        bpm: 120,
        listenCount: 5_000,
        popularity: 400_000,
        wikiGenres: ['rock'],
        musicalKey: null,
        matchConfidence: 'medium',
        ...overrides
    })
}

//! Catalogue & Edge Cases
test('exposes a curated catalogue of at least 10 deterministic achievements', () => {
    assert.ok(Array.isArray(ACHIEVEMENTS))
    assert.ok(ACHIEVEMENTS.length >= 10)

    const ids = new Set(ACHIEVEMENTS.map((item) => item.id))
    assert.equal(ids.size, ACHIEVEMENTS.length)

    for (const item of ACHIEVEMENTS) {
        assert.equal(typeof item.id, 'string')
        assert.equal(typeof item.title, 'string')
        assert.equal(typeof item.description, 'string')
        assert.equal(typeof item.check, 'function')
    }
})

test('locks every achievement on an empty or non-array input', () => {
    for (const input of [[], null, undefined]) {
        const report = evaluateAchievements(input)
        assert.equal(report.unlockedCount, 0)
        assert.equal(report.totalCount, ACHIEVEMENTS.length)
        assert.ok(report.items.every((item) => item.unlocked === false && item.detail === null))
    }
})

test('ignores unfound rows even if they carry metadata fields', () => {
    const report = evaluateAchievements([
        neutralRow({
            found: false,
            bpm: 180,
            durationMs: 500_000,
            listenCount: 10,
            popularity: 950_000,
            originalReleaseDate: '1970-01-01',
            releaseDate: ['2020-01-01']
        })
    ])

    assert.equal(report.unlockedCount, 0)
    assert.ok(report.items.every((item) => !item.unlocked))
})

//! Individual Achievements
test('first-spin unlocks once at least one song is found', () => {
    const report = evaluateAchievements([neutralRow({ title: 'Starlight' })])
    const item = findAchievement(report, 'first-spin')

    assert.equal(item.unlocked, true)
    assert.equal(item.detail, 'Starlight')
})

test('full-house requires 5+ songs all found with high match confidence', () => {
    const fourHigh = Array.from({ length: 4 }, (_, i) =>
        neutralRow({ query: `Song ${i}`, matchConfidence: 'high' })
    )
    assert.equal(findAchievement(evaluateAchievements(fourHigh), 'full-house').unlocked, false)

    const fiveHigh = Array.from({ length: 5 }, (_, i) =>
        neutralRow({ query: `Song ${i}`, matchConfidence: 'high' })
    )
    const unlocked = findAchievement(evaluateAchievements(fiveHigh), 'full-house')
    assert.equal(unlocked.unlocked, true)
    assert.match(unlocked.detail, /5 of 5/)

    const withOneMedium = [...fiveHigh.slice(0, 4), neutralRow({ matchConfidence: 'medium' })]
    assert.equal(findAchievement(evaluateAchievements(withOneMedium), 'full-house').unlocked, false)

    const withOneMissed = [
        ...fiveHigh.slice(0, 4),
        neutralRow({ found: false, matchConfidence: 'high' })
    ]
    assert.equal(findAchievement(evaluateAchievements(withOneMissed), 'full-house').unlocked, false)
})

test('time-traveller unlocks across 4 distinct decades', () => {
    const threeDecades = [
        neutralRow({ originalReleaseDate: '1975-01-01' }),
        neutralRow({ originalReleaseDate: '1984-01-01' }),
        neutralRow({ originalReleaseDate: '1991-01-01' })
    ]
    assert.equal(findAchievement(evaluateAchievements(threeDecades), 'time-traveller').unlocked, false)

    const fourDecades = [...threeDecades, neutralRow({ originalReleaseDate: '2005-01-01' })]
    const unlocked = findAchievement(evaluateAchievements(fourDecades), 'time-traveller')
    assert.equal(unlocked.unlocked, true)
    assert.equal(unlocked.detail, '4 decades (1970s to 2000s)')
})

test('crate-digger unlocks for an obscure track under 1,000 listens and ignores null', () => {
    const unknownListens = [neutralRow({ listenCount: null })]
    assert.equal(findAchievement(evaluateAchievements(unknownListens), 'crate-digger').unlocked, false)

    const boundary = [neutralRow({ listenCount: 1000 })]
    assert.equal(findAchievement(evaluateAchievements(boundary), 'crate-digger').unlocked, false)

    const obscure = [neutralRow({ title: 'Hidden Gem', listenCount: 42 })]
    const unlocked = findAchievement(evaluateAchievements(obscure), 'crate-digger')
    assert.equal(unlocked.unlocked, true)
    assert.match(unlocked.detail, /Hidden Gem/)
    assert.match(unlocked.detail, /42 listens/)

    const singleListen = [neutralRow({ title: 'Demo Tape', listenCount: 1 })]
    assert.match(
        findAchievement(evaluateAchievements(singleListen), 'crate-digger').detail,
        /1 listen\)/
    )
})

test('chart-topper unlocks via ListenBrainz listens or Deezer popularity rank', () => {
    const modest = [neutralRow({ listenCount: 99_999, popularity: 799_999 })]
    assert.equal(findAchievement(evaluateAchievements(modest), 'chart-topper').unlocked, false)

    const byListens = [neutralRow({ title: 'Anthem', listenCount: 125_000, popularity: 100 })]
    const unlockedListens = findAchievement(evaluateAchievements(byListens), 'chart-topper')
    assert.equal(unlockedListens.unlocked, true)
    assert.match(unlockedListens.detail, /Anthem/)
    assert.match(unlockedListens.detail, /listens/)

    const byPopularity = [neutralRow({ title: 'Radio Hit', listenCount: null, popularity: 850_000 })]
    const unlockedPop = findAchievement(evaluateAchievements(byPopularity), 'chart-topper')
    assert.equal(unlockedPop.unlocked, true)
    assert.match(unlockedPop.detail, /Radio Hit/)
    assert.match(unlockedPop.detail, /Deezer rank/)
})

test('genre-hopper unlocks at 8 distinct MusicBrainz genres', () => {
    const seven = [
        neutralRow({ wikiGenres: ['rock', 'pop', 'jazz', 'blues'] }),
        neutralRow({ wikiGenres: ['rock', 'soul', 'funk', 'disco'] })
    ]
    assert.equal(findAchievement(evaluateAchievements(seven), 'genre-hopper').unlocked, false)

    const eight = [...seven, neutralRow({ wikiGenres: ['ambient'] })]
    const unlocked = findAchievement(evaluateAchievements(eight), 'genre-hopper')
    assert.equal(unlocked.unlocked, true)
    assert.equal(unlocked.detail, '8 distinct genres')
})

test('speed-demon unlocks at 160 BPM or faster', () => {
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ bpm: 159.4 })]), 'speed-demon').unlocked,
        false
    )

    const fast = findAchievement(
        evaluateAchievements([neutralRow({ title: 'Motorbreath', bpm: 172.4 })]),
        'speed-demon'
    )
    assert.equal(fast.unlocked, true)
    assert.equal(fast.detail, 'Motorbreath (172 BPM)')
})

test('slow-burn unlocks at 75 BPM or slower, but ignores zero and null', () => {
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ bpm: 0 })]), 'slow-burn').unlocked,
        false
    )
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ bpm: null })]), 'slow-burn').unlocked,
        false
    )
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ bpm: 76 })]), 'slow-burn').unlocked,
        false
    )

    const slow = findAchievement(
        evaluateAchievements([neutralRow({ title: 'Blue in Green', bpm: 68 })]),
        'slow-burn'
    )
    assert.equal(slow.unlocked, true)
    assert.equal(slow.detail, 'Blue in Green (68 BPM)')
})

test('marathon unlocks for tracks lasting 7 minutes or longer', () => {
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ durationMs: 419_000 })]), 'marathon')
            .unlocked,
        false
    )

    const epic = findAchievement(
        evaluateAchievements([neutralRow({ title: 'Stairway to Heaven', durationMs: 482_000 })]),
        'marathon'
    )
    assert.equal(epic.unlocked, true)
    assert.equal(epic.detail, 'Stairway to Heaven (8:02)')
})

test('short-and-sweet unlocks for tracks 2 minutes or under, ignoring zero', () => {
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ durationMs: 0 })]), 'short-and-sweet')
            .unlocked,
        false
    )
    assert.equal(
        findAchievement(evaluateAchievements([neutralRow({ durationMs: 121_000 })]), 'short-and-sweet')
            .unlocked,
        false
    )

    const brief = findAchievement(
        evaluateAchievements([neutralRow({ title: 'Song 2', durationMs: 120_000 })]),
        'short-and-sweet'
    )
    assert.equal(brief.unlocked, true)
    assert.equal(brief.detail, 'Song 2 (2:00)')
})

test('harmonic-convergence unlocks when 3+ songs share the same musical key', () => {
    const two = [
        neutralRow({ musicalKey: 'A minor' }),
        neutralRow({ musicalKey: 'A minor' }),
        neutralRow({ musicalKey: 'C major' })
    ]
    assert.equal(findAchievement(evaluateAchievements(two), 'harmonic-convergence').unlocked, false)

    const three = [...two, neutralRow({ musicalKey: 'A minor' })]
    const unlocked = findAchievement(evaluateAchievements(three), 'harmonic-convergence')
    assert.equal(unlocked.unlocked, true)
    assert.equal(unlocked.detail, '3 songs in A minor')
})

test('time-warp unlocks when the Deezer reissue is 20+ years after the original release', () => {
    const nineteenYears = [
        neutralRow({ originalReleaseDate: '1990-01-01', releaseDate: ['2009-01-01'] })
    ]
    assert.equal(findAchievement(evaluateAchievements(nineteenYears), 'time-warp').unlocked, false)

    const placeholderYear = [
        neutralRow({ originalReleaseDate: '0000-00-00', releaseDate: ['2020-01-01'] })
    ]
    assert.equal(findAchievement(evaluateAchievements(placeholderYear), 'time-warp').unlocked, false)

    const twentyYears = [
        neutralRow({
            title: 'Heroes',
            originalReleaseDate: '1977-09-23',
            releaseDate: ['2017-01-01']
        })
    ]
    const unlocked = findAchievement(evaluateAchievements(twentyYears), 'time-warp')
    assert.equal(unlocked.unlocked, true)
    assert.equal(unlocked.detail, 'Heroes (1977 original, 2017 reissue)')
})

//! Summary, Export & Rendering Integration
test('summarise attaches achievements and JSON export preserves them', () => {
    const rows = [songRow()]
    const summary = summarise(rows)

    assert.ok(summary.achievements)
    assert.equal(summary.achievements.totalCount, ACHIEVEMENTS.length)
    assert.ok(summary.achievements.unlockedCount >= 1)

    const exported = JSON.parse(toJson(rows, summary))
    assert.deepEqual(exported.summary.achievements, summary.achievements)
})

test('achievementList renders progress, unlocked details, locked states and escapes HTML', () => {
    const rows = [neutralRow({ title: '<script>alert("xss")</script>', bpm: 175 })]
    const html = achievementList(summarise(rows))

    assert.match(html, /Achievement hunt \(2 of 12 unlocked\)/)
    assert.ok(html.includes('achievement--unlocked'))
    assert.ok(html.includes('achievement--locked'))
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'))
})
