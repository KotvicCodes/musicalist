// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

// Optional fields reflect partial catalogue responses. These describe the remote
// payloads; the clients retain their runtime checks before producing local rows.
export interface DeezerArtist {
    id?: number
    name?: string
    link?: string
    role?: string
}

export interface DeezerAlbum {
    id?: number
    title?: string
    record_type?: string
    nb_tracks?: number
    label?: string
    upc?: string
    release_date?: string
    genres?: { data?: ({ name?: string } | null)[] }
    cover_big?: string
    cover_medium?: string
    cover?: string
}

export interface DeezerTrack {
    id?: number
    title?: string
    isrc?: string
    link?: string
    duration?: number
    explicit_lyrics?: boolean
    explicit_content_lyrics?: number
    artist?: DeezerArtist
    contributors?: (DeezerArtist | null)[]
    album?: DeezerAlbum
    release_date?: string
    track_position?: number
    disk_number?: number
    bpm?: number
    rank?: number
    gain?: number
    preview?: string
}

export interface WeightedName {
    name?: string
    count?: number
}

export interface ReleaseGroup {
    title?: string
    id?: unknown
    'first-release-date'?: string
    'primary-type'?: string
    'secondary-types'?: string[]
    genres?: (WeightedName | null)[]
    tags?: (WeightedName | null)[]
}

export interface Release {
    'release-group'?: ReleaseGroup | null
}

export interface Relation {
    'target-type'?: string
    type?: string
    artist?: { name?: string }
    url?: { resource?: string }
}

export interface Recording {
    id?: unknown
    score?: number
    'first-release-date'?: string
    releases?: (Release | null)[]
    genres?: (WeightedName | null)[]
    tags?: (WeightedName | null)[]
    disambiguation?: string
    length?: number
    video?: boolean
    'artist-credit'?: ({ artist?: { id?: string; name?: string } } | null)[]
    relations?: (Relation | null)[]
    isrcs?: string[]
}

export interface ArchiveResponse {
    highlevel?: Record<string, { value?: unknown; probability?: unknown; all?: Record<string, unknown> }>
    tonal?: { key_key?: unknown; key_scale?: unknown; key_strength?: unknown }
    rhythm?: { bpm?: unknown; beats_count?: unknown }
    lowlevel?: { average_loudness?: unknown; dynamic_complexity?: unknown }
}
