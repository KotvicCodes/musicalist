// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { runInNewContext } from 'node:vm'
import type { ElectronAPI, SongRow } from '../src/types.js'
import { summarise } from '../src/analysis.js'
import { songRow } from './helpers.js'

function loadPreload() {
    let api: ElectronAPI | undefined
    const calls: { channel: string; args: unknown[] }[] = []
    const listeners = new Map<string, (event: unknown, song: SongRow) => void>()

    runInNewContext(readFileSync(path.join(__dirname, '../dist/preload.js'), 'utf8'), {
        // Sandboxed preloads can require Electron, but cannot load local modules
        // or Node builtins. Running the actual bundle catches accidental imports.
        require(name: string) {
            assert.equal(name, 'electron')
            return {
                contextBridge: {
                    exposeInMainWorld(name: string, value: ElectronAPI) {
                        assert.equal(name, 'electronAPI')
                        api = value
                    }
                },
                ipcRenderer: {
                    async invoke(channel: string, ...args: unknown[]) {
                        calls.push({ channel, args: structuredClone(args) })
                        if (channel === 'run-lookup') return { ok: true, rows: [], stopped: false }
                        if (channel === 'export-results') return { saved: false }
                    },
                    on(channel: string, listener: (event: unknown, song: SongRow) => void) {
                        listeners.set(channel, listener)
                    },
                    removeListener(channel: string, listener: (event: unknown, song: SongRow) => void) {
                        assert.equal(listeners.get(channel), listener)
                        listeners.delete(channel)
                    }
                }
            }
        }
    })

    assert.ok(api)
    return { api, calls, listeners }
}

test('the compiled preload exposes only the application bridge and forwards requests', async () => {
    const { api, calls } = loadPreload()
    const rows = [songRow()]
    const summary = summarise(rows)

    assert.deepEqual(Object.keys(api).sort(), [
        'cancelLookup',
        'exportResults',
        'onProgress',
        'openExternal',
        'runLookup'
    ])
    assert.equal((await api.runLookup(['A song'])).ok, true)
    await api.cancelLookup()
    assert.equal((await api.exportResults(rows, summary, 'csv')).saved, false)
    await api.openExternal('https://example.com')

    assert.deepEqual(calls, [
        { channel: 'run-lookup', args: [{ songs: ['A song'] }] },
        { channel: 'cancel-lookup', args: [] },
        { channel: 'export-results', args: [{ rows, summary, format: 'csv' }] },
        { channel: 'open-external', args: ['https://example.com'] }
    ])
})

test('the compiled preload strips the IPC event and unsubscribes the same listener', () => {
    const { api, listeners } = loadPreload()
    const received: SongRow[] = []
    const unsubscribe = api.onProgress((song) => received.push(song))
    const listener = listeners.get('lookup-progress')
    assert.ok(listener)
    const row = songRow()
    listener({ sender: 'private IPC event' }, row)

    assert.deepEqual(received, [row])
    unsubscribe()
    assert.equal(listeners.size, 0)
})
