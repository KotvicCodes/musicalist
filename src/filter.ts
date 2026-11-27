// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SongRow } from './types.js'

//! Searchable Fields
const TEXT_FIELDS = [
    'query',
    'title',
    'author',
    'album',
    'label',
    'musicalKey',
    'disambiguation'
] as const

const LIST_FIELDS = ['wikiGenres', 'deezerGenres', 'tags'] as const

//! Status Predicates
// "Worth checking" gathers the three ways a found row can still deserve a
// second look: a loose Deezer match score, the two catalogues disagreeing
// on the recording's length, or MusicBrainz noting a non-standard take.
function matchesStatus(row: SongRow | null, status: string): boolean {
    if (!row || typeof row !== 'object') return false
    if (status === 'found') return row.found === true
    if (status === 'missed') return !row.found
    if (status === 'check') {
        return (
            row.found === true &&
            (row.matchConfidence === 'low' ||
                row.durationDisagrees === true ||
                Boolean(row.disambiguation))
        )
    }
    return true
}

//! Text Search
function matchesQuery(row: SongRow, needle: string): boolean {
    if (!needle) return true

    for (const field of TEXT_FIELDS) {
        const value = row[field]
        if (typeof value === 'string' && value.toLowerCase().includes(needle)) {
            return true
        }
    }

    for (const field of LIST_FIELDS) {
        const values = row[field]
        if (!Array.isArray(values)) continue
        for (const item of values) {
            if (typeof item === 'string' && item.toLowerCase().includes(needle)) {
                return true
            }
        }
    }

    return false
}

//! Filter Rows
function filterRows(
    rows: (SongRow | null)[] | null | undefined,
    options: { status?: string; query?: string } | null = {}
): SongRow[] {
    const list = Array.isArray(rows) ? rows : []
    const { status = 'all', query = '' } = options || {}
    const needle = String(query ?? '')
        .trim()
        .toLowerCase()

    return list.filter(
        (row): row is SongRow => !!row && matchesStatus(row, status) && matchesQuery(row, needle)
    )
}

export { filterRows, TEXT_FIELDS, LIST_FIELDS }
