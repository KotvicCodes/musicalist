// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as path from 'node:path'
import { blankRow } from '../src/api/lookup.js'
import assert from 'node:assert/strict'

import * as MusicalistCard from '../src/song-card.js'
import { songRow } from './helpers.js'

const RENDERER_SCRIPT = readFileSync(path.join(__dirname, '../dist/renderer.js'), 'utf8')
const EMPTY_FILTER_HTML = '<p class="output__empty">No songs match the current filter.</p>'

import type { TestContext } from 'node:test'
import type { ElectronAPI, ExportFormat, LookupResult, SongRow, Summary } from '../src/types.js'

type TestEvent = {
    type: string
    target: unknown
    defaultPrevented: boolean
    preventDefault(): void
    key?: string
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
}
type EventHandler = (event: TestEvent) => void | Promise<void>
interface TestElement {
    id: string
    value: string
    textContent: string
    disabled: boolean
    classList: ReturnType<typeof createClassList>
    innerHTMLWrites: number
    insertAdjacentCalls: { position: string; html: string }[]
    addEventListener(type: string, handler: EventHandler): void
    dispatch(type: string, eventInit?: Partial<TestEvent>): TestEvent
    click(): TestEvent
    innerHTML: string
    insertAdjacentHTML(position: string, fragment: string): void
    querySelector(selector: string): { remove(): void } | null
}

//! Lightweight DOM & Bridge Stub
function createClassList(initial: string[] = []) {
    const classes = new Set(initial)
    return {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
        contains: (name: string) => classes.has(name)
    }
}

function createElement(
    id: string,
    initial: { value?: string; textContent?: string; disabled?: boolean; classes?: string[] } = {}
): TestElement {
    const listeners = new Map<string, EventHandler[]>()
    let html = ''

    const element: TestElement = {
        id,
        value: initial.value ?? '',
        textContent: initial.textContent ?? '',
        disabled: initial.disabled ?? false,
        classList: createClassList(initial.classes ?? []),
        innerHTMLWrites: 0,
        insertAdjacentCalls: [],
        addEventListener(type: string, handler: EventHandler) {
            if (!listeners.has(type)) listeners.set(type, [])
            listeners.get(type)!.push(handler)
        },
        dispatch(type: string, eventInit: Partial<TestEvent> = {}) {
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
        insertAdjacentHTML(position: string, fragment: string) {
            const text = String(fragment)
            element.insertAdjacentCalls.push({ position, html: text })
            if (position === 'beforeend') {
                html += text
            }
        },
        querySelector(selector: string) {
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

function mountRenderer(t: TestContext, apiOverrides: Partial<ElectronAPI> = {}) {
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

    const docListeners = new Map<string, EventHandler[]>()
    const documentStub = {
        getElementById(id: string) {
            return elements[id as keyof typeof elements] ?? null
        },
        addEventListener(type: string, handler: EventHandler) {
            if (!docListeners.has(type)) docListeners.set(type, [])
            docListeners.get(type)!.push(handler)
        },
        dispatch(type: string, eventInit: Partial<TestEvent> = {}) {
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

    let progressHandler: ((song: SongRow) => void) | null = null
    const calls = {
        runLookup: [] as string[][],
        cancelLookup: 0,
        openExternal: [] as string[],
        exportResults: [] as { rows: SongRow[]; summary: Summary; format: ExportFormat }[]
    }

    const electronAPI: ElectronAPI = {
        onProgress(callback) {
            progressHandler = callback
            return () => {
                progressHandler = null
            }
        },
        async runLookup(songArray) {
            calls.runLookup.push(structuredClone(songArray))
            return { ok: true, rows: [], stopped: false }
        },
        async cancelLookup() {
            calls.cancelLookup += 1
        },
        async openExternal(url) {
            calls.openExternal.push(url)
        },
        async exportResults(rows, summary, format) {
            calls.exportResults.push({ rows, summary, format })
            return { saved: true, fileName: `songs.${format}` }
        },
        ...apiOverrides
    }

    // The shipped bundle runs without require, module or the old globals.
    runInNewContext(RENDERER_SCRIPT, {
        document: documentStub,
        window: { electronAPI }
    })

    return {
        elements,
        document: documentStub,
        calls,
        emitProgress(song: SongRow) {
            assert.ok(progressHandler, 'onProgress handler should be registered')
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

const songThree = blankRow('Missing Demo Track')

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

    const composingEnter = inputTextareaQ.dispatch('keydown', {
        key: 'Enter',
        ctrlKey: true,
        metaKey: false,
        isComposing: true
    })
    assert.equal(composingEnter.defaultPrevented, false)
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
    let resolveLookup!: (value: LookupResult) => void
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

test('a rejected lookup bridge does not expose the rejection message', async (t) => {
    const { elements } = mountRenderer(t, {
        async runLookup() {
            throw new Error('private path or response content')
        }
    })
    elements.inputTextareaQ.value = 'A song'
    elements.scrapeButtonQ.click()
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(elements.statusQ.textContent, 'Something went wrong during the lookup.')
    assert.equal(elements.scrapeButtonQ.disabled, false)
    assert.equal(elements.stopButtonQ.classList.contains('hidden'), true)
})

test('a rejected export bridge does not expose the rejection message', async (t) => {
    const { elements, emitProgress } = mountRenderer(t, {
        async exportResults() {
            throw new Error('private export path')
        }
    })
    emitProgress(songOne)
    elements.exportCsvQ.click()
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(elements.exportStatusQ.textContent, 'Could not save the results.')
})
