// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

//! Why
// Deezer's `rank` says how popular a song is on Deezer. This says how much it
// has actually been listened to, by how many people, across everyone submitting
// listens to ListenBrainz. It is platform-neutral where Deezer's number is not,
// and it is keyed by the MusicBrainz recording id the enrichment step has
// already resolved, so there is no matching to do.
//
// It is also the cheapest addition in the app by a wide margin: the endpoint
// takes a batch, so an entire list costs one request rather than one per song.

//! Constants
const API_BASE = 'https://api.listenbrainz.org/1'

const { version } = require('../../package.json')
const USER_AGENT = `Musicalist/${version} ( https://github.com/KotvicCodes/Musicalist )`

const REQUEST_TIMEOUT_MS = 15000

// Well under the documented ceiling, so even a list far longer than anything
// this app is used for costs a handful of requests rather than hundreds. No
// throttle: at one request per run there is nothing to pace.
const BATCH_SIZE = 100

//! Request
// Same contract as the MusicBrainz and AcousticBrainz clients: popularity is a
// bonus on top of a row that is already complete, so every failure resolves to
// null rather than throwing.
async function request(path, payload, signal) {
    try {
        const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: signal ? AbortSignal.any([signal, deadline]) : deadline
        })
        if (!response.ok) return null
        return await response.json()
    } catch {
        return null
    }
}

//! Extraction
// A recording nobody has submitted a listen for comes back at zero, which is a
// real answer and not a gap, so it is kept as zero. A recording the endpoint
// says nothing about at all is the gap, and stays null.
function extractCounts(body) {
    const counts = new Map()
    if (!Array.isArray(body)) return counts

    for (const entry of body) {
        if (!entry || typeof entry.recording_mbid !== 'string') continue

        counts.set(entry.recording_mbid, {
            listenCount: typeof entry.total_listen_count === 'number' ? entry.total_listen_count : null,
            listenerCount: typeof entry.total_user_count === 'number' ? entry.total_user_count : null
        })
    }
    return counts
}

//! Public Lookup
// Takes every recording id in the run and hands back a Map keyed by id.
async function popularity(recordingIds, signal) {
    const ids = [...new Set((recordingIds || []).filter(Boolean))]
    const counts = new Map()
    if (ids.length === 0) return counts

    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
        if (signal && signal.aborted) break

        const batch = ids.slice(start, start + BATCH_SIZE)
        const body = await request('/popularity/recording', { recording_mbids: batch }, signal)

        for (const [id, entry] of extractCounts(body)) counts.set(id, entry)
    }

    return counts
}

//! Export
module.exports = { popularity, extractCounts, BATCH_SIZE }
