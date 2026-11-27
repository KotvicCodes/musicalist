// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

export type MatchConfidence = 'high' | 'medium' | 'low'
export type FailureKind = 'http' | 'network' | 'rate-limit' | 'timeout' | 'cancelled' | 'unknown'

export interface Artist {
    name: string
    id: number | null
    url: string | null
    role: string | null
}

export interface NamedCount {
    name: string
    count: number
}

export interface Credit {
    name: string
    role: string
}

export interface Track {
    title: string | null
    author: string | null
    artists: Artist[]
    album: string | null
    albumType: string | null
    albumTotalTracks: number | null
    releaseDate: string[]
    releaseDatePrecision: 'day' | null
    durationMs: number | null
    explicit: boolean | null
    explicitLyrics: string | null
    trackNumber: number | null
    discNumber: number | null
    isrc: string | null
    deezerUrl: string | null
    bpm: number | null
    popularity: number | null
    gainDb: number | null
    previewUrl: string | null
    label: string | null
    upc: string | null
    deezerGenres: string[]
    coverArt: string | null
}

export interface Enrichment {
    mbRecordingId: string | null
    originalReleaseDate: string | null
    releaseType: string | null
    releaseSecondaryTypes: string[]
    genreWeights: NamedCount[]
    wikiGenres: string[]
    tags: string[]
    disambiguation: string | null
    mbDurationMs: number | null
    isVideo: boolean | null
    mbArtists: { name: string; id: string | null }[]
    credits: Credit[]
    links: Record<string, string>
    mbIsrcs: string[]
    coverArtUrl: string | null
}

export type MoodField =
    | 'danceability'
    | 'moodHappy'
    | 'moodSad'
    | 'moodAggressive'
    | 'moodRelaxed'
    | 'moodParty'
    | 'moodAcoustic'
    | 'moodElectronic'
    | 'instrumental'
    | 'timbreBright'
    | 'tonal'

export type Moods = Record<MoodField, number | null>
export type Features = Moods & { moodCluster: string | null }

export interface AudioAnalysis {
    musicalKey: string | null
    keyStrength: number | null
    archiveBpm: number | null
    loudness: number | null
    dynamicComplexity: number | null
    beatsCount: number | null
}

export interface Counts {
    listenCount: number | null
    listenerCount: number | null
}

export interface DurationComparison {
    durationGapMs: number | null
    durationDisagrees: boolean | null
}

export interface SongRow extends Track, Enrichment, Features, AudioAnalysis, Counts, DurationComparison {
    query: string
    found: boolean
    bpmSource: 'deezer' | 'acousticbrainz' | null
    matchScore: number | null
    matchConfidence: MatchConfidence | null
    error: string | null
}

export type MatchedTrack = Track & { matchScore: number; matchConfidence: MatchConfidence }

export interface Failure {
    ok: false
    kind: FailureKind
    message: string
}

export type LookupResult = { ok: true; rows: SongRow[]; stopped: boolean } | Failure
export type ExportFormat = 'csv' | 'json'
export type ExportResult = { saved: true; fileName: string } | { saved: false; reason?: string }
export type Summary = ReturnType<typeof import('./analysis.js').summarise>

export interface ElectronAPI {
    runLookup(songs: string[]): Promise<LookupResult>
    cancelLookup(): Promise<void>
    onProgress(callback: (song: SongRow) => void): () => void
    exportResults(rows: SongRow[], summary: Summary, format: ExportFormat): Promise<ExportResult>
    openExternal(url: string): Promise<void>
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}
