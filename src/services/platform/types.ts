export interface VideoInfo {
    id: string
    title: string
    author: string
    coverUrl: string
    duration: number
}

export interface SubtitleSegment {
    text: string
    start: number
    end: number
}

export interface Comment {
    id: string
    user: string
    text: string
    likes: number
    date: number
    replyCount?: number
    replies?: Comment[]
}

export interface SampledComments {
    consensus: Comment[]
    controversial: Comment[]
}

export interface IPlatformService {
    /**
     * Get unique platform name (bilibili, youtube)
     */
    getPlatformName(): string

    /**
     * Detect if current page is a supported video page
     */
    detectVideo(): VideoInfo | null

    /**
     * Get subtitles for the video
     */
    getSubtitles(videoId: string): Promise<SubtitleSegment[]>

    /**
     * Get sampled comments for analysis (consensus + controversial pools).
     */
    getComments(videoId: string): Promise<SampledComments>

    /**
     * Whether this platform supports digital audio extraction for ASR
     */
    supportsDigitalASR(): boolean

    /**
     * Get direct digital audio URL if possible
     */
    getAudioUrl(videoId: string): Promise<string | null>

    /**
     * Return candidate audio URLs (primary + backups) for resilient download.
     * Defaults to [getAudioUrl()] when not overridden.
     */
    getAudioUrlCandidates?(videoId: string): Promise<string[]>

    /**
     * Control video player
     */
    seekTo(seconds: number): void
}
