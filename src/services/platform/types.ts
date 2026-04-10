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
    replies?: number
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
     * Get comments for the video
     */
    getComments(videoId: string, limit?: number): Promise<Comment[]>

    /**
     * Whether this platform supports digital audio extraction for ASR
     */
    supportsDigitalASR(): boolean

    /**
     * Get direct digital audio URL if possible
     */
    getAudioUrl(videoId: string): Promise<string | null>

    /**
     * Control video player
     */
    seekTo(seconds: number): void
}
