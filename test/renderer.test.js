// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const MusicalistAnalysis = require('../src/analysis.js')
const MusicalistFilter = require('../src/filter.js')
const MusicalistText = require('../src/text.js')
const MusicalistCard = require('../src/song-card.js')
const { songRow } = require('./helpers.js')

const RENDERER_PATH = require.resolve('../src/renderer.js')
const EMPTY_FILTER_HTML = '<p class="output__empty">No songs match the current filter.</p>'

//! Lightweight DOM & Bridge Stub
function createClassList(initial = []) {
    const classes = new Set(initial)
    return {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name)
    }
}

function createElement(id, initial = {}) {
    const listeners = new Map()
    let html = ''

    const element = {
        id,
        value: initial.value ?? '',
        textContent: initial.textContent ?? '',
        disabled: initial.disabled ?? false,
        classList: createClassList(initial.classes ?? []),
        innerHTMLWrites: 0,
        insertAdjacentCalls: [],
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, [])
            listeners.get(type).push(handler)
        },
        dispatch(type, eventInit = {}) {
            const event = {
                type,
                target: element,
                defaultPrevented: false,
                preventDefault() {
                    this.defaultPrevented = true
                },
                ...eventInit
            }
            for (const handler of listeners.get(type) ?? []) {
                handler(event)
            }
            return event
        },
        click() {
            return element.dispatch('click')
        },
        get innerHTML() {
            return html
        },
        set innerHTML(next) {
            element.innerHTMLWrites += 1
            html = String(next)
        },
        insertAdjacentHTML(position, fragment) {
            const text = String(fragment)
            element.insertAdjacentCalls.push({ position, html: text })
            if (position === 'beforeend') {
                html += text
            }
        },
        querySelector(selector) {
            if (selector === '.output__empty' && html.includes('class="output__empty"')) {
                return {
                    remove() {
                        html = html.replace(EMPTY_FILTER_HTML, '')
                    }
                }
            }
            return null
        }
    }

    return element
}

function mountRenderer(t, apiOverrides = {}) {
    const previousDocument = global.document
    const previousWindow = global.window

    const elements = {
        inputTextareaQ: createElement('inputTextareaQ'),
        separatorQ: createElement('separatorQ', { value: 'auto' }),
        scrapeButtonQ: createElement('scrapeButtonQ'),
        stopButtonQ: createElement('stopButtonQ', { classes: ['hidden'] }),
        outputQ: createElement('outputQ'),
        statusQ: createElement('statusQ'),
        summaryQ: createElement('summaryQ', { classes: ['hidden'] }),
        summaryStatsQ: createElement('summaryStatsQ'),
        exportJsonQ: createElement('exportJsonQ'),
        exportCsvQ: createElement('exportCsvQ'),
        exportStatusQ: createElement('exportStatusQ'),
        filterInputQ: createElement('filterInputQ'),
        filterStatusQ: createElement('filterStatusQ', { value: 'all' }),
        filterCountQ: createElement('filterCountQ'),
        helpButtonQ: createElement('helpButtonQ')
    }

    const docListeners = new Map()
    const documentStub = {
        getElementById(id) {
            return elements[id] ?? null
        },
        addEventListener(type, handler) {
            if (!docListeners.has(type)) docListeners.set(type, [])
            docListeners.get(type).push(handler)
        },
        dispatch(type, eventInit = {}) {
            const event = {
                type,
                target: documentStub,
                defaultPrevented: false,
                preventDefault() {
                    this.defaultPrevented = true
                },
                ...eventInit
            }
            for (const handler of docListeners.get(type) ?? []) {
                handler(event)
            }
            return event
        }
    }

    let progressHandler = null
    const calls = {
        runLookup: [],
        cancelLookup: 0,
        openExternal: [],
        exportResults: []
    }

    const electronAPI = {
        onProgress(callback) {
            progressHandler = callback
        },
        async runLookup(songArray) {
            calls.runLookup.push(songArray)
            return { ok: true, rows: [] }
        },
        cancelLookup() {
            calls.cancelLookup += 1
        },
        openExternal(url) {
            calls.openExternal.push(url)
        },
        async exportResults(rows, summary, format) {
            calls.exportResults.push({ rows, summary, format })
            return { saved: true, fileName: `songs.${format}` }
        },
        ...apiOverrides
    }

    global.document = documentStub
    global.window = {
        MusicalistAnalysis,
        MusicalistFilter,
        MusicalistText,
        MusicalistCard,
        electronAPI
    }

    delete require.cache[RENDERER_PATH]
    require(RENDERER_PATH)

    t.after(() => {
        delete require.cache[RENDERER_PATH]
        global.document = previousDocument
        global.window = previousWindow
    })

    return {
        elements,
        document: documentStub,
        calls,
        emitProgress(song) {
            assert.equal(typeof progressHandler, 'function', 'onProgress handler should be registered')
            progressHandler(song)
        }
    }
}

//! Fixtures
const songOne = songRow({
    query: 'Bohemian Rhapsody',
    title: 'Bohemian Rhapsody',
    author: 'Queen',
    wikiGenres: ['progressive rock']
})

const songTwo = songRow({
    query: 'Heroes',
    title: 'Heroes',
    author: 'David Bowie',
    durationDisagrees: true,
    wikiGenres: ['art rock']
})

const songThree = {
    query: 'Missing Demo Track',
    found: false
}

//! Streaming Progress (onProgress)
test('appends three unfiltered onProgress songs via insertAdjacentHTML without overwriting innerHTML', (t) => {
    const { elements, emitProgress } = mountRenderer(t)
    const { outputQ, filterCountQ, summaryQ, summaryStatsQ } = elements

    emitProgress(songOne)
    emitProgress(songTwo)
    emitProgress(songThree)

    assert.equal(outputQ.innerHTMLWrites, 0)
    assert.equal(outputQ.insertAdjacentCalls.length, 3)
    assert.deepEqual(
        outputQ.insertAdjacentCalls.map((call) => call.position),
        ['beforeend', 'beforeend', 'beforeend']
    )
    assert.equal(outputQ.insertAdjacentCalls[0].html, MusicalistCard.songCard(songOne))
    assert.equal(outputQ.insertAdjacentCalls[1].html, MusicalistCard.songCard(songTwo))
    assert.equal(outputQ.insertAdjacentCalls[2].html, MusicalistCard.songCard(songThree))

    assert.ok(outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.ok(outputQ.innerHTML.includes('Heroes'))
    assert.ok(outputQ.innerHTML.includes('Missing Demo Track'))
    assert.equal(filterCountQ.textContent, '')
    assert.equal(summaryQ.classList.contains('hidden'), false)
    assert.ok(summaryStatsQ.innerHTML.includes('Songs'))
})

test('appends only matching songs across three filtered onProgress events without overwriting innerHTML', (t) => {
    const { elements, emitProgress } = mountRenderer(t)
    const { outputQ, filterInputQ, filterStatusQ, filterCountQ } = elements

    filterStatusQ.value = 'found'
    filterInputQ.value = 'rock'

    emitProgress(songOne)
    assert.equal(outputQ.innerHTMLWrites, 0)
    assert.equal(outputQ.insertAdjacentCalls.length, 1)
    assert.equal(filterCountQ.textContent, 'Showing 1 of 1 song')

    emitProgress(songThree)
    assert.equal(outputQ.innerHTMLWrites, 0)
    assert.equal(outputQ.insertAdjacentCalls.length, 1)
    assert.equal(filterCountQ.textContent, 'Showing 1 of 2 songs')

    emitProgress(songTwo)
    assert.equal(outputQ.innerHTMLWrites, 0)
    assert.equal(outputQ.insertAdjacentCalls.length, 2)
    assert.equal(filterCountQ.textContent, 'Showing 2 of 3 songs')

    assert.ok(outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.ok(outputQ.innerHTML.includes('Heroes'))
    assert.ok(!outputQ.innerHTML.includes('Missing Demo Track'))
})

test('replaces the empty-filter notice in place when a later streamed song matches', (t) => {
    const { elements, emitProgress } = mountRenderer(t)
    const { outputQ, filterInputQ, filterCountQ } = elements

    filterInputQ.value = 'bowie'

    emitProgress(songOne)
    assert.equal(outputQ.innerHTMLWrites, 1)
    assert.equal(outputQ.innerHTML, EMPTY_FILTER_HTML)
    assert.equal(filterCountQ.textContent, 'Showing 0 of 1 song')

    emitProgress(songThree)
    assert.equal(outputQ.innerHTMLWrites, 1)
    assert.equal(outputQ.insertAdjacentCalls.length, 0)
    assert.equal(filterCountQ.textContent, 'Showing 0 of 2 songs')

    emitProgress(songTwo)
    assert.equal(outputQ.innerHTMLWrites, 1)
    assert.equal(outputQ.insertAdjacentCalls.length, 1)
    assert.equal(outputQ.insertAdjacentCalls[0].position, 'beforeend')
    assert.ok(!outputQ.innerHTML.includes('output__empty'))
    assert.ok(outputQ.innerHTML.includes('Heroes'))
    assert.equal(filterCountQ.textContent, 'Showing 1 of 3 songs')
})

//! Interactive Filtering
test('filters rendered output when filterInputQ and filterStatusQ change', (t) => {
    const { elements, emitProgress } = mountRenderer(t)
    const { outputQ, filterInputQ, filterStatusQ, filterCountQ } = elements

    emitProgress(songOne)
    emitProgress(songTwo)
    emitProgress(songThree)

    filterStatusQ.value = 'missed'
    filterStatusQ.dispatch('change')
    assert.ok(outputQ.innerHTML.includes('Missing Demo Track'))
    assert.ok(!outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.equal(filterCountQ.textContent, 'Showing 1 of 3 songs')

    filterStatusQ.value = 'check'
    filterStatusQ.dispatch('change')
    assert.ok(outputQ.innerHTML.includes('Heroes'))
    assert.ok(!outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.equal(filterCountQ.textContent, 'Showing 1 of 3 songs')

    filterStatusQ.value = 'all'
    filterInputQ.value = 'queen'
    filterInputQ.dispatch('input')
    assert.ok(outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.ok(!outputQ.innerHTML.includes('Heroes'))
    assert.equal(filterCountQ.textContent, 'Showing 1 of 3 songs')

    filterInputQ.value = 'nonexistent-artist'
    filterInputQ.dispatch('input')
    assert.equal(outputQ.innerHTML, EMPTY_FILTER_HTML)
    assert.equal(filterCountQ.textContent, 'Showing 0 of 3 songs')

    filterInputQ.value = ''
    filterInputQ.dispatch('input')
    assert.equal(filterCountQ.textContent, '')
    assert.ok(outputQ.innerHTML.includes('Bohemian Rhapsody'))
    assert.ok(outputQ.innerHTML.includes('Heroes'))
    assert.ok(outputQ.innerHTML.includes('Missing Demo Track'))
})

//! Keyboard Shortcuts
test('Ctrl+Enter and Meta+Enter on inputTextareaQ trigger a lookup when Proceed is enabled', (t) => {
    const { elements, calls } = mountRenderer(t)
    const { inputTextareaQ, scrapeButtonQ } = elements

    inputTextareaQ.value = 'Bohemian Rhapsody\nHeroes'

    const plainEnter = inputTextareaQ.dispatch('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: false
    })
    assert.equal(plainEnter.defaultPrevented, false)
    assert.equal(calls.runLookup.length, 0)

    const ctrlEnter = inputTextareaQ.dispatch('keydown', {
        key: 'Enter',
        ctrlKey: true,
        metaKey: false
    })
    assert.equal(ctrlEnter.defaultPrevented, true)
    assert.equal(calls.runLookup.length, 1)
    assert.deepEqual(calls.runLookup[0], ['Bohemian Rhapsody', 'Heroes'])

    scrapeButtonQ.disabled = true
    const disabledEnter = inputTextareaQ.dispatch('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: true
    })
    assert.equal(disabledEnter.defaultPrevented, false)
    assert.equal(calls.runLookup.length, 1)
})

test('Escape cancels an active lookup unless focus is inside a non-empty filter input', (t) => {
    let resolveLookup
    const { elements, document, calls } = mountRenderer(t, {
        runLookup() {
            return new Promise((resolve) => {
                resolveLookup = resolve
            })
        }
    })
    const { inputTextareaQ, scrapeButtonQ, stopButtonQ, filterInputQ, statusQ } = elements

    inputTextareaQ.value = 'Bohemian Rhapsody'
    scrapeButtonQ.click()

    assert.equal(stopButtonQ.classList.contains('hidden'), false)
    assert.equal(stopButtonQ.disabled, false)

    // Escape inside a populated filter input lets the search field handle it
    filterInputQ.value = 'queen'
    const inFilledFilter = document.dispatch('keydown', {
        key: 'Escape',
        target: filterInputQ
    })
    assert.equal(inFilledFilter.defaultPrevented, false)
    assert.equal(calls.cancelLookup, 0)
    assert.equal(stopButtonQ.disabled, false)

    // Escape once the filter input is empty cancels the running lookup
    filterInputQ.value = ''
    const cancelEvent = document.dispatch('keydown', {
        key: 'Escape',
        target: filterInputQ
    })
    assert.equal(cancelEvent.defaultPrevented, true)
    assert.equal(calls.cancelLookup, 1)
    assert.equal(stopButtonQ.disabled, true)
    assert.equal(statusQ.textContent, 'Stopping…')

    resolveLookup({ ok: true, stopped: true, rows: [] })
})
